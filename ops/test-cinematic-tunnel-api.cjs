const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { origin, requestSpec, createTunnelApi } = require('./cinematic-tunnel-api.cjs');
const storage = { cookies: [
  { name: 'session', value: 'project-only', domain: '10.92.35.7', path: '/', secure: false, expires: -1 },
  { name: 'other', value: 'do-not-send', domain: 'example.org', path: '/', secure: false, expires: -1 },
  { name: 'expired', value: 'do-not-send', domain: '10.92.35.7', path: '/', secure: false, expires: 1 },
] };
const endpoint = origin + '/pwncollege_api/v1/teaching/artifacts/artifact_abcdef/revise';

test('pins the tunnel, original Host and project-only cookies without changing stored state', () => {
  const before = structuredClone(storage);
  const spec = requestSpec(endpoint, { maxRetries: 0, data: { expectedRevision: 3 }, headers: { 'CSRF-Token': 'nonce', 'Idempotency-Key': 'revision-key' } }, storage, 'POST');
  assert.equal(spec.hostname, '127.0.0.1');
  assert.equal(spec.port, 18080);
  assert.equal(spec.headers.Host, '10.92.35.7:8080');
  assert.equal(spec.headers.Cookie, 'session=project-only');
  assert.deepEqual(JSON.parse(spec.body), { expectedRevision: 3 });
  assert.deepEqual(storage, before);
});

for (const [name, url, options, method] of [
  ['other host', 'http://example.org' + new URL(endpoint).pathname, {}, 'GET'],
  ['other project route', origin + '/admin/users', {}, 'GET'],
  ['credential URL', 'http://user:secret@10.92.35.7:8080/teacher/artifacts/artifact_abcdef', {}, 'GET'],
  ['query redirect', endpoint + '?next=http://example.org', {}, 'GET'],
  ['alternate Host', endpoint, { headers: { Host: 'example.org' } }, 'POST'],
  ['POST retries', endpoint, { maxRetries: 1 }, 'POST'],
  ['other mutation', origin + '/pwncollege_api/v1/teaching/jobs/job_abcdef', {}, 'POST'],
]) test('refuses ' + name, () => assert.throws(() => requestSpec(url, options, storage, method)));

test('returns redirects without following them or forwarding the session', async () => {
  let calls = 0;
  const transport = (_spec, callback) => {
    calls++;
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.end = () => {
      const response = new EventEmitter(); response.statusCode = 301;
      callback(response); response.emit('data', Buffer.from('redirect')); response.emit('end');
    };
    return request;
  };
  const result = await createTunnelApi(storage, transport).get(endpoint);
  assert.equal(result.status(), 301); assert.equal(calls, 1);
});
