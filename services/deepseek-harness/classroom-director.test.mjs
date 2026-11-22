import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { directorTurnPath, maxDirectorTurnBytes } from './classroom-director.mjs';
import { dialoguePath, maxDialogueBytes } from './classroom-dialogue.mjs';
import { createEngine } from './engine.mjs';
import { createService } from './server.mjs';

const input = {
  roles: ['teacher', 'student'],
  history: [{ speaker: 1, text: '介绍水循环。' }, { speaker: 'user', text: '请同学回答。' }],
  turns: 2,
  topic: '水循环',
};
const secret = 'fixture-secret';
const model = 'fixture-model';
const usage = {
  prompt_tokens: 6,
  completion_tokens: 3,
  total_tokens: 9,
  cache_read_input_tokens: 2,
};

function request(service, { body = input, authorization = 'Bearer ' + secret, path = directorTurnPath } = {}) {
  const incoming = Readable.from([Buffer.from(JSON.stringify(body))]);
  incoming.method = 'POST';
  incoming.url = path;
  incoming.headers = { authorization, 'content-type': 'application/json' };
  const outgoing = new EventEmitter();
  return new Promise(resolve => {
    outgoing.setHeader = () => {};
    outgoing.writeHead = status => { outgoing.status = status; };
    outgoing.end = value => resolve({ status: outgoing.status, body: JSON.parse(value) });
    service.emit('request', incoming, outgoing);
  });
}

function tool(input, name = 'choose_classroom_speaker') {
  return { type: 'tool_use', id: 'fixture-choice', name, input };
}

function messagesResponse(blocks, { stop = 'tool_use', measured = true } = {}) {
  const events = [{
    type: 'message_start',
    message: {
      id: 'synthetic',
      model: 'synthetic-provider-alias',
      usage: measured ? { input_tokens: 4, output_tokens: 0, cache_read_input_tokens: 2 } : undefined,
    },
  }];
  for (const [index, block] of blocks.entries()) {
    const start = block.type === 'text' ? { type: 'text', text: '' } : { ...block, input: {} };
    events.push(
      { type: 'content_block_start', index, content_block: start },
      { type: 'content_block_delta', index, delta: block.type === 'text'
        ? { type: 'text_delta', text: block.text }
        : { type: 'input_json_delta', partial_json: typeof block.input === 'string' ? block.input : JSON.stringify(block.input) } },
      { type: 'content_block_stop', index },
    );
  }
  events.push(
    { type: 'message_delta', delta: { stop_reason: stop }, usage: measured ? { output_tokens: 3 } : undefined },
    { type: 'message_stop' },
  );
  return new Response(events.map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''),
    { headers: { 'content-type': 'text/event-stream' } });
}

