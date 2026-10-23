import type { AgentRunEvent, AgentRunItem, AgentRunStatus } from './protocol';

export interface AgentRunTurn {
  id: string;
  label?: string;
  status: AgentRunStatus;
  startedAt: number;
  completedAt?: number;
  itemIds: string[];
}

export interface AgentRunState {
  runId: string;
  label: string;
  status: AgentRunStatus;
  startedAt: number;
  completedAt?: number;
  lastSeq: number;
  turns: AgentRunTurn[];
  itemOrder: string[];
  items: Record<string, AgentRunItem>;
  error?: string;
}

export const EMPTY_AGENT_RUN_STATE: AgentRunState = {
  runId: '',
  label: '',
  status: 'completed',
  startedAt: 0,
  lastSeq: -1,
  turns: [],
  itemOrder: [],
  items: {},
};

function finishItem(item: AgentRunItem, event: Extract<AgentRunEvent, { type: 'item.completed' }>) {
  return {
    ...item,
    status: event.status ?? 'completed',
    completedAt: event.time,
    durationMs: Math.max(0, event.time - item.startedAt),
    ...(event.output === undefined ? {} : { output: event.output }),
    ...(event.exitCode === undefined ? {} : { exitCode: event.exitCode }),
    ...(event.metadata === undefined ? {} : { metadata: { ...item.metadata, ...event.metadata } }),
  } satisfies AgentRunItem;
}

export function reduceAgentRun(state: AgentRunState, event: AgentRunEvent): AgentRunState {
  if (event.runId === state.runId && event.seq <= state.lastSeq) return state;
  if (event.type !== 'run.started' && state.runId && event.runId !== state.runId) return state;
  if (event.type !== 'run.started' && event.seq <= state.lastSeq) return state;

  if (event.type === 'run.started') {
    return {
      runId: event.runId,
      label: event.label,
      status: 'running',
      startedAt: event.time,
      lastSeq: event.seq,
      turns: [],
      itemOrder: [],
      items: {},
    };
  }

  const next = { ...state, lastSeq: event.seq };
  if (event.type === 'turn.started') {
    if (next.turns.some((turn) => turn.id === event.turnId)) return next;
    return {
      ...next,
      turns: [
        ...next.turns,
        {
          id: event.turnId ?? `turn-${next.turns.length + 1}`,
          label: event.label,
          status: 'running',
          startedAt: event.time,
          itemIds: [],
        },
      ],
    };
  }

  if (event.type === 'item.started') {
    const exists = !!next.items[event.item.id];
    const items = { ...next.items, [event.item.id]: exists ? next.items[event.item.id] : { ...event.item } };
    const itemOrder = exists ? next.itemOrder : [...next.itemOrder, event.item.id];
    const turns = next.turns.map((turn) =>
      turn.id === event.turnId && !turn.itemIds.includes(event.item.id)
        ? { ...turn, itemIds: [...turn.itemIds, event.item.id] }
        : turn,
    );
    return { ...next, items, itemOrder, turns };
  }

  if (event.type === 'item.delta') {
    const item = next.items[event.itemId];
    if (!item) return next;
    const field = event.channel;
    return {
      ...next,
      items: {
        ...next.items,
        [event.itemId]: { ...item, [field]: `${item[field] ?? ''}${event.delta}` },
      },
    };
  }

  if (event.type === 'item.updated') {
    const item = next.items[event.itemId];
    if (!item) return next;
    const { id: _id, startedAt: _startedAt, ...safePatch } = event.patch as Partial<AgentRunItem>;
    return {
      ...next,
      items: {
        ...next.items,
        [event.itemId]: {
          ...item,
          ...safePatch,
          metadata: event.patch.metadata
            ? { ...item.metadata, ...event.patch.metadata }
            : item.metadata,
        },
      },
    };
  }

  if (event.type === 'item.completed') {
    const item = next.items[event.itemId];
    if (!item) return next;
    return {
      ...next,
      items: { ...next.items, [event.itemId]: finishItem(item, event) },
    };
  }

  if (event.type === 'turn.completed') {
    return {
      ...next,
      turns: next.turns.map((turn) =>
        turn.id === event.turnId
          ? {
              ...turn,
              status: event.status ?? 'completed',
              completedAt: event.time,
            }
          : turn,
      ),
    };
  }

  if (event.type === 'run.completed') {
    return { ...next, status: 'completed', completedAt: event.time };
  }
  if (event.type === 'run.failed') {
    return { ...next, status: 'failed', completedAt: event.time, error: event.error };
  }
  if (event.type === 'run.cancelled') {
    return { ...next, status: 'cancelled', completedAt: event.time };
  }
  return next;
}
