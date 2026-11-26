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

function validate(value, withImages) {
  const messages = value?.messages;
  if (
    typeof value !== 'object' || value === null || Object.keys(value).length !== (withImages ? 2 : 1)
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
  if (!withImages) return { messages };
  if (Buffer.byteLength(JSON.stringify(messages)) > maxBodyBytes) {
    throw new RequestError(413, 'Teaching text is too large');
  }
  if (!Array.isArray(value.images) || !value.images.length || value.images.length > 2) {
    throw new RequestError(400, 'Expected one or two teaching images');
  }
  const images = value.images.map(image => {
    if (!image || Object.keys(image).length !== 2 || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType)
        || typeof image.data !== 'string' || !image.data.length || image.data.length > 2796204) {
      throw new RequestError(400, 'Invalid teaching image');
    }
    const data = Buffer.from(image.data, 'base64');
    if (data.length > 2 * 1024 * 1024 || data.toString('base64') !== image.data) {
      throw new RequestError(400, 'Invalid teaching image encoding');
    }
    return { data, mediaType: image.mediaType };
  });
  return { messages, images };
}

async function readMessages(request, withImages) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RequestError(415, 'Expected application/json');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > (withImages ? 7 * maxBodyBytes : maxBodyBytes)) throw new RequestError(413, 'Request body is too large');
    chunks.push(chunk);
  }

  let payload;
  try {
    payload = JSON.parse(utf8.decode(Buffer.concat(chunks)));
  } catch {
    throw new RequestError(400, 'Invalid JSON');
  }
  return validate(payload, withImages);
}

export function createService({ secret, engine, allowImages = true, timeoutMs = turnTimeout }) {
  if (typeof secret !== 'string' || !secret.trim()) throw new Error('HARNESS_SERVICE_SECRET is required');
  const token = Buffer.from('Bearer ' + secret);
  let active = 0;
  let activeImages = 0;
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      json(response, 200, { status: 'ok' });
      return;
    }
    const withImages = request.url === '/v1/teaching-image-turn';
    const imageCapability = withImages && request.method === 'GET';
    if (!imageCapability && (request.method !== 'POST' || (!withImages && request.url !== '/v1/turn'))) {
      json(response, 404, { error: 'Not found' });
      return;
    }
    const supplied = Buffer.from(request.headers.authorization ?? '');
    if (supplied.length !== token.length || !timingSafeEqual(supplied, token)) {
      response.setHeader('www-authenticate', 'Bearer');
      json(response, 401, { error: 'Unauthorized' });
      return;
    }
    if (imageCapability) {
      json(response, 200, { allowed: allowImages });
      return;
    }
    if (withImages && !allowImages) {
      json(response, 503, { error: 'The configured teaching model has no image input' });
      return;
    }
    if (active >= maxTurns || (withImages && activeImages >= 2)) {
      json(response, 503, { error: 'Service is busy' });
      return;
    }

    active += 1;
    if (withImages) activeImages += 1;
    const disconnect = new AbortController();
    const abort = () => disconnect.abort();
    response.once('close', abort);
    const deadline = AbortSignal.timeout(timeoutMs);
    try {
      const { messages, images } = await readMessages(request, withImages);
      const signal = AbortSignal.any([disconnect.signal, deadline]);
      const result = withImages ? await engine.imageTurn(messages, signal, images) : await engine.turn(messages, signal);
      if (!response.destroyed) json(response, 200, result);
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof RequestError) {
        if (error.status === 413) response.setHeader('connection', 'close');
        json(response, error.status, { error: error.message });
      } else if (error?.name === 'AttachmentError') {
        json(response, 400, { error: 'Teaching image could not be read within the configured limits' });
      } else if (deadline.aborted) {
        json(response, 504, { error: 'Model turn timed out' });
      } else {
        json(response, 502, { error: 'Model turn failed' });
      }
    } finally {
      active -= 1;
      if (withImages) activeImages -= 1;
      response.off('close', abort);
    }
  });
}

export function validateProviderURL(value) {
  const baseURL = value?.trim() || 'https://api.deepseek.com/anthropic';
  const parsed = new URL(baseURL);
  const authority = /^https?:\/\/([^/?#]+)/i.exec(baseURL)?.[1];
  const exactLoopback = /^(127\.0\.0\.1|\[::1\]|localhost)(?::[0-9]+)?$/i.test(authority ?? '');
  if (
    parsed.username || parsed.password || /[?#]/.test(baseURL) ||
    (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && exactLoopback))
  ) {
    throw new Error('Provider URL must use HTTPS or an explicit loopback HTTP fixture, with no credentials, query, or fragment');
  }
  return parsed.href.replace(/\/+$/, '');
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
  const providerURL = validateProviderURL(baseURL);
  const endpoint = new URL(providerURL.replace(/\/+$/, '') + '/v1/messages');
  const transport = globalThis.fetch;
  // The provider supports uploading persistent Files before a Messages call. This service
  // only permits Messages, so the stock adapter sends its normalized image inline.
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    if (url.href !== endpoint.href || method !== 'POST') {
      throw new Error('Only the configured Messages endpoint is available');
    }
    return transport(input, { ...init, redirect: 'error' });
  };
  const engine = await createEngine({ model: model.trim(), baseURL: providerURL });
  const imageSetting = (process.env.DEEPSEEK_IMAGE_INPUT || 'auto').toLowerCase();
  const allowImages = imageSetting === 'auto' ? ['deepseek-flash', 'deepseek-v4.1-flash'].includes(model.trim()) : imageSetting === 'true';
  const server = createService({ secret, engine, allowImages });
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
