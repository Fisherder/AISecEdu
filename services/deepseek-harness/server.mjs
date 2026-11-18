import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { TextDecoder } from 'node:util';
import { createEngine } from './engine.mjs';

const maxBodyBytes = 1024 * 1024;
const maxMessages = 128;
const maxTurns = 8;
const turnTimeout = 90_000;
const utf8 = new TextDecoder('utf-8', { fatal: true });

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function validate(value) {
  const messages = value?.messages;
  if (
    typeof value !== 'object' || value === null || Object.keys(value).length !== 1
    || !Array.isArray(messages) || messages.length === 0 || messages.length > maxMessages
    || messages.at(-1)?.role !== 'user'
    || messages.some((item, index) => (
      typeof item !== 'object' || item === null || Object.keys(item).length !== 2
      || (item.role !== 'user' && item.role !== 'assistant' && !(index === 0 && item.role === 'system'))
      || typeof item.content !== 'string' || item.content.trim() === ''
    ))
  ) {
    throw new RequestError(400, 'Expected text messages ending in a user message');
  }
  return messages;
}

async function readMessages(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RequestError(415, 'Expected application/json');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new RequestError(413, 'Request body is too large');
    chunks.push(chunk);
  }

  let payload;
  try {
    payload = JSON.parse(utf8.decode(Buffer.concat(chunks)));
  } catch {
    throw new RequestError(400, 'Invalid JSON');
  }
  return validate(payload);
}

export function createService({ secret, engine, timeoutMs = turnTimeout }) {
  if (typeof secret !== 'string' || !secret.trim()) throw new Error('HARNESS_SERVICE_SECRET is required');
  const token = Buffer.from('Bearer ' + secret);
  let active = 0;
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, { status: 'ok' });
      return;
    }
    if (request.method !== 'POST' || request.url !== '/v1/turn') {
      json(response, 404, { error: 'Not found' });
      return;
    }
    const supplied = Buffer.from(request.headers.authorization ?? '');
    if (supplied.length !== token.length || !timingSafeEqual(supplied, token)) {
      response.setHeader('www-authenticate', 'Bearer');
      json(response, 401, { error: 'Unauthorized' });
      return;
    }
    if (active >= maxTurns) {
      json(response, 503, { error: 'Service is busy' });
      return;
    }

    active += 1;
    const disconnect = new AbortController();
    const abort = () => disconnect.abort();
    response.once('close', abort);
    const deadline = AbortSignal.timeout(timeoutMs);
    try {
      const messages = await readMessages(request);
      const result = await engine.turn(messages, AbortSignal.any([disconnect.signal, deadline]));
      if (!response.destroyed) json(response, 200, result);
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof RequestError) {
        if (error.status === 413) response.setHeader('connection', 'close');
        json(response, error.status, { error: error.message });
      } else if (deadline.aborted) {
        json(response, 504, { error: 'Model turn timed out' });
      } else {
        json(response, 502, { error: 'Model turn failed' });
      }
    } finally {
      active -= 1;
      response.off('close', abort);
    }
  });
}

async function main() {
  const {
    HARNESS_SERVICE_SECRET: secret,
    DEEPSEEK_API_KEY: key,
    DEEPSEEK_MODEL: model,
    DEEPSEEK_BASE_URL: baseURL,
    PORT: rawPort = '3081',
  } = process.env;
  if (!secret?.trim() || !model?.trim() || !key?.trim()) {
    throw new Error('HARNESS_SERVICE_SECRET, DEEPSEEK_MODEL and DEEPSEEK_API_KEY are required');
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const engine = await createEngine({ model: model.trim(), baseURL: baseURL?.trim() || undefined });
  const server = createService({ secret, engine });
  server.once('error', () => {
    console.error('Harness service could not listen');
    process.exitCode = 1;
    void engine.close();
  });
  server.listen(port, '0.0.0.0', () => console.log('Harness service listening on port ' + port));
  const close = () => server.close(() => { void engine.close(); });
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (import.meta.main) {
  main().catch(() => {
    console.error('Harness service startup failed. Check required environment and provider configuration.');
    process.exitCode = 1;
  });
}