test('director route validates compact positional classroom input before running a model', async () => {
  const calls = [];
  const service = createService({ secret, engine: {
    async directorTurn(body, signal) {
      calls.push(body);
      assert.equal(signal.aborted, false);
      return { decision: { speaker: 2 }, model, usage };
    },
  } });
  assert.equal((await request(service, { authorization: '' })).status, 401);
  assert.equal((await request(service, { body: '界'.repeat(maxDirectorTurnBytes) })).status, 413);
  for (const body of [
    { ...input, roles: [] },
    { ...input, roles: Array(17).fill('student') },
    { ...input, roles: ['administrator'] },
    { ...input, instruction: 'hello' },
    { ...input, turns: -1 },
    { ...input, turns: 1.5 },
    { ...input, turns: 10001 },
    { ...input, topic: '' },
    { ...input, topic: '界'.repeat(241) },
    { ...input, history: Array(25).fill(input.history[0]) },
    { ...input, history: [{ speaker: 1, text: '界'.repeat(1001) }] },
    { ...input, history: [{ speaker: 1, text: 'a', id: 3 }] },
    ...['1', 'end', 0, 3, 1.5].map(speaker => ({ ...input, history: [{ speaker, text: 'a' }] })),
  ]) {
    assert.equal((await request(service, { body })).status, 400, JSON.stringify(body).slice(0, 200));
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(await request(service), { status: 200, body: { decision: { speaker: 2 }, model, usage } });
  assert.deepEqual(calls, [input]);
});

test('stock Messages adapter and native executor accept exactly one measured classroom choice', async t => {
  const requests = [];
  let reply;
  const baseURL = 'https://offline-fixture.invalid';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), baseURL + '/v1/messages');
    assert.equal(options.method, 'POST');
    requests.push(JSON.parse(options.body));
    return reply(options.signal);
  });
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'fixture-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const engine = await createEngine({ model, baseURL });
  t.after(() => engine.close());
  const service = createService({ secret, engine, timeoutMs: 1500 });

  for (const speaker of [1, 2, 'user', 'end']) {
    reply = () => messagesResponse([tool({ speaker })]);
    assert.deepEqual(await request(service), { status: 200, body: { decision: { speaker }, model, usage } });
    const call = requests.at(-1);
    assert.equal(call.max_tokens, 512);
    assert.deepEqual(call.tools.map(({ name }) => name), ['choose_classroom_speaker']);
    assert.deepEqual(call.tools[0].input_schema.properties.speaker.oneOf, [
      { type: 'integer', enum: [1, 2] }, { type: 'string', enum: ['user', 'end'] },
    ]);
    assert.deepEqual(call.tools[0].input_schema.required, ['speaker']);
    assert.equal(call.tools[0].input_schema.additionalProperties, false);
    assert.deepEqual(JSON.parse(call.messages.at(-1).content[0].text), input);
  }
  assert.equal(requests.length, 4);

  const failedChoices = [
    [tool({ speaker: 3 })],
    [tool({ speaker: 0 })],
    [tool({ speaker: '1' })],
    [tool({ speaker: null })],
    [tool({ speaker: 'teacher' })],
    [tool({ speaker: 1, extra: true })],
    [tool('{"speaker":1,"speaker":2}')],
    [tool({})],
    [tool({ speaker: 1 }, 'read_teaching_material')],
    [tool({ speaker: 1 }), { ...tool({ speaker: 2 }), id: 'another-choice' }],
    [tool({ speaker: 1 }), { type: 'text', text: 'extra output' }],
  ];
  for (const blocks of failedChoices) {
    const before = requests.length;
    reply = () => messagesResponse(blocks);
    assert.deepEqual(await request(service), {
      status: 502, body: { error: 'Classroom director turn failed', model, usage },
    }, JSON.stringify(blocks));
    assert.equal(requests.length, before + 1);
  }
  for (const stop of ['end_turn', 'max_tokens', 'refusal']) {
    reply = () => messagesResponse([tool({ speaker: 1 })], { stop });
    assert.equal((await request(service)).status, 502, stop);
  }
  reply = () => messagesResponse([{ type: 'text', text: '{"speaker":1}' }], { stop: 'end_turn' });
  assert.equal((await request(service)).status, 502);
  reply = () => messagesResponse([tool({ speaker: 1 })], { measured: false });
  assert.deepEqual(await request(service), { status: 502, body: { error: 'Classroom director turn failed' } });

  reply = () => messagesResponse([{ type: 'text', text: '普通课堂回答' }], { stop: 'end_turn' });
  assert.equal((await request(service, { path: '/v1/turn', body: { messages: [{ role: 'user', content: '你好' }] } })).status, 200);
  assert.equal(requests.at(-1).tools, undefined);

  const deadline = createService({ secret, engine, timeoutMs: 100 });
  let transportAborted = false;
  reply = signal => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      transportAborted = true;
      reject(signal.reason);
    }, { once: true });
  });
  const keepAlive = setInterval(() => {}, 100);
  try {
    assert.deepEqual(await request(deadline), { status: 504, body: { error: 'Model turn timed out' } });
    assert.equal(transportAborted, true);
  } finally {
    clearInterval(keepAlive);
  }

  reply = () => messagesResponse([tool({ speaker: 2 })]);
  const oneParticipant = { roles: ['teacher'], history: [], turns: 0 };
  const [restricted, available] = await Promise.all([
    request(service, { body: oneParticipant }),
    request(service),
  ]);
  assert.equal(restricted.status, 502);
  assert.deepEqual(available, { status: 200, body: { decision: { speaker: 2 }, model, usage } });
  const concurrentSchemas = requests.slice(-2).map(call => call.tools[0].input_schema.properties.speaker.oneOf[0].enum);
  assert.deepEqual(concurrentSchemas.map(slots => slots.length).sort(), [1, 2]);
});

