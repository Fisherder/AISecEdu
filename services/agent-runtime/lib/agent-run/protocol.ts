export const AGENT_RUN_PROTOCOL = 'aisecedu.agent-run.v1' as const;

export type AgentRunStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type AgentRunItemKind =
  | 'model'
  | 'reasoning'
  | 'message'
  | 'tool'
  | 'command'
  | 'workflow'
  | 'artifact';

export interface AgentRunItem {
  id: string;
  kind: AgentRunItemKind;
  title: string;
  status: AgentRunStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  subtitle?: string;
  content?: string;
  input?: unknown;
  output?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  metadata?: Record<string, unknown>;
}

interface AgentRunEventBase {
  protocol: typeof AGENT_RUN_PROTOCOL;
  runId: string;
  seq: number;
  time: number;
  turnId?: string;
}

export type AgentRunEvent =
  | (AgentRunEventBase & { type: 'run.started'; label: string })
  | (AgentRunEventBase & { type: 'run.heartbeat' })
  | (AgentRunEventBase & { type: 'turn.started'; label?: string })
  | (AgentRunEventBase & { type: 'item.started'; item: AgentRunItem })
  | (AgentRunEventBase & {
      type: 'item.delta';
      itemId: string;
      channel: 'content' | 'output';
      delta: string;
    })
  | (AgentRunEventBase & {
      type: 'item.updated';
      itemId: string;
      patch: Partial<Omit<AgentRunItem, 'id' | 'startedAt'>>;
    })
  | (AgentRunEventBase & {
      type: 'item.completed';
      itemId: string;
      status?: Exclude<AgentRunStatus, 'running'>;
      output?: string;
      exitCode?: number;
      metadata?: Record<string, unknown>;
    })
  | (AgentRunEventBase & { type: 'turn.completed'; status?: AgentRunStatus })
  | (AgentRunEventBase & { type: 'run.completed'; result?: unknown })
  | (AgentRunEventBase & {
      type: 'run.failed';
      error: string;
      code?: string;
      statusCode?: number;
      failureCategory?: 'service' | 'quality' | 'permanent' | 'internal';
    })
  | (AgentRunEventBase & { type: 'run.cancelled'; reason?: string });

export interface AgentRunEnvelope<TSource = unknown> {
  protocol: typeof AGENT_RUN_PROTOCOL;
  event: AgentRunEvent;
  sourceEvent?: TSource;
}

export function isAgentRunEvent(value: unknown): value is AgentRunEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<AgentRunEvent>;
  return (
    event.protocol === AGENT_RUN_PROTOCOL &&
    typeof event.type === 'string' &&
    typeof event.runId === 'string' &&
    typeof event.seq === 'number' &&
    typeof event.time === 'number'
  );
}

export function isAgentRunEnvelope(value: unknown): value is AgentRunEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<AgentRunEnvelope>;
  return envelope.protocol === AGENT_RUN_PROTOCOL && isAgentRunEvent(envelope.event);
}
