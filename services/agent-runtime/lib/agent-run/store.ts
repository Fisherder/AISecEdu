'use client';

import { create } from 'zustand';
import { createAgentRunFactory, type AgentRunFactory } from './factory';
import { EMPTY_AGENT_RUN_STATE, reduceAgentRun, type AgentRunState } from './reducer';
import type { AgentRunEvent, AgentRunItemKind } from './protocol';

interface ChannelRuntime {
  factory: AgentRunFactory;
  activeWorkflowId?: string;
  activeTurnId?: string;
}

type DeltaEvent = Extract<AgentRunEvent, { type: 'item.delta' }>;
interface PendingDeltas {
  timer?: ReturnType<typeof setTimeout>;
  events: Map<string, DeltaEvent>;
}

interface AgentRunStore {
  runs: Record<string, AgentRunState | undefined>;
  emit: (channel: string, event: AgentRunEvent) => void;
  clear: (channel: string) => void;
}

const runtimes = new Map<string, ChannelRuntime>();
const pendingDeltas = new Map<string, PendingDeltas>();

function flushAgentRunDeltas(channel: string): void {
  const pending = pendingDeltas.get(channel);
  if (!pending) return;
  if (pending.timer) clearTimeout(pending.timer);
  pendingDeltas.delete(channel);
  const events = [...pending.events.values()].sort((left, right) => left.seq - right.seq);
  for (const event of events) useAgentRunStore.getState().emit(channel, event);
}

function bufferAgentRunDelta(channel: string, event: DeltaEvent): void {
  let pending = pendingDeltas.get(channel);
  if (!pending) {
    pending = { events: new Map() };
    pendingDeltas.set(channel, pending);
  }
  const key = `${event.runId}:${event.itemId}:${event.channel}`;
  const previous = pending.events.get(key);
  pending.events.set(key, {
    ...event,
    delta: `${previous?.delta ?? ''}${event.delta}`,
  });
  if (!pending.timer) {
    pending.timer = setTimeout(() => flushAgentRunDeltas(channel), 50);
  }
}

export const useAgentRunStore = create<AgentRunStore>((set) => ({
  runs: {},
  emit: (channel, event) =>
    set((state) => ({
      runs: {
        ...state.runs,
        [channel]: reduceAgentRun(state.runs[channel] ?? EMPTY_AGENT_RUN_STATE, event),
      },
    })),
  clear: (channel) => {
    const pending = pendingDeltas.get(channel);
    if (pending?.timer) clearTimeout(pending.timer);
    pendingDeltas.delete(channel);
    runtimes.delete(channel);
    set((state) => ({ runs: { ...state.runs, [channel]: undefined } }));
  },
}));

export function beginAgentRun(channel: string, label: string, runId?: string): AgentRunFactory {
  const factory = createAgentRunFactory(runId);
  runtimes.set(channel, { factory });
  useAgentRunStore.getState().emit(channel, factory.event({ type: 'run.started', label }));
  return factory;
}

export function emitAgentRunEvent(channel: string, event: AgentRunEvent): void {
  if (event.type === 'item.delta') {
    bufferAgentRunDelta(channel, event);
    return;
  }
  flushAgentRunDeltas(channel);
  useAgentRunStore.getState().emit(channel, event);
}

export function ingestAgentRunEvent(channel: string, event: AgentRunEvent): void {
  const runtime = runtimes.get(channel);
  if (!runtime) {
    emitAgentRunEvent(channel, event);
    return;
  }
  if (event.type === 'run.started' || event.type === 'run.completed') return;
  if (event.type === 'run.failed') {
    const itemId = startAgentRunItem(channel, 'tool', '子任务失败', {
      subtitle: event.runId,
      output: event.error,
    });
    completeAgentRunItem(channel, itemId, { status: 'failed', output: event.error });
    return;
  }
  if (event.type === 'run.cancelled') return;
  const { protocol: _protocol, runId: _runId, seq: _seq, time: _time, ...payload } = event;
  emitAgentRunEvent(channel, runtime.factory.event(payload));
}

export function startAgentRunTurn(channel: string, label?: string): string | undefined {
  const runtime = runtimes.get(channel);
  if (!runtime) return undefined;
  const turnId = `${runtime.factory.runId}:turn-${Date.now()}`;
  runtime.activeTurnId = turnId;
  useAgentRunStore
    .getState()
    .emit(channel, runtime.factory.event({ type: 'turn.started', turnId, label }));
  return turnId;
}

export function startAgentRunItem(
  channel: string,
  kind: AgentRunItemKind,
  title: string,
  options: Parameters<AgentRunFactory['item']>[2] = {},
): string | undefined {
  const runtime = runtimes.get(channel);
  if (!runtime) return undefined;
  const item = runtime.factory.item(kind, title, options);
  useAgentRunStore.getState().emit(
    channel,
    runtime.factory.event({
      type: 'item.started',
      turnId: runtime.activeTurnId,
      item,
    }),
  );
  return item.id;
}

export function completeAgentRunItem(
  channel: string,
  itemId: string | undefined,
  options: Omit<
    Extract<AgentRunEvent, { type: 'item.completed' }>,
    'protocol' | 'runId' | 'seq' | 'time' | 'type' | 'itemId' | 'turnId'
  > = {},
): void {
  const runtime = runtimes.get(channel);
  if (!runtime || !itemId) return;
  useAgentRunStore.getState().emit(
    channel,
    runtime.factory.event({
      type: 'item.completed',
      turnId: runtime.activeTurnId,
      itemId,
      ...options,
    }),
  );
}

export function transitionAgentWorkflow(channel: string, title: string, subtitle?: string): void {
  const runtime = runtimes.get(channel);
  if (!runtime) return;
  completeAgentRunItem(channel, runtime.activeWorkflowId);
  runtime.activeWorkflowId = startAgentRunItem(channel, 'workflow', title, { subtitle });
}

export function completeAgentRun(channel: string): void {
  const runtime = runtimes.get(channel);
  if (!runtime) return;
  completeAgentRunItem(channel, runtime.activeWorkflowId);
  if (runtime.activeTurnId) {
    useAgentRunStore
      .getState()
      .emit(
        channel,
        runtime.factory.event({ type: 'turn.completed', turnId: runtime.activeTurnId }),
      );
  }
  useAgentRunStore.getState().emit(channel, runtime.factory.event({ type: 'run.completed' }));
}

export function failAgentRun(channel: string, error: string): void {
  const runtime = runtimes.get(channel);
  if (!runtime) return;
  completeAgentRunItem(channel, runtime.activeWorkflowId, { status: 'failed', output: error });
  useAgentRunStore.getState().emit(channel, runtime.factory.event({ type: 'run.failed', error }));
}

export function cancelAgentRun(channel: string, reason?: string): void {
  const runtime = runtimes.get(channel);
  if (!runtime) return;
  completeAgentRunItem(channel, runtime.activeWorkflowId, { status: 'cancelled' });
  useAgentRunStore
    .getState()
    .emit(channel, runtime.factory.event({ type: 'run.cancelled', reason }));
}
