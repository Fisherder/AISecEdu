import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createEngine } from './engine.mjs';
import { createService, validateProviderURL } from './server.mjs';
import { validCinematicCopy } from './teaching-workshop.mjs';

test('reports effective teaching image capability only with service authorization', async (t) => {
  for (const allowImages of [true, false]) {
    const service = createService({ secret, engine: {}, allowImages });
    const url = await listen(service);
    t.after(() => stop(service));
    const capabilityURL = url + '/v1/teaching-image-turn';
    const unauthorized = await fetch(capabilityURL);
    assert.equal(unauthorized.status, 401);
    await unauthorized.body.cancel();
    const response = await fetch(capabilityURL, { headers: { Authorization: 'Bearer ' + secret } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { allowed: allowImages });
  }
});

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
  const signal = new AbortController().signal;
  await assert.rejects(engine.turn([], signal), /A Harness turn must end with a user message/);
  await assert.rejects(engine.turn([{ role: 'system', content: '教学要求' }], signal),
    /A Harness turn must end with a user message/);
  await assert.rejects(engine.turn([{ role: 'user', content: '请描述附图' }], signal, [{}]),
    /Use imageTurn to submit teaching images/);
  assert.equal(received.length, 0);
  const service = createService({ secret, engine });
  const url = await listen(service);
  t.after(() => stop(service));

  const health = await fetch(url + '/health');
  assert.deepEqual(await health.json(), { status: 'ok' });

  const unauthorized = await sendTurn(url, [{ role: 'user', content: 'unauthorized' }], 'wrong');
  assert.equal(unauthorized.status, 401);
  const invalid = await sendTurn(url, [{ role: 'tool', content: 'invalid' }]);
  assert.equal(invalid.status, 400);
  for (const messages of [[], [{ role: 'system', content: '教学要求' }]]) {
    const rejected = await sendTurn(url, messages);
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), { error: 'Expected text messages ending in a user message' });
  }
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

function sendMaterialTurn(url, question, excerpts, options = {}) {
  return fetch(url + '/v1/teaching-material-turn', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + (options.token ?? secret), 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }],
      materials: excerpts.map(text => ({ text })),
      ...options.patch,
    }),
    signal: options.signal,
  });
}

