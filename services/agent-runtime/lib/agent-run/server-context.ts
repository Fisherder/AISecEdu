import { AsyncLocalStorage } from 'node:async_hooks';
import type { ServerAgentRunTrace } from './server';

const storage = new AsyncLocalStorage<ServerAgentRunTrace>();

export function withServerAgentRunTrace<T>(
  trace: ServerAgentRunTrace,
  execute: () => Promise<T>,
): Promise<T> {
  return storage.run(trace, execute);
}

export function getServerAgentRunTrace(): ServerAgentRunTrace | undefined {
  return storage.getStore();
}