test('one stock AgentLoop streams an entire bounded classroom dialogue', { timeout: 8000 }, async t => {
  const requests = [];
  let reply;
  const fixture = createServer(async (incoming, outgoing) => {
    assert.equal(incoming.method, 'POST');
    assert.equal(incoming.url, '/v1/messages');
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    requests.push(JSON.parse(Buffer.concat(chunks)));
    const response = await reply(requests.at(-1), outgoing);
    if (response) {
      outgoing.writeHead(200, { 'content-type': 'text/event-stream' });
      outgoing.end(await response.text());
    }
  });
  async function listen(server) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => {
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    });
    return 'http://127.0.0.1:' + server.address().port;
  }
  const baseURL = await listen(fixture);
  const previousKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'fixture-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousKey;
  });
  const engine = await createEngine({ model, baseURL });
  t.after(() => engine.close());
  const serviceURL = await listen(createService({ secret, engine }));
  const { turns, ...historyAndRoles } = input;
  const dialogue = { ...historyAndRoles, slideText: '蒸发、凝结、降水和地表径流。' };

  function start(body = dialogue, authorization = 'Bearer ' + secret, url = serviceURL) {
    return fetch(url + dialoguePath, {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  function speech(speaker, text) {
    return tool({ speaker, text }, 'speak_in_classroom');
  }
  function conclusion(next) {
    return tool({ next }, 'finish_classroom_discussion');
  }
  function receipt(steps) {
    return { model, usage: Object.fromEntries(Object.entries(usage).map(([key, value]) => [key, value * steps])) };
  }
  async function read(response) {
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^application\/x-ndjson/);
    const body = await response.text();
    assert.ok(body.endsWith('\n'));
    return body.trimEnd().split('\n').map(line => JSON.parse(line));
  }

  assert.equal((await start(dialogue, '')).status, 401);
  assert.equal((await start('x'.repeat(maxDialogueBytes))).status, 413);
  for (const invalid of [
    { ...dialogue, slideText: '水'.repeat(6001) },
    { ...dialogue, slideText: '' },
    { ...dialogue, topic: ' ' },
    { ...dialogue, topic: '水'.repeat(241) },
    { ...dialogue, history: [{ speaker: 3, text: '无效的角色' }] },
    { ...dialogue, turns },
  ]) {
    assert.equal((await start(invalid)).status, 400);
  }
  assert.equal(requests.length, 0);

  const lines = [
    { type: 'speech', speaker: 1, text: '水汽冷却时形成水滴。\n下一步是什么？' },
    { type: 'speech', speaker: 2, text: '水滴会聚成云，随后降水。' },
  ];
  let step = 0;
  const { promise: releaseSecond, resolve: continueDialogue } = Promise.withResolvers();
  reply = async () => {
    step += 1;
    if (step === 2) await releaseSecond;
    const line = lines[step - 1];
    const call = line ? speech(line.speaker, line.text) : conclusion('end');
    return messagesResponse([{ ...call, id: 'discussion-' + step }]);
  };
  const response = await start();
  const reader = response.body.getReader();
  let firstLine = '';
  const decoder = new TextDecoder();
  try {
    while (!firstLine.includes('\n')) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      firstLine += decoder.decode(value, { stream: true });
    }
    assert.deepEqual(JSON.parse(firstLine), { ...lines[0], ...receipt(1) });
    assert.match(firstLine, /\n$/);
  } finally {
    continueDialogue();
  }
  const rest = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    rest.push(value);
  }
  assert.deepEqual(Buffer.concat(rest).toString().trimEnd().split('\n').map(line => JSON.parse(line)), [
    { ...lines[1], ...receipt(2) }, { type: 'done', next: 'end', ...receipt(3) },
  ]);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0].tools.map(tool => tool.name).sort(), ['finish_classroom_discussion', 'speak_in_classroom']);
  assert.deepEqual(JSON.parse(requests[0].messages.at(-1).content[0].text), dialogue);
  assert.ok(requests[1].messages.some(message => message.content.some(
    item => item.type === 'tool_result' && item.tool_use_id === 'discussion-1',
  )));

  const startCap = requests.length;
  reply = () => messagesResponse([{ ...speech(1, '继续讲解。'), id: 'cap-' + requests.length }]);
  const cap = await read(await start());
  assert.equal(requests.length - startCap, 6);
  assert.equal(cap.filter(line => line.type === 'speech').length, 6);
  assert.deepEqual(cap.at(-1), { type: 'done', next: 'user', ...receipt(6) });

  for (const [blocks, options] of [
    [[tool({ speaker: 1 }, 'read_teaching_material')]],
    [[speech(3, '无效的角色')]],
    [[speech(1, ' ')]],
    [[speech(1, '水'.repeat(1501))]],
    [[tool('{"text":"初稿","speaker":1,"text":"重复字段"}', 'speak_in_classroom')]],
    [[speech(1, '不得发送这句。'), { type: 'text', text: '工具外的文本' }]],
    [[speech(1, '不得发送这句。'), { ...conclusion('user'), id: 'extra' }]],
    [[conclusion('user'), { ...speech(1, '结束后说话。'), id: 'extra' }]],
    [[speech(1, '不得发送这句。')], { stop: 'end_turn' }],
    [[speech(1, '不得发送这句。')], { measured: false }],
  ]) {
    const before = requests.length;
    reply = () => messagesResponse(blocks, options);
    assert.deepEqual(await read(await start()), [
      { type: 'error', ...(options?.measured === false ? {} : receipt(1)) },
    ]);
    assert.equal(requests.length, before + 1);
  }

  reply = () => messagesResponse([conclusion('user')]);
  assert.deepEqual(await read(await start()), [{ type: 'done', next: 'user', ...receipt(1) }]);

  // Even a closed tool block with a stop reason must wait for Messages to settle the step.
  reply = async () => {
    const sse = await messagesResponse([speech(1, '没有完整结束。')]).text();
    return new Response(sse.slice(0, sse.indexOf('event: message_stop')));
  };
  assert.deepEqual(await read(await start()), [{ type: 'error' }]);

  // A stalled second request retains the receipt for the completed speech and is cancelled.
  const idleService = await listen(createService({ secret, engine, dialogueIdleTimeoutMs: 300 }));
  const { promise: transportClosed, resolve: onTransportClosed } = Promise.withResolvers();
  let interruptedStep = 0;
  reply = (_request, outgoing) => {
    interruptedStep += 1;
    if (interruptedStep === 1) return messagesResponse([speech(1, '已完成的发言。')]);
    outgoing.once('close', onTransportClosed);
  };
  assert.deepEqual(await read(await start(dialogue, 'Bearer ' + secret, idleService)), [
    { type: 'speech', speaker: 1, text: '已完成的发言。', ...receipt(1) },
    { type: 'error', ...receipt(1) },
  ]);
  await transportClosed;
  assert.equal(interruptedStep, 2);

  const { promise: providerWaiting, resolve: onProviderWaiting } = Promise.withResolvers();
  const { promise: clientAbortReachedProvider, resolve: onClientAbort } = Promise.withResolvers();
  interruptedStep = 0;
  reply = (_request, outgoing) => {
    interruptedStep += 1;
    if (interruptedStep === 1) return messagesResponse([speech(2, '请现场用户继续。')]);
    outgoing.once('close', onClientAbort);
    onProviderWaiting();
  };
  const client = (await start()).body.getReader();
  const firstCheckpoint = await client.read();
  assert.deepEqual(JSON.parse(Buffer.from(firstCheckpoint.value).toString()), {
    type: 'speech', speaker: 2, text: '请现场用户继续。', ...receipt(1),
  });
  await providerWaiting;
  await client.cancel();
  await clientAbortReachedProvider;
  assert.equal(interruptedStep, 2);
});
