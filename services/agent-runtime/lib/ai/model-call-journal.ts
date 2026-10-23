/** Per-request durable callback for model calls made by an agent job. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { journalProviderTransport, type ProviderTransportState } from './provider-transport-journal';
import type { ProviderFetch, ProviderTransportIdentity } from './provider-fetch';

export type ModelCallJournalEventType =
  | 'model.requested' | 'model.step' | 'model.settled' | 'model.failed'
  | 'tool.call' | 'tool.result'
  | 'provider.request' | 'provider.response' | 'provider.chunk' | 'provider.finished';

export interface ModelCallJournal {
  nextCallId(): string;
  write(type: ModelCallJournalEventType, callId: string, detail: Record<string, unknown>): Promise<void>;
}

const context = new AsyncLocalStorage<ModelCallJournal>();
const modelCallContext = new AsyncLocalStorage<ActiveModelCall>();

export interface ActiveModelCall {
  callId: string;
  journal: ModelCallJournal;
  journalFailure?: unknown;
  transports?: ProviderTransportState;
}

(globalThis as Record<string, unknown>).__modelTransportJournal = (
  identity: ProviderTransportIdentity, transport: ProviderFetch, input: RequestInfo | URL, init?: RequestInit,
) => {
  const active = modelCallContext.getStore();
  return active ? journalProviderTransport(active, identity, transport, input, init) : transport(input, init);
};

export function currentModelCallJournal(): ModelCallJournal | undefined {
  return context.getStore();
}

export function withModelCallJournal<T>(journal: ModelCallJournal, operation: () => Promise<T>): Promise<T> {
  return context.run(journal, operation);
}

export function withActiveModelCall<T>(call: ActiveModelCall, operation: () => Promise<T>): Promise<T> {
  return modelCallContext.run(call, operation);
}

export function journaledToolCall<T>(
  toolName: string,
  providerCallId: string,
  input: Record<string, unknown>,
  execute: () => Promise<T>,
): Promise<T> {
  const active = modelCallContext.getStore();
  if (!active) return execute();

  // The provider's ID is retained in the event, while a bounded digest keeps
  // the database key stable even when a provider emits a long or unusual ID.
  const suffix = createHash('sha256').update(`${toolName}\0${providerCallId}`).digest('hex').slice(0, 32);
  const callId = `${active.callId}:tool:${suffix}`;
  const common = { parentCallId: active.callId, toolCallId: providerCallId, toolName };
  const write = async (type: ModelCallJournalEventType, detail: Record<string, unknown>) => {
    try {
      await active.journal.write(type, callId, detail);
    } catch (error) {
      // AI SDK can turn an execute() exception into a tool-error result. The
      // outer model call checks this flag before recording model.settled.
      active.journalFailure = error;
      throw error;
    }
  };

  return (async () => {
    await write('tool.call', { ...common, input });
    try {
      const result = await execute();
      await write('tool.result', { ...common, status: 'succeeded', result });
      return result;
    } catch (error) {
      if (active.journalFailure) throw error;
      await write('tool.result', {
        ...common,
        status: 'failed',
        errorType: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message.slice(0, 2000) : String(error).slice(0, 2000),
      });
      throw error;
    }
  })();
}
