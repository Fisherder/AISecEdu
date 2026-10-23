import type { AgentEvent } from '@earendil-works/pi-agent-core';
import type { AssistantMessageEvent, ToolCall } from '@earendil-works/pi-ai';
import { createAgentRunFactory } from './factory';
import type { AgentRunEnvelope, AgentRunEvent } from './protocol';
import { AGENT_RUN_PROTOCOL } from './protocol';

function readableToolName(name: string): string {
  return name.replaceAll('_', ' ');
}

function isCommandTool(name: string): boolean {
  return /(^|_)(exec|command|shell|terminal)(_|$)/i.test(name);
}

function resultText(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((part) =>
      part && typeof part === 'object' && (part as { type?: unknown }).type === 'text'
        ? String((part as { text?: unknown }).text ?? '')
        : '',
    )
    .filter(Boolean)
    .join('\n');
  return text || undefined;
}

export function createPiAgentRunProjector(runId: string, label: string) {
  const factory = createAgentRunFactory(runId);
  let turn = 0;
  let turnId: string | undefined;
  const contentItems = new Map<string, string>();
  const toolItems = new Map<string, string>();
  const pendingCalls = new Map<string, ToolCall>();

  const event = <T extends Parameters<typeof factory.event>[0]>(value: T): AgentRunEvent =>
    factory.event(value);
  const envelope = (
    runEvent: AgentRunEvent,
    sourceEvent: AgentEvent,
  ): AgentRunEnvelope<AgentEvent> => ({
    protocol: AGENT_RUN_PROTOCOL,
    event: runEvent,
    sourceEvent,
  });

  const messageEvents = (
    sourceEvent: AgentEvent,
    update: AssistantMessageEvent,
  ): AgentRunEvent[] => {
    if (
      update.type === 'thinking_start' ||
      update.type === 'text_start' ||
      update.type === 'toolcall_start'
    ) {
      if (update.type === 'toolcall_start') return [];
      const kind = update.type === 'thinking_start' ? 'reasoning' : 'message';
      const key = `${kind}:${turn}:${update.contentIndex}`;
      const item = factory.item(kind, kind === 'reasoning' ? '模型推理' : '生成回复', {
        id: `${runId}:${key}`,
      });
      contentItems.set(key, item.id);
      return [event({ type: 'item.started', turnId, item })];
    }
    if (update.type === 'thinking_delta' || update.type === 'text_delta') {
      const kind = update.type === 'thinking_delta' ? 'reasoning' : 'message';
      const key = `${kind}:${turn}:${update.contentIndex}`;
      const itemId = contentItems.get(key);
      return itemId
        ? [
            event({
              type: 'item.delta',
              turnId,
              itemId,
              channel: 'content',
              delta: update.delta,
            }),
          ]
        : [];
    }
    if (update.type === 'thinking_end' || update.type === 'text_end') {
      const kind = update.type === 'thinking_end' ? 'reasoning' : 'message';
      const key = `${kind}:${turn}:${update.contentIndex}`;
      const itemId = contentItems.get(key);
      return itemId ? [event({ type: 'item.completed', turnId, itemId, status: 'completed' })] : [];
    }
    if (update.type === 'toolcall_end') {
      pendingCalls.set(update.toolCall.id, update.toolCall);
    }
    if (update.type === 'error') {
      const message = update.error.errorMessage || '模型流执行失败';
      return [event({ type: 'run.failed', error: message })];
    }
    return [];
  };

  return {
    project(sourceEvent: AgentEvent): AgentRunEnvelope<AgentEvent>[] {
      let projected: AgentRunEvent[] = [];
      switch (sourceEvent.type) {
        case 'agent_start':
          projected = [event({ type: 'run.started', label })];
          break;
        case 'turn_start':
          turn += 1;
          turnId = `${runId}:turn-${turn}`;
          projected = [event({ type: 'turn.started', turnId, label: `Turn ${turn}` })];
          break;
        case 'message_update':
          projected = messageEvents(sourceEvent, sourceEvent.assistantMessageEvent);
          break;
        case 'tool_execution_start': {
          const pending = pendingCalls.get(sourceEvent.toolCallId);
          const input = (pending?.arguments ?? sourceEvent.args) as Record<string, unknown>;
          const commandTool = isCommandTool(sourceEvent.toolName);
          const item = factory.item(
            commandTool ? 'command' : 'tool',
            readableToolName(sourceEvent.toolName),
            {
              id: `${runId}:tool:${sourceEvent.toolCallId}`,
              input,
              subtitle: sourceEvent.toolName,
              ...(commandTool
                ? {
                    command: String(input?.cmd ?? input?.command ?? ''),
                    cwd: typeof input?.cwd === 'string' ? input.cwd : undefined,
                  }
                : {}),
            },
          );
          toolItems.set(sourceEvent.toolCallId, item.id);
          projected = [event({ type: 'item.started', turnId, item })];
          break;
        }
        case 'tool_execution_update': {
          const itemId = toolItems.get(sourceEvent.toolCallId);
          if (itemId) {
            projected = [
              event({
                type: 'item.updated',
                turnId,
                itemId,
                patch: {
                  output: resultText(sourceEvent.partialResult),
                  metadata: { partialResult: sourceEvent.partialResult },
                },
              }),
            ];
          }
          break;
        }
        case 'tool_execution_end': {
          const itemId = toolItems.get(sourceEvent.toolCallId);
          if (itemId) {
            projected = [
              event({
                type: 'item.completed',
                turnId,
                itemId,
                status: sourceEvent.isError ? 'failed' : 'completed',
                output: resultText(sourceEvent.result),
                exitCode:
                  typeof (sourceEvent.result as { details?: { exitCode?: unknown } })?.details
                    ?.exitCode === 'number'
                    ? (sourceEvent.result as { details: { exitCode: number } }).details.exitCode
                    : undefined,
                metadata: { result: sourceEvent.result },
              }),
            ];
          }
          break;
        }
        case 'turn_end':
          projected = [event({ type: 'turn.completed', turnId })];
          break;
        case 'agent_end':
          projected = [event({ type: 'run.completed' })];
          break;
        default:
          break;
      }
      return projected.map((runEvent) => envelope(runEvent, sourceEvent));
    },
  };
}
