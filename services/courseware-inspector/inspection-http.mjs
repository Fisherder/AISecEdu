import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { inspectCourseware } from './inspector.mjs';
import { inspectCinematic } from './cinematic.mjs';
import { inspectProcess, ProcessInteractionProofError } from './process.mjs';
import { InspectionQueue, InspectionQueueError } from './queue.mjs';

export const CINEMATIC_QUEUE_WAIT_MS = 600000;

export function createInspectionServer({ browser, secret, renderOrigin,
  queue = new InspectionQueue({waitTimeoutMs: CINEMATIC_QUEUE_WAIT_MS}),
  inspectAnimation = inspectCinematic, inspectInteraction = inspectProcess, inspectPage = inspectCourseware,
  logError = error => console.error('Courseware inspection failed:', error.message),
}) {
  if (typeof secret !== 'string' || secret.length < 24 || !renderOrigin)
    throw new Error('Inspector service authentication and render origin are required');
  const server = http.createServer(async (request, response) => {
    const reply = (status, body) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(status, {'Content-Type': 'application/json', ...(status === 429 ? {'Retry-After': '2'} : {})});
      response.end(JSON.stringify(body));
    };
    const supplied = String(request.headers['x-aisecedu-service-token'] || '');
    if (Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)))
      return reply(403, {error: 'Forbidden'});
    if (request.url === '/health' && request.method === 'GET')
      return reply(200, {ok: true, active: queue.active, queued: queue.queued});
    if (!['/inspect', '/inspect-cinematic', '/inspect-process'].includes(request.url) || request.method !== 'POST')
      return reply(404, {error: 'Not found'});
    const canceled = new AbortController();
    response.on('close', () => canceled.abort());
    try {
      // Admission can outlast Node's upload timeout. Finish the bounded upload
      // before waiting, without allocating a browser context for queued work.
      const chunks = []; let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 8_000_000) { reply(413, {error: 'Candidate exceeds size limit'}); return; }
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const cinematic = request.url === '/inspect-cinematic';
      const process = request.url === '/inspect-process';
      if (cinematic) {
        if (data?.schemaVersion !== 'cinematic-v1' || !Array.isArray(data.nodes) || data.nodes.length > 100 || !Array.isArray(data.shots) || data.shots.length > 20 || !Array.isArray(data.chapters) || data.chapters.length > 10 || !Number.isFinite(data.duration) || data.duration < 20 || data.duration > 180)
          return reply(400, {error: 'Invalid cinematic candidate'});
      } else if (process) {
        if (typeof data?.html !== 'string' || data.html.length > 500000 || data?.scene?.schemaVersion !== 'process-v1' || !Array.isArray(data.scene.views) || data.scene.views.length > 12 || !Array.isArray(data.scene.actions) || data.scene.actions.length > 12 || !Array.isArray(data.tests) || data.tests.length < 2 || data.tests.length > 8)
          return reply(400, {error: 'Invalid process candidate'});
      } else if (data?.page?.schema !== 'courseware-page-v2' || !Array.isArray(data.page.beats) || data.page.beats.length > 6)
        return reply(400, {error: 'Invalid candidate'});
      const result = await queue.run(() => (cinematic ? inspectAnimation : process ? inspectInteraction : inspectPage)(browser, {
        data, renderOrigin, serviceToken: secret, signal: canceled.signal,
      }), {signal: canceled.signal, waitTimeoutMs: Math.min(queue.waitTimeoutMs, cinematic ? CINEMATIC_QUEUE_WAIT_MS : process ? 90000 : 45000)});
      canceled.signal.throwIfAborted();
      reply(200, result);
    } catch (error) {
      if (canceled.signal.aborted) return reply(499, {error: 'Inspection canceled'});
      if (error instanceof SyntaxError) return reply(400, {error: 'Invalid candidate JSON'});
      if (error instanceof InspectionQueueError) return reply(error.status, {error: error.message});
      if (error instanceof ProcessInteractionProofError)
        return reply(422,{error:'process-interaction-proof',message:error.message.slice(0,1200)});
      logError(error);
      reply(500, {error: 'Browser inspection failed; the page has not passed verification'});
    }
  });
  server.requestTimeout = 130000;
  return server;
}
