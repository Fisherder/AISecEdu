import { createHash } from 'node:crypto';
import type { ActiveModelCall, ModelCallJournalEventType } from './model-call-journal';
import type { ProviderFetch, ProviderTransportIdentity } from './provider-fetch';

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_FRAME_BYTES = 64 * 1024;
const MAX_FRAMES = 4096;
const MAX_TRANSPORTS = 100;
const SAFE_HEADERS = new Set([
  'accept', 'content-type', 'content-length', 'content-encoding',
  'anthropic-version', 'anthropic-beta', 'api-version',
  'x-request-id', 'request-id', 'openai-processing-ms', 'retry-after',
]);

export interface ProviderTransportState {
  count: number;
  unfinished: Set<string>;
}

function safeHeaders(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    if (SAFE_HEADERS.has(key)) result[key] = value.slice(0, 2000);
  });
  return result;
}

function safeUrl(input: RequestInfo | URL): string {
  const url = new URL(input instanceof Request ? input.url : String(input));
  url.username = '';
  url.password = '';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (!['alt', 'api-version'].includes(key)) url.searchParams.set(key, '[redacted]');
  }
  return url.toString();
}

function requestBytes(input: RequestInfo | URL, init?: RequestInit): Buffer {
  const body = init?.body;
  if (body == null) {
    if (input instanceof Request && input.body) throw new Error('Journaled provider requests require an explicit bounded body');
    return Buffer.alloc(0);
  }
  const bytes = typeof body === 'string' ? Buffer.from(body)
    : body instanceof ArrayBuffer ? Buffer.from(body)
      : ArrayBuffer.isView(body) ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
        : undefined;
  if (!bytes) throw new Error('Unsupported journaled provider request body');
  if (bytes.byteLength > MAX_REQUEST_BYTES) throw new Error('Provider request exceeds the durable byte limit');
  return bytes;
}

export async function journalProviderTransport(
  active: ActiveModelCall, identity: ProviderTransportIdentity, transport: ProviderFetch,
  input: RequestInfo | URL, init?: RequestInit,
): Promise<Response> {
  const state = active.transports ??= { count: 0, unfinished: new Set() };
  const ordinal = ++state.count;
  if (ordinal > MAX_TRANSPORTS) {
    active.journalFailure = new Error('Model call exceeds the durable transport limit');
    throw active.journalFailure;
  }
  const callId = `${active.callId}:http:${ordinal}`;
  const common = { parentCallId: active.callId, transportNumber: ordinal };
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const write = async (type: ModelCallJournalEventType, key: string, detail: Record<string, unknown>) => {
    try { await active.journal.write(type, key, { ...common, ...detail }); }
    catch (error) { active.journalFailure = error; throw error; }
  };
  let bytes: Buffer;
  try { bytes = requestBytes(input, init); }
  catch (error) { active.journalFailure = error; throw error; }
  signal?.throwIfAborted();
  await write('provider.request', callId, {
    ...identity,
    url: safeUrl(input), method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
    headers: safeHeaders(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
    bodyBase64: bytes.toString('base64'), byteLength: bytes.byteLength,
    bodySha256: createHash('sha256').update(bytes).digest('hex'), bodyEncoding: 'base64',
  });
  state.unfinished.add(callId);
  const hash = createHash('sha256');
  let byteLength = 0;
  let frames = 0;
  let finished = false;
  const finish = async (status: 'completed' | 'failed' | 'cancelled', error?: unknown) => {
    if (finished) return;
    finished = true;
    await write('provider.finished', callId, {
      status, chunksCount: frames, byteLength, bodySha256: hash.copy().digest('hex'),
      ...(error ? { errorType: error instanceof Error ? error.name : 'UnknownError' } : {}),
    });
    state.unfinished.delete(callId);
  };
  let response: Response | undefined;
  try {
    signal?.throwIfAborted();
    response = await transport(input, init);
    await write('provider.response', callId, {
      status: response.status, headers: safeHeaders(response.headers),
      bodyEncoding: 'base64', bodySemantics: 'fetch-decoded-body',
    });
  } catch (error) {
    await response?.body?.cancel().catch(() => {});
    if (!active.journalFailure) await finish(signal?.aborted ? 'cancelled' : 'failed', error);
    throw error;
  }
  if (!response.body) { await finish('completed'); return response; }
  const reader = response.body.getReader();
  let pending: Uint8Array | undefined;
  let pendingOffset = 0;
  let cancelled = false;
  let pulling: Promise<void> | undefined;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulling = (async () => {
      try {
        signal?.throwIfAborted();
        if (!pending || pendingOffset === pending.byteLength) {
          const chunk = await reader.read();
          if (cancelled) return;
          if (chunk.done) { await finish('completed'); controller.close(); return; }
          pending = chunk.value;
          pendingOffset = 0;
          if (byteLength + pending.byteLength > MAX_RESPONSE_BYTES)
            throw new Error('Provider response exceeds the durable byte limit');
        }
        if (frames >= MAX_FRAMES) throw new Error('Provider response exceeds the durable frame limit');
        const frame = Buffer.from(pending.subarray(pendingOffset, pendingOffset + MAX_FRAME_BYTES));
        const offset = byteLength;
        await write('provider.chunk', `${callId}:chunk:${frames + 1}`, {
          chunkNumber: frames + 1, offset, byteLength: frame.byteLength,
          bodyBase64: frame.toString('base64'), bodySha256: createHash('sha256').update(frame).digest('hex'),
        });
        pendingOffset += frame.byteLength;
        hash.update(frame);
        byteLength += frame.byteLength;
        frames++;
        if (cancelled) return;
        signal?.throwIfAborted();
        controller.enqueue(frame);
      } catch (error) {
        await reader.cancel().catch(() => {});
        pending = undefined;
        try { if (!active.journalFailure) await finish(signal?.aborted ? 'cancelled' : 'failed', error); }
        catch (journalError) { error = journalError; }
        controller.error(error);
      }
      })();
      return pulling;
    },
    async cancel(reason) {
      cancelled = true;
      await reader.cancel(reason).catch(() => {});
      await pulling;
      pending = undefined;
      if (!active.journalFailure) await finish('cancelled', reason);
    },
  }, { highWaterMark: 0 });
  const captured = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  for (const key of ['url', 'redirected', 'type'] as const)
    Object.defineProperty(captured, key, { value: response[key] });
  return captured;
}
