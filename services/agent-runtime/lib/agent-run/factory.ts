import {
  AGENT_RUN_PROTOCOL,
  type AgentRunEvent,
  type AgentRunItem,
  type AgentRunItemKind,
} from './protocol';

export interface AgentRunFactory {
  runId: string;
  event<T extends Omit<AgentRunEvent, 'protocol' | 'runId' | 'seq' | 'time'>>(
    value: T,
  ): AgentRunEvent;
  item(
    kind: AgentRunItemKind,
    title: string,
    options?: Partial<Omit<AgentRunItem, 'id' | 'kind' | 'title' | 'status' | 'startedAt'>> & {
      id?: string;
    },
  ): AgentRunItem;
}

export function createAgentRunFactory(runId = crypto.randomUUID()): AgentRunFactory {
  let seq = 0;
  let itemSeq = 0;
  return {
    runId,
    event(value) {
      return {
        ...value,
        protocol: AGENT_RUN_PROTOCOL,
        runId,
        seq: seq++,
        time: Date.now(),
      } as AgentRunEvent;
    },
    item(kind, title, options = {}) {
      const { id, ...rest } = options;
      return {
        id: id ?? `${runId}:item-${++itemSeq}`,
        kind,
        title,
        status: 'running',
        startedAt: Date.now(),
        ...rest,
      };
    },
  };
}