function materialStream(response, blocks, { input = 4, output = 3, cached = 2, stopReason, omitUsage = false } = {}) {
  const events = [{
    type: 'message_start',
    message: { id: 'fixture', model: providerReportedModel, usage: omitUsage ? undefined : {
      input_tokens: input, output_tokens: 0, cache_read_input_tokens: cached,
    } },
  }];
  for (const [index, block] of blocks.entries()) {
    const start = block.type === 'text' ? { type: 'text', text: '' } : { ...block, input: {} };
    events.push({ type: 'content_block_start', index, content_block: start });
    events.push({ type: 'content_block_delta', index, delta: block.type === 'text'
      ? { type: 'text_delta', text: block.text }
      : { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    events.push({ type: 'content_block_stop', index });
  }
  events.push(
    { type: 'message_delta', delta: { stop_reason: stopReason ?? (blocks[0]?.type === 'tool_use' ? 'tool_use' : 'end_turn') }, usage: omitUsage ? undefined : { output_tokens: output } },
    { type: 'message_stop' },
  );
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(events.map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''));
}

function readerCall(index, id = 'fixture-read') {
  return { type: 'tool_use', id, name: 'read_teaching_material', input: { index } };
}

test('one request-scoped native reader grounds the next official model step and accounts all reported usage', async t => {
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'fixture-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const observed = [];
  const streaming = Promise.withResolvers();
  const canceled = Promise.withResolvers();
  const upstream = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    observed.push(data);
    const question = data.messages[0].content[0].text;
    const latest = data.messages.at(-1).content[0];
    if (latest.type === 'tool_result') {
      if (question === 'read four excerpts') {
        const toolResults = data.messages.flatMap(message => message.content).filter(block => block.type === 'tool_result');
        if (toolResults.length < 4) {
          const next = toolResults.length + 1;
          materialStream(response, [readerCall(next, 'fixture-read-' + next)]);
        } else {
          materialStream(response, [{ type: 'text', text: '全部摘录已读取。' }]);
        }
      } else if (question === 'second step fails') {
        materialStream(response, [{ type: 'text', text: 'partial response' }], { stopReason: 'max_tokens' });
      } else if (question === 'second step refuses') {
        materialStream(response, [{ type: 'text', text: 'partial response' }], { stopReason: 'refusal' });
      } else if (question === 'unmeasured answer') {
        materialStream(response, [{ type: 'text', text: 'partial response' }], { omitUsage: true });
      } else if (question === 'repeat read') {
        materialStream(response, [readerCall(1, 'fixture-repeat')]);
      } else if (question === 'second step waits' || question === 'client leaves') {
        if (question === 'client leaves') response.once('close', canceled.resolve);
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.flushHeaders();
        if (question === 'client leaves') streaming.resolve();
      } else {
        const content = typeof latest.content === 'string' ? latest.content : latest.content[0].text;
        const excerpt = JSON.parse(content).excerpt;
        materialStream(response, [{ type: 'text', text: '摘录中的观察：' + excerpt }], { input: 11, output: 5, cached: 1 });
      }
    } else if (question === 'out of bounds') {
      materialStream(response, [readerCall(3)]);
    } else if (question === 'batch overflow') {
      materialStream(response, [readerCall(1), readerCall(2, 'fixture-batch')]);
    } else if (question === 'extra tool argument') {
      materialStream(response, [{ ...readerCall(1), input: { index: 1, other: true } }]);
    } else if (question === 'never reads' || question === 'ordinary turn') {
      materialStream(response, [{ type: 'text', text: '未引用材料' }]);
    } else {
      materialStream(response, [readerCall(1)]);
    }
  });
  const baseURL = await listen(upstream);
  t.after(() => stop(upstream));
  const engine = await createEngine({ model, baseURL });
  t.after(() => engine.close());
  const service = createService({ secret, engine, timeoutMs: 1000 });
  const url = await listen(service);
  t.after(() => stop(service));

  const invalidRequests = [
    { patch: { unrelated: true } },
    { patch: { materials: [{ text: '摘录', url: 'https://fixture.invalid' }] } },
    { patch: { materials: [{ text: '水'.repeat(2001) }] } },
    { patch: { materials: Array.from({ length: 5 }, () => ({ text: '摘录' })) } },
    { patch: { messages: [{ role: 'system', content: '无效角色' }, { role: 'user', content: '题目' }] } },
  ];
  for (const options of invalidRequests) {
    assert.equal((await sendMaterialTurn(url, '无效', ['甲'], options)).status, 400);
  }
  assert.equal((await sendMaterialTurn(url, '无权限', ['甲'], { token: 'wrong' })).status, 401);
  assert.equal(observed.length, 0);

  const [first, second] = await Promise.all([
    sendMaterialTurn(url, '观察甲', ['记录了三片叶子', '不读取甲的第二段']),
    sendMaterialTurn(url, '观察乙', ['测量了两杯水']),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), {
    text: '摘录中的观察：记录了三片叶子',
    model,
    materialReads: [1],
    usage: { prompt_tokens: 18, completion_tokens: 8, total_tokens: 26, cache_read_input_tokens: 3 },
  });
  assert.equal((await second.json()).text, '摘录中的观察：测量了两杯水');

  for (const question of ['观察甲', '观察乙']) {
    const steps = observed.filter(step => step.messages[0].content[0].text === question);
    assert.equal(steps.length, 2);
    assert.deepEqual(steps[0].tools.map(tool => tool.name), ['read_teaching_material']);
    assert.equal(steps[0].tools[0].input_schema.additionalProperties, false);
    assert.doesNotMatch(JSON.stringify(steps[0]), /记录了三片叶子|测量了两杯水|不读取甲的第二段/);
    const secondWire = JSON.stringify(steps[1]);
    assert.match(secondWire, question === '观察甲' ? /记录了三片叶子/ : /测量了两杯水/);
    assert.doesNotMatch(secondWire, question === '观察甲' ? /测量了两杯水|不读取甲的第二段/ : /记录了三片叶子/);
  }

  const all = await sendMaterialTurn(url, 'read four excerpts', ['第一段', '第二段', '第三段', '第四段']);
  assert.equal(all.status, 200);
  assert.deepEqual(await all.json(), {
    text: '全部摘录已读取。', model, materialReads: [1, 2, 3, 4],
    usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45, cache_read_input_tokens: 10 },
  });

  for (const [question, expectedSteps] of [
    ['out of bounds', 1], ['batch overflow', 1], ['extra tool argument', 1], ['never reads', 1], ['repeat read', 2],
    ['second step fails', 2], ['second step refuses', 2], ['unmeasured answer', 2],
  ]) {
    const measuredSteps = question === 'unmeasured answer' ? 1 : expectedSteps;
    const invalid = await sendMaterialTurn(url, question, ['甲', '乙']);
    assert.equal(invalid.status, 502);
    assert.deepEqual(await invalid.json(), {
      error: 'Teaching material turn failed', model,
      usage: { prompt_tokens: 6 * measuredSteps, completion_tokens: 3 * measuredSteps,
        total_tokens: 9 * measuredSteps, cache_read_input_tokens: 2 * measuredSteps },
    });
    assert.equal(observed.filter(step => step.messages[0].content[0].text === question).length, expectedSteps);
  }

  const timed = await sendMaterialTurn(url, 'second step waits', ['甲']);
  assert.equal(timed.status, 504);
  assert.deepEqual(await timed.json(), {
    error: 'Model turn timed out', model,
    usage: { prompt_tokens: 6, completion_tokens: 3, total_tokens: 9, cache_read_input_tokens: 2 },
  });

  const disconnect = new AbortController();
  const departing = sendMaterialTurn(url, 'client leaves', ['甲'], { signal: disconnect.signal });
  await Promise.race([streaming.promise, departing.then(() => assert.fail('Model never reached second step'))]);
  disconnect.abort();
  await assert.rejects(departing, { name: 'AbortError' });
  await canceled.promise;

  const plain = await sendTurn(url, [{ role: 'user', content: 'ordinary turn' }]);
  assert.equal(plain.status, 200);
  assert.equal(observed.at(-1).tools?.length ?? 0, 0);
  assert.equal((await plain.json()).materialReads, undefined);
});

