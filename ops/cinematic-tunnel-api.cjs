const assert = require('node:assert/strict');
const http = require('node:http');

const origin = 'http://10.92.35.7:8080';
const allowedPath = /^\/(?:teacher\/artifacts\/artifact_[a-f0-9]+|pwncollege_api\/v1\/teaching\/(?:jobs\/job_[a-f0-9]+|artifacts\/artifact_[a-f0-9]+(?:\/revise)?))$/;

function requestSpec(url, options, storage, method) {
  const parsed = new URL(url);
  assert.equal(parsed.origin, origin, 'Only the identified project origin is allowed');
  assert.ok(!parsed.username && !parsed.password && !parsed.search && !parsed.hash);
  assert.match(parsed.pathname, allowedPath);
  assert.ok(method === 'GET' || (method === 'POST' && parsed.pathname.endsWith('/revise')));
  assert.equal(options?.maxRetries ?? 0, method === 'POST' ? 0 : options?.maxRetries ?? 0);
  const cookies = (storage.cookies ?? []).filter(cookie =>
    cookie.domain === parsed.hostname && !cookie.secure &&
    (cookie.expires === -1 || cookie.expires > Date.now() / 1000) &&
    (parsed.pathname === cookie.path || parsed.pathname.startsWith(cookie.path.endsWith('/') ? cookie.path : cookie.path + '/'))
  );
  assert.ok(cookies.length, 'An existing project session is required');
  const cookieHeader = cookies.map(cookie => {
    assert.match(cookie.name, /^[A-Za-z0-9_-]+$/);
    assert.ok(!/[\r\n;]/.test(cookie.value));
    return cookie.name + '=' + cookie.value;
  }).join('; ');
  const headers = { Host: parsed.host, Cookie: cookieHeader, Accept: 'application/json', Connection: 'close' };
  for (const [key, value] of Object.entries(options?.headers ?? {})) {
    assert.ok(['csrf-token', 'content-type', 'idempotency-key'].includes(key.toLowerCase()));
    assert.equal(typeof value, 'string');
    assert.ok(!/[\r\n]/.test(value));
    headers[key] = value;
  }
  const body = options?.data === undefined ? undefined : JSON.stringify(options.data);
  if (body !== undefined) {
    assert.equal(method, 'POST');
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  return { hostname: '127.0.0.1', port: 18080, method, path: parsed.pathname, headers, body };
}

function createTunnelApi(storage, transport = http.request) {
  async function send(method, url, options = {}) {
    const { body, ...spec } = requestSpec(url, options, storage, method);
    return new Promise((resolve, reject) => {
      const request = transport(spec, response => {
        const chunks = [];
        let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) request.destroy(new Error('Scoped response size exceeded'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          const content = Buffer.concat(chunks).toString('utf8');
          resolve({ status: () => response.statusCode, text: async () => content, json: async () => JSON.parse(content) });
        });
      });
      request.setTimeout(20000, () => request.destroy(new Error('Scoped request timed out')));
      request.on('error', reject);
      request.end(body);
    });
  }
  return { get: (url, options) => send('GET', url, options), post: (url, options) => send('POST', url, options), dispose: async () => {} };
}

module.exports = { origin, requestSpec, createTunnelApi };
