import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createEngine } from './engine.mjs';
import { createService, validateProviderURL } from './server.mjs';

test('validates provider protocols, credentials, queries and fragments', () => {
  assert.equal(validateProviderURL(), 'https://api.deepseek.com/anthropic');
  assert.equal(validateProviderURL('https://provider.invalid/anthropic/'), 'https://provider.invalid/anthropic');
  assert.equal(validateProviderURL('https://provider.invalid/%3F%23'), 'https://provider.invalid/%3F%23');
  for (const host of ['127.0.0.1', '[::1]', 'localhost']) {
    assert.equal(validateProviderURL(`http://${host}:3082/anthropic`), `http://${host}:3082/anthropic`);
  }
  for (const url of [
    'http://provider.invalid', 'http://127.0.0.2', 'http://127.1', 'http://127.0.0.1.provider.invalid',
    'http://localhost@provider.invalid', 'ftp://localhost', 'https://user:secret@provider.invalid',
    'https://provider.invalid/?target=messages', 'https://provider.invalid/path#fragment',
    'https://provider.invalid/anthropic/?', 'http://localhost:3082/anthropic#',
  ]) {
    assert.throws(() => validateProviderURL(url), /Provider URL must use HTTPS/);
  }
});

const secret = 'local-fixture-secret';
const model = 'local-messages-fixture';
const providerReportedModel = 'local-messages-fixture-version';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

function stop(server) {
  server.closeAllConnections();
  return new Promise(resolve => server.close(resolve));
}

function sendTurn(url, messages, token = secret) {
  return fetch(url + '/v1/turn', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

function eventStream(response, data, blocked) {
  const text = '答复 ' + data.messages.at(-1).content[0].text;
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'fixture',
        model: providerReportedModel,
        usage: { input_tokens: 4, output_tokens: 0, cache_read_input_tokens: 2 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
  ];
  if (blocked) {
    events.push(
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'fixture-inert', name: 'unregistered', input: {} } },
      { type: 'content_block_stop', index: 1 },
    );
  }
  events.push(
    { type: 'message_delta', delta: { stop_reason: blocked ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  );
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(events.map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''));
}

test('HTTP requests drive the official restricted agent loop and Messages adapter', async t => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'fixture-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });

  const received = [];
  const upstream = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    received.push({ path: request.url, key: request.headers['x-api-key'], data });
    const text = data.messages.at(-1).content[0].text;
    if (text === 'wait') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      return;
    }
    eventStream(response, data, text === 'blocked');
  });
  const upstreamURL = await listen(upstream);
  t.after(() => stop(upstream));

  const engine = await createEngine({ model, baseURL: upstreamURL });
  t.after(() => engine.close());
  const service = createService({ secret, engine });
  const url = await listen(service);
  t.after(() => stop(service));

  const health = await fetch(url + '/health');
  assert.deepEqual(await health.json(), { status: 'ok' });

  const unauthorized = await sendTurn(url, [{ role: 'user', content: 'unauthorized' }], 'wrong');
  assert.equal(unauthorized.status, 401);
  const invalid = await sendTurn(url, [{ role: 'tool', content: 'invalid' }]);
  assert.equal(invalid.status, 400);
  const oversized = await sendTurn(url, [{ role: 'user', content: 'x'.repeat(1024 * 1024) }]);
  assert.equal(oversized.status, 413);
  assert.equal(received.length, 0);

  const [a, b] = await Promise.all([
    sendTurn(url, [
      { role: 'system', content: '甲 {{model}}' },
      { role: 'user', content: '第一条' },
      { role: 'assistant', content: '上次答复' },
      { role: 'user', content: '甲' },
    ]),
    sendTurn(url, [{ role: 'system', content: '乙的系统提示' }, { role: 'user', content: '乙' }]),
  ]);
  assert.equal(a.status, 200, JSON.stringify(received));
  assert.equal(b.status, 200, JSON.stringify(received));
  // The compatibility receipt identifies the requested model, not the provider's alias resolution.
  assert.deepEqual(await a.json(), {
    text: '答复 甲',
    model,
    usage: { prompt_tokens: 6, completion_tokens: 3, total_tokens: 9, cache_read_input_tokens: 2 },
  });
  assert.equal((await b.json()).text, '答复 乙');
  assert.equal(received.length, 2);

  for (const request of received) {
    assert.equal(request.path, '/v1/messages');
    assert.equal(request.key, 'fixture-key');
    assert.equal(request.data.model, model);
    assert.equal(request.data.tools?.length ?? 0, 0);
  }
  const wireA = received.find(({ data }) => data.messages.at(-1).content[0].text === '甲').data;
  const wireB = received.find(({ data }) => data.messages.at(-1).content[0].text === '乙').data;
  assert.deepEqual(wireA.messages.map(({ role, content }) => [role, content[0].text]), [
    ['user', '第一条'], ['assistant', '上次答复'], ['user', '甲'],
  ]);
  assert.deepEqual(wireB.messages.map(({ role, content }) => [role, content[0].text]), [['user', '乙']]);
  assert.equal(wireA.system, '甲 {{model}}');
  assert.equal(wireB.system, '乙的系统提示');
  assert.equal(JSON.stringify(wireA).split('甲 {{model}}').length - 1, 1);
  assert.equal(JSON.stringify(wireB).split('乙的系统提示').length - 1, 1);

  const rejected = await sendTurn(url, [{ role: 'user', content: 'blocked' }]);
  assert.equal(rejected.status, 502);
  assert.deepEqual(await rejected.json(), { error: 'Model turn failed' });
  assert.equal(received.length, 3);

  const timingService = createService({ secret, engine, timeoutMs: 500 });
  const timingURL = await listen(timingService);
  t.after(() => stop(timingService));
  const timeout = await sendTurn(timingURL, [{ role: 'user', content: 'wait' }]);
  assert.equal(timeout.status, 504);
  assert.deepEqual(await timeout.json(), { error: 'Model turn timed out' });
  assert.equal(received.length, 4);
});
