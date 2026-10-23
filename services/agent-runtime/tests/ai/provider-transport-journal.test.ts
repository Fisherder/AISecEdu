import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateText } from 'ai';
import { journalProviderTransport } from '@/lib/ai/provider-transport-journal';
import { providerFetch } from '@/lib/ai/provider-fetch';
import { getModel } from '@/lib/ai/providers';
import { withActiveModelCall, type ActiveModelCall } from '@/lib/ai/model-call-journal';

const identity = { providerId: 'deepseek', providerType: 'openai', modelId: 'test' };
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const fixture = () => {
  const events: { type: string; id: string; detail: Record<string, any> }[] = [];
  const active: ActiveModelCall = { callId: 'job_qa:1:1', journal: {
    nextCallId: () => '', write: async (type, id, detail) => { events.push({ type, id, detail }); },
  } };
  return { active, events };
};
const bytesOf = (events: ReturnType<typeof fixture>['events']) => Buffer.concat(
  events.filter(e => e.type === 'provider.chunk').map(e => Buffer.from(e.detail.bodyBase64, 'base64')),
);

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('provider transport durability', () => {
  it('records the effective request before sending and byte-exact UTF-8 fragments before consumption', async () => {
    const { active, events } = fixture();
    const expected = Buffer.from('data: {"text":"概率论🧪"}\n\n');
    let sourceReads = 0;
    const source = new ReadableStream<Uint8Array>({ pull(controller) {
      if (sourceReads++ === 0) controller.enqueue(expected.subarray(0, 22));
      else if (sourceReads === 2) controller.enqueue(expected.subarray(22));
      else controller.close();
    } }, { highWaterMark: 0 });
    const fetch = vi.fn(async () => {
      expect(events.map(e => e.type)).toEqual(['provider.request']);
      return new Response(source, { headers: { 'content-type': 'text/event-stream', 'set-cookie': 'private', 'x-request-id': 'id1' } });
    });
    const request = '{"stream":true,"thinking":{"type":"disabled"},"prompt":"概率"}';
    const response = await journalProviderTransport(active, identity, fetch,
      'https://user:password@provider.example/v1/chat?key=secret&alt=sse#private',
      { method: 'POST', body: request, headers: { authorization: 'Bearer private', 'x-api-key': 'private', cookie: 'private', 'content-type': 'application/json' } });
    expect(sourceReads).toBe(0);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(events.at(-1)?.type).toBe('provider.chunk');
    expect(events.some(e => e.type === 'provider.finished')).toBe(false);
    await reader.read(); await reader.read();
    expect(bytesOf(events)).toEqual(expected);
    expect(events[0].detail.bodySha256).toBe(hash(request));
    expect(Buffer.from(events[0].detail.bodyBase64, 'base64').toString()).toBe(request);
    expect(events[0].detail.url).not.toMatch(/secret|password|user|private/);
    expect(events[0].detail.headers).toEqual({ 'content-type': 'application/json' });
    expect(events[1].detail.headers).toEqual({ 'content-type': 'text/event-stream', 'x-request-id': 'id1' });
    expect(events.at(-1)?.detail).toMatchObject({ status: 'completed', chunksCount: 2, byteLength: expected.length, bodySha256: hash(expected) });
    expect(active.transports?.unfinished.size).toBe(0);
  });

  it('preserves HTTP error bytes instead of turning them into a successful model result', async () => {
    const { active, events } = fixture();
    const response = await journalProviderTransport(active, identity, async () => new Response('{"error":"overloaded"}', { status: 503 }),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' });
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"overloaded"}');
    expect(events[1].detail.status).toBe(503);
    expect(events.at(-1)?.detail.status).toBe('completed');
  });

  it('records a failed response prefix without fabricating EOF', async () => {
    const { active, events } = fixture();
    let reads = 0;
    const source = new ReadableStream<Uint8Array>({ pull(controller) {
      if (reads++ === 0) controller.enqueue(Buffer.from('first'));
      else controller.error(new TypeError('socket error with secret'));
    } }, { highWaterMark: 0 });
    const response = await journalProviderTransport(active, identity, async () => new Response(source),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' });
    await expect(response.text()).rejects.toThrow('socket error');
    expect(bytesOf(events).toString()).toBe('first');
    expect(events.at(-1)?.detail).toMatchObject({ status: 'failed', chunksCount: 1, bodySha256: hash('first'), errorType: 'TypeError' });
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('cancels the upstream reader and seals only the received prefix', async () => {
    const { active, events } = fixture();
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(Buffer.from('one')); }, cancel }, { highWaterMark: 0 });
    const response = await journalProviderTransport(active, identity, async () => new Response(source),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' });
    const reader = response.body!.getReader(); await reader.read(); await reader.cancel('stop');
    expect(cancel).toHaveBeenCalledOnce();
    expect(events.at(-1)?.detail).toMatchObject({ status: 'cancelled', chunksCount: 1, byteLength: 3 });
    expect(active.transports?.unfinished.size).toBe(0);
  });

  it('blocks the request when its durable write fails', async () => {
    const { active } = fixture(); const fetch = vi.fn();
    active.journal.write = async () => { throw new Error('journal unavailable'); };
    await expect(journalProviderTransport(active, identity, fetch, 'https://provider.example/v1/chat', { method: 'POST', body: '{}' })).rejects.toThrow('journal unavailable');
    expect(fetch).not.toHaveBeenCalled(); expect(active.journalFailure).toBeInstanceOf(Error);
  });

  it('waits for an in-flight chunk write before sealing reader cancellation', async () => {
    const { active, events } = fixture();
    let entered!: () => void; let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const write = active.journal.write;
    active.journal.write = async (type, id, detail) => {
      if (type === 'provider.chunk') { entered(); await barrier; }
      await write(type, id, detail);
    };
    const response = await journalProviderTransport(active, identity, async () => new Response('received'),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' });
    const reader = response.body!.getReader(); const reading = reader.read();
    await started; const cancelling = reader.cancel();
    expect(events.some(e => e.type === 'provider.finished')).toBe(false);
    release(); await Promise.all([reading, cancelling]);
    expect(events.at(-1)?.detail).toMatchObject({ status: 'cancelled', chunksCount: 1, byteLength: 8, bodySha256: hash('received') });
    expect(active.journalFailure).toBeUndefined();
  });

  it('cancels the response body if saving response headers fails', async () => {
    const { active } = fixture(); const cancel = vi.fn();
    const write = active.journal.write;
    active.journal.write = async (type, id, detail) => {
      if (type === 'provider.response') throw new Error('header write failed');
      await write(type, id, detail);
    };
    const source = new ReadableStream<Uint8Array>({ cancel });
    await expect(journalProviderTransport(active, identity, async () => new Response(source),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' })).rejects.toThrow('header write failed');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('does not deliver an unrecorded response chunk or hide a callback failure', async () => {
    const { active, events } = fixture(); const cancel = vi.fn();
    const original = active.journal.write;
    active.journal.write = async (type, id, detail) => {
      if (type === 'provider.chunk') throw new Error('chunk write failed');
      await original(type, id, detail);
    };
    const source = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(Buffer.from('unrecorded')); }, cancel }, { highWaterMark: 0 });
    const response = await journalProviderTransport(active, identity, async () => new Response(source),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' });
    await expect(response.body!.getReader().read()).rejects.toThrow('chunk write failed');
    expect(cancel).toHaveBeenCalledOnce(); expect(bytesOf(events).length).toBe(0);
    expect(active.journalFailure).toBeInstanceOf(Error);
    expect(events.some(e => e.type === 'provider.finished')).toBe(false);
  });

  it('splits large network chunks into bounded durable frames', async () => {
    const { active, events } = fixture(); const expected = Buffer.alloc(180000, 173);
    const response = await journalProviderTransport(active, identity, async () => new Response(expected),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' });
    expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
    const chunks = events.filter(e => e.type === 'provider.chunk');
    expect(chunks.map(e => e.detail.byteLength)).toEqual([65536, 65536, 48928]);
    expect(chunks.map(e => e.detail.offset)).toEqual([0, 65536, 131072]);
    expect(bytesOf(events)).toEqual(expected);
  });

  it('rejects oversized requests before network activity and response limits explicitly', async () => {
    const first = fixture(); const fetch = vi.fn();
    await expect(journalProviderTransport(first.active, identity, fetch, 'https://provider.example/v1/chat',
      { method: 'POST', body: 'a'.repeat(4 * 1024 * 1024 + 1) })).rejects.toThrow('byte limit');
    expect(fetch).not.toHaveBeenCalled();
    const second = fixture();
    const response = await journalProviderTransport(second.active, identity, async () => new Response(Buffer.alloc(32 * 1024 * 1024 + 1)),
      'https://provider.example/v1/chat', { method: 'POST', body: '{}' });
    await expect(response.text()).rejects.toThrow('byte limit');
    expect(second.events.at(-1)?.detail).toMatchObject({ status: 'failed', byteLength: 0 });
  });

  it('keeps concurrent model contexts and physical request ordinals separate', async () => {
    const one = fixture(); const two = fixture(); two.active.callId = 'job_qa:1:2';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')));
    const fetch = providerFetch(identity);
    await Promise.all([one, two].map(({ active }) => withActiveModelCall(active, async () => {
      for (let i = 0; i < 2; i++) await (await fetch('https://provider.example/v1/chat', { method: 'POST', body: '{}' })).text();
    })));
    for (const target of [one, two])
      expect(target.events.filter(e => e.type === 'provider.request').map(e => e.id)).toEqual([`${target.active.callId}:http:1`, `${target.active.callId}:http:2`]);
  });

  it('passes through non-job calls without storing or consuming their body', async () => {
    const fetch = vi.fn(async () => new Response('ok')); vi.stubGlobal('fetch', fetch);
    const response = await providerFetch(identity)('https://provider.example/v1/chat');
    expect(response.bodyUsed).toBe(false); expect(await response.text()).toBe('ok');
  });

  it('captures actual HTTP fragments before server EOF, with the request the server received', async () => {
    const { active, events } = fixture(); let end!: () => void; let received = '';
    const server = createServer(async (request, response) => {
      for await (const chunk of request) received += chunk.toString();
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: first\n\n'); end = () => response.end('data: last\n\n');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    try {
      const response = await withActiveModelCall(active, () => providerFetch(identity)(`http://127.0.0.1:${address.port}/chat`, { method: 'POST', body: '{"actual":true}' }));
      const reader = response.body!.getReader(); const first = await reader.read();
      expect(Buffer.from(first.value!).toString()).toBe('data: first\n\n');
      expect(bytesOf(events).toString()).toBe('data: first\n\n');
      expect(events.some(e => e.type === 'provider.finished')).toBe(false);
      expect(Buffer.from(events[0].detail.bodyBase64, 'base64').toString()).toBe(received);
      end(); await reader.read(); await reader.read();
      expect(events.at(-1)?.detail.status).toBe('completed');
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it.each(['openai', 'openai-responses', 'deepseek', 'azure', 'anthropic', 'google'])('captures %s SDK requests before adapter normalization', async providerCase => {
    const providerId = providerCase === 'openai-responses' ? 'openai' : providerCase;
    const { active, events } = fixture();
    const openai = { id: 'reply', object: 'chat.completion', created: 1, model: 'test', choices: [{ index: 0, message: { role: 'assistant', content: 'ok', reasoning_content: 'raw-private-reasoning' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    const anthropic = { id: 'reply', type: 'message', role: 'assistant', model: 'test', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    const google = { candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };
    const responses = { id: 'reply', object: 'response', created_at: 1, model: 'test', status: 'completed', output: [{ type: 'message', id: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ok', annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    const expected = JSON.stringify(providerId === 'anthropic' ? anthropic : providerId === 'google' ? google : providerId === 'azure' || providerCase === 'openai-responses' ? responses : openai);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(expected, { headers: { 'content-type': 'application/json' } })));
    const type = providerId === 'deepseek' ? 'openai' : providerId;
    const { model } = getModel({ providerId, providerType: type, modelId: providerCase === 'openai-responses' ? 'gpt-5.6' : 'test', apiKey: 'private-key', baseUrl: 'https://provider.example/v1' } as Parameters<typeof getModel>[0]);
    const result = await withActiveModelCall(active, () => generateText({ model, prompt: 'hello', maxRetries: 0 }));
    expect(result.text).toBe('ok'); expect(bytesOf(events).toString()).toBe(expected);
    expect(events[0].detail.headers).not.toHaveProperty('authorization');
    expect(events[0].detail.headers).not.toHaveProperty('x-api-key');
    expect(events[0].detail.url).not.toContain('private-key');
    expect(events.at(-1)?.detail.status).toBe('completed');
  });
});
