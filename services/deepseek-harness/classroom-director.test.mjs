import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { directorTurnPath, maxDirectorTurnBytes } from './classroom-director.mjs';
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