test('generated teaching scenes require chapter focus and motion to reference real actors', () => {
  const scene = {
    title: '观察插针如何对准插座',
    subtitle: '从对齐到拔出，逐步观察方形插针和插座的位置关系。',
    modelNote: '采用便于课堂观察的简化模型展示装配动作。',
    objectives: ['认识插针与插座之间的相对位置。'],
    chapters: ['观察结构', '对齐孔位', '插入定位', '沿轴拔出'].map(title => ({
      title, caption: '从当前角度观察插针与底座之间的位置关系。', question: '', focus: 'pin',
    })),
    actors: ['base', 'pin', 'socket', 'collar', 'rim'].map(id => ({
      id, label: '演示部件', detail: '这个部件用来帮助观察三维装配过程。', shape: 'box',
      color: '#1244DD', position: [0, 0, 0], size: [1, 1, 1], parent: '', surface: 'plain',
    })),
    movement: [{ actor: 'pin', waypoints: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [0, 0, 0]] }],
  };
  assert.equal(validCinematicCopy('primitives', scene), true);
  scene.chapters[0].focus = '插针与底座的位置关系';
  assert.equal(validCinematicCopy('primitives', scene), false);
  scene.chapters[0].focus = 'pin';
  scene.movement[0].actor = 'missing';
  assert.equal(validCinematicCopy('primitives', scene), false);
});
