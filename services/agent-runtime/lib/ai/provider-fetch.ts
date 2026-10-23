export type ProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ProviderTransportIdentity {
  providerId: string;
  providerType: string;
  modelId: string;
}

type TransportJournalBridge = (
  identity: ProviderTransportIdentity, transport: ProviderFetch,
  input: RequestInfo | URL, init?: RequestInit,
) => Promise<Response>;

const journaledModels = new WeakSet<object>();

export function registerTransportModel<T extends object>(model: T): T {
  journaledModels.add(model);
  return model;
}

export function hasTransportJournal(model: unknown): boolean {
  return typeof model === 'object' && model !== null && journaledModels.has(model);
}

export function providerFetch(identity: ProviderTransportIdentity, transport?: ProviderFetch): ProviderFetch {
  return (input, init) => {
    const fetch = transport ?? ((url, options) => globalThis.fetch(url, options));
    const bridge = typeof window === 'undefined'
      ? (globalThis as Record<string, unknown>).__modelTransportJournal as TransportJournalBridge | undefined
      : undefined;
    return bridge ? bridge(identity, fetch, input, init) : fetch(input, init);
  };
}
