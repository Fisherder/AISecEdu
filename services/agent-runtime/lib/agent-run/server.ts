import type { LanguageModel, ModelMessage } from 'ai';
import { streamLLM } from '@/lib/ai/llm';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createAgentRunFactory, type AgentRunFactory } from './factory';
import { AGENT_RUN_PROTOCOL, type AgentRunEvent, type AgentRunItemKind } from './protocol';

export interface ServerAgentRunTrace {
  runId: string;
  factory: AgentRunFactory;
  emit: (event: AgentRunEvent) => void;
  startTurn: (label?: string) => string;
  completeTurn: (turnId: string, status?: 'completed' | 'failed' | 'cancelled') => void;
  startItem: (
    turnId: string | undefined,
    kind: AgentRunItemKind,
    title: string,
    options?: Parameters<AgentRunFactory['item']>[2],
  ) => string;
  delta: (
    turnId: string | undefined,
    itemId: string,
    channel: 'content' | 'output',
    delta: string,
  ) => void;
  updateItem: (
    turnId: string | undefined,
    itemId: string,
    patch: Partial<Omit<import('./protocol').AgentRunItem, 'id' | 'startedAt'>>,
  ) => void;
  completeItem: (
    turnId: string | undefined,
    itemId: string,
    options?: {
      status?: 'completed' | 'failed' | 'cancelled';
      output?: string;
      exitCode?: number;
      metadata?: Record<string, unknown>;
    },
  ) => void;
}

function createServerTrace(
  factory: AgentRunFactory,
  emit: (event: AgentRunEvent) => void,
): ServerAgentRunTrace {
  let turnSeq = 0;
  return {
    runId: factory.runId,
    factory,
    emit,
    startTurn(label) {
      const turnId = `${factory.runId}:turn-${++turnSeq}`;
      emit(factory.event({ type: 'turn.started', turnId, label }));
      return turnId;
    },
    completeTurn(turnId, status = 'completed') {
      emit(factory.event({ type: 'turn.completed', turnId, status }));
    },
    startItem(turnId, kind, title, options) {
      const item = factory.item(kind, title, options);
      emit(factory.event({ type: 'item.started', turnId, item }));
      return item.id;
    },
    delta(turnId, itemId, channel, delta) {
      if (!delta) return;
      emit(factory.event({ type: 'item.delta', turnId, itemId, channel, delta }));
    },
    updateItem(turnId, itemId, patch) {
      emit(factory.event({ type: 'item.updated', turnId, itemId, patch }));
    },
    completeItem(turnId, itemId, options = {}) {
      emit(factory.event({ type: 'item.completed', turnId, itemId, ...options }));
    },
  };
}

export function createAgentRunNdjsonResponse<T>(options: {
  label: string;
  signal?: AbortSignal;
  execute: (trace: ServerAgentRunTrace, signal: AbortSignal) => Promise<T>;
}): Response {
  const encoder = new TextEncoder();
  const factory = createAgentRunFactory();
  const executionAbort = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, executionAbort.signal])
    : executionAbort.signal;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: AgentRunEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ protocol: AGENT_RUN_PROTOCOL, event })}\n`),
          );
        } catch {
          closed = true;
          clearInterval(heartbeat);
          executionAbort.abort(new Error('Execution stream disconnected'));
        }
      };
      const trace = createServerTrace(factory, emit);
      emit(factory.event({ type: 'run.started', label: options.label }));
      heartbeat = setInterval(() => emit(factory.event({ type: 'run.heartbeat' })), 2000);
      void (async () => {
        try {
          signal.throwIfAborted();
          const result = await options.execute(trace, signal);
          signal.throwIfAborted();
          emit(factory.event({ type: 'run.completed', result }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const detail = error as { code?: unknown; errorCode?: unknown; statusCode?: unknown; failureCategory?: unknown };
          if (signal.aborted) {
            emit(factory.event({ type: 'run.cancelled', reason: message }));
          } else {
            emit(
              factory.event({
                type: 'run.failed',
                error: message,
                ...(typeof (detail.errorCode ?? detail.code) === 'string'
                  ? { code: String(detail.errorCode ?? detail.code) }
                  : {}),
                ...(typeof detail.statusCode === 'number' ? { statusCode: detail.statusCode } : {}),
                ...(['service', 'quality', 'permanent', 'internal'].includes(String(detail.failureCategory))
                  ? { failureCategory: detail.failureCategory as 'service' | 'quality' | 'permanent' | 'internal' }
                  : {}),
              }),
            );
          }
        } finally {
          clearInterval(heartbeat);
          if (!closed) controller.close();
          closed = true;
        }
      })();
    },
    cancel(reason) {
      closed = true;
      clearInterval(heartbeat);
      executionAbort.abort(reason ?? new Error('Execution stream disconnected'));
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function streamLlmTextWithAgentRun(
  params: {
    model: LanguageModel;
    system: string;
    prompt?: string;
    messages?: ModelMessage[];
    maxOutputTokens?: number;
    abortSignal?: AbortSignal;
  },
  source: string,
  thinking: ThinkingConfig | undefined,
  trace: ServerAgentRunTrace,
  label: string,
): Promise<string> {
  const turnId = trace.startTurn(label);
  let reasoningItem: string | undefined;
  let messageItem: string | undefined;
  let reasoningCompleted = false;
  let messageCompleted = false;
  let output = '';
  try {
    const result = streamLLM(
      {
        ...params,
        maxRetries: 0,
      } as Parameters<typeof streamLLM>[0],
      source,
      thinking,
    );
    for await (const rawPart of result.fullStream as AsyncIterable<Record<string, unknown>>) {
      const type = String(rawPart.type ?? '');
      if (type === 'reasoning-start' && !reasoningItem) {
        reasoningItem = trace.startItem(turnId, 'reasoning', '模型推理');
      } else if (type === 'reasoning-delta' || type === 'reasoning') {
        const delta = String(rawPart.text ?? rawPart.delta ?? '');
        if (!reasoningItem) reasoningItem = trace.startItem(turnId, 'reasoning', '模型推理');
        trace.delta(turnId, reasoningItem, 'content', delta);
      } else if (type === 'reasoning-end' && reasoningItem) {
        trace.completeItem(turnId, reasoningItem);
        reasoningCompleted = true;
      } else if (type === 'text-start' && !messageItem) {
        messageItem = trace.startItem(turnId, 'message', '生成结构化内容');
      } else if (type === 'text-end' && messageItem) {
        trace.completeItem(turnId, messageItem);
        messageCompleted = true;
      } else if (type === 'text-delta' || type === 'text') {
        const delta = String(rawPart.text ?? rawPart.delta ?? rawPart.textDelta ?? '');
        if (!messageItem) messageItem = trace.startItem(turnId, 'message', '生成结构化内容');
        output += delta;
        trace.delta(turnId, messageItem, 'content', delta);
      } else if (type === 'error') {
        throw rawPart.error instanceof Error ? rawPart.error : new Error(String(rawPart.error));
      }
    }
    if (reasoningItem && !reasoningCompleted) trace.completeItem(turnId, reasoningItem);
    if (messageItem && !messageCompleted) trace.completeItem(turnId, messageItem);
    trace.completeTurn(turnId);
    return output || (await result.text);
  } catch (error) {
    if (reasoningItem && !reasoningCompleted)
      trace.completeItem(turnId, reasoningItem, { status: 'failed' });
    if (messageItem && !messageCompleted)
      trace.completeItem(turnId, messageItem, { status: 'failed' });
    trace.completeTurn(turnId, params.abortSignal?.aborted ? 'cancelled' : 'failed');
    throw error;
  }
}
