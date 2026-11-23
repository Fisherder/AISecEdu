import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { TextDecoder } from 'node:util';
import { createEngine } from './engine.mjs';
import {
  materialTurnPath, maxMaterialTurnBytes, validateMaterialTurn, TeachingMaterialTurnError,
} from './teaching-material.mjs';
import {
  directorTurnPath, maxDirectorTurnBytes, validateDirectorTurn, ClassroomDirectorTurnError,
} from './classroom-director.mjs';
import {
  dialoguePath, maxDialogueBytes, validateClassroomDialogue, ClassroomDialogueError,
} from './classroom-dialogue.mjs';

import { coursewarePath, maxCoursewareBytes, validateCoursewareTurn } from './courseware.mjs';

const compilerPath = '/v1/courseware-compile';
const maxBodyBytes = 1024 * 1024;
const maxMessages = 128;
const maxTurns = 8;
const turnTimeout = 90_000;
const dialogueTimeout = 150_000;
const dialogueIdleTimeout = 45_000;
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

async function readTurn(request, { withImages, withMaterials, withDirector, withDialogue, withCourseware, compiling }) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    throw new RequestError(415, 'Expected application/json');
  }

  const maxBytes = withCourseware ? maxCoursewareBytes : withDialogue ? maxDialogueBytes : withDirector ? maxDirectorTurnBytes :
    withMaterials ? maxMaterialTurnBytes : withImages ? 7 * maxBodyBytes : maxBodyBytes;
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBytes) throw new RequestError(413, 'Request body is too large');
    chunks.push(chunk);
  }

  let payload;
  try {
    payload = JSON.parse(utf8.decode(Buffer.concat(chunks)));
  } catch {
    throw new RequestError(400, 'Invalid JSON');
  }
  if (compiling) {
    if (!payload || Object.keys(payload).length !== 1 || !Array.isArray(payload.pages)) {
      throw new RequestError(400, 'Expected native courseware pages');
    }
    return { pages: payload.pages };
  }
  if (withCourseware) {
    const courseware = validateCoursewareTurn(payload);
    if (!courseware) throw new RequestError(400, 'Expected a bounded courseware request');
    return { courseware };
  }
  if (withDialogue) {
    const dialogue = validateClassroomDialogue(payload);
    if (!dialogue) throw new RequestError(400, 'Expected bounded classroom roles, history, topic and slide text');
    return { dialogue };
  }
  if (withDirector) {
    const director = validateDirectorTurn(payload);
    if (!director) throw new RequestError(400, 'Expected bounded classroom roles, history and turn count');
    return { director };
  }
  if (!withMaterials) return validate(payload, withImages);
  const validated = validateMaterialTurn(payload);
  if (!validated) throw new RequestError(400, 'Expected a bounded teaching question and material excerpts');
  return validated;
}

async function streamClassroomDialogue(response, engine, dialogue, signal, idleTimeoutMs) {
  response.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
    'x-accel-buffering': 'no',
  });
  response.flushHeaders();
  const idle = new AbortController();
  const lifetime = AbortSignal.any([signal, idle.signal]);
  const inactivity = setTimeout(() => idle.abort(), idleTimeoutMs);
  let terminal;
  try {
    const result = await engine.classroomDialogue(dialogue, lifetime, speech => {
      lifetime.throwIfAborted();
      response.write(JSON.stringify(speech) + '\n');
      inactivity.refresh();
    });
    lifetime.throwIfAborted();
    terminal = { type: 'done', ...result };
  } catch (error) {
    terminal = { type: 'error', ...(error instanceof ClassroomDialogueError ? error.receipt : {}) };
  } finally {
    clearTimeout(inactivity);
  }
  if (!response.destroyed) response.end(JSON.stringify(terminal) + '\n');
}

export function createService({
  secret, engine, allowImages = true, timeoutMs = turnTimeout,
  dialogueTimeoutMs = dialogueTimeout, dialogueIdleTimeoutMs = dialogueIdleTimeout,
}) {
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
    const withMaterials = request.url === materialTurnPath;
    const withDirector = request.url === directorTurnPath;
    const withDialogue = request.url === dialoguePath;
    const withCourseware = request.url === coursewarePath;
    const compiling = request.url === compilerPath;
    if (!imageCapability && (request.method !== 'POST' ||
        (!withImages && !withMaterials && !withDirector && !withDialogue && !withCourseware && !compiling && request.url !== '/v1/turn'))) {
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
    const deadline = AbortSignal.timeout(withDialogue || withCourseware ? dialogueTimeoutMs : timeoutMs);
    try {
      if (compiling) {
        const { pages } = await readTurn(request, { compiling });
        let slides;
        try {
          const { compileTeachingSlides } = await import('./courseware-compiler.mjs');
          slides = compileTeachingSlides(pages);
        } catch {
          throw new RequestError(422, 'Invalid native courseware');
        }
        json(response, 200, { slides });
        return;
      }
      const { messages, images, question, materials, director, dialogue, courseware } = await readTurn(request, {
        withImages, withMaterials, withDirector, withDialogue, withCourseware,
      });
      const signal = AbortSignal.any([disconnect.signal, deadline]);
      if (withDialogue) {
        await streamClassroomDialogue(response, engine, dialogue, signal, dialogueIdleTimeoutMs);
        return;
      }
      let result;
      if (withCourseware) result = await engine.coursewareTurn(courseware, signal);
      else if (withDirector) result = await engine.directorTurn(director, signal);
      else if (withMaterials) result = await engine.materialTurn(question, materials, signal);
      else if (withImages) result = await engine.imageTurn(messages, signal, images);
      else result = await engine.turn(messages, signal);
      if (!response.destroyed) json(response, 200, result);
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof RequestError) {
        if (error.status === 413) response.setHeader('connection', 'close');
        json(response, error.status, { error: error.message });
      } else if (error?.name === 'AttachmentError') {
        json(response, 400, { error: 'Teaching image could not be read within the configured limits' });
      } else if (withDirector && error instanceof ClassroomDirectorTurnError) {
        json(response, deadline.aborted ? 504 : 502, {
          error: deadline.aborted ? 'Model turn timed out' : 'Classroom director turn failed',
          ...error.receipt,
        });
      } else if (withMaterials && error instanceof TeachingMaterialTurnError) {
        json(response, deadline.aborted ? 504 : 502, {
          error: deadline.aborted ? 'Model turn timed out' : 'Teaching material turn failed',
          ...error.receipt,
        });
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
