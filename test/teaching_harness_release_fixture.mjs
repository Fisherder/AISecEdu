// Start in the disposable Harness container's network namespace.
import { createServer } from 'node:http';
import { isDeepStrictEqual } from 'node:util';

const model = 'teaching-fixture';
const maxBodyBytes = 8192;
const expectedQuestion = {
  instruction: '请将整个课件换成蓝绿色主题',
  currentPalettes: [{
    background: '#ffffff', foreground: '#172554', muted: '#334155',
    accent: '#1d4ed8', secondary: '#166534', surface: '#e2e8f0',
  }],
};
const expectedSystem = '仅按教师要求调整整套普通静态课件的主题颜色。' +
  '只返回 JSON，顶层为 palette，' +
  '包含 background、foreground、muted、accent、secondary、surface 六种 #RRGGBB 颜色。' +
  '未要求调整的颜色尽量保留，只有为保持对比度时才调整关联色。' +
  '前景与背景对比度至少 7:1，次要文字与背景至少 4.5:1，前景与面板至少 4.5:1，强调色与背景至少 3:1。';
const palette = {
  background: '#102531', foreground: '#f0fff9', muted: '#b6d9ca',
  accent: '#51ebc3', secondary: '#85aaff', surface: '#255248',
};
const wireFields = new Set([
  'model', 'stream', 'max_tokens', 'messages', 'system', 'thinking', 'output_config', 'tools',
]);
const expectedKey = process.env.DEEPSEEK_API_KEY;
let accepted = 0;
let rejected = 0;

function report(event) {
  console.log(JSON.stringify({ event, accepted, rejected }));
}

function matchesPaletteRequest(body) {
  if (!body || typeof body !== 'object' || Object.keys(body).some(key => !wireFields.has(key)) ||
      body.model !== model || body.stream !== true || !Number.isSafeInteger(body.max_tokens) ||
      body.max_tokens <= 0 || body.system !== expectedSystem ||
      (body.tools !== undefined && !isDeepStrictEqual(body.tools, []))) return false;
  const thinkingOff = isDeepStrictEqual(body.thinking, { type: 'disabled' });
  const validEffort = ['low', 'high', 'max'].some(effort =>
    isDeepStrictEqual(body.output_config, { effort }));
  if (thinkingOff ? body.output_config !== undefined :
    !isDeepStrictEqual(body.thinking, { type: 'enabled' }) || !validEffort) return false;

  const [message] = Array.isArray(body.messages) ? body.messages : [];
  const [block] = Array.isArray(message?.content) ? message.content : [];
  if (typeof block?.text !== 'string' || !isDeepStrictEqual(body.messages, [
    { role: 'user', content: [{ type: 'text', text: block.text }] },
  ])) return false;
  return isDeepStrictEqual(JSON.parse(block.text), expectedQuestion);
}

const server = createServer({ requestTimeout: 10_000, headersTimeout: 5000 }, async (request, response) => {
  function reject(status) {
    rejected += 1;
    report('rejected');
    response.writeHead(status, { 'content-type': 'application/json', connection: 'close' });
    response.end('{"error":"unexpected teaching fixture request"}');
  }

  if (request.method === 'GET' && request.url === '/counts') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ accepted, rejected }));
    return;
  }
  if (request.method !== 'POST' || request.url !== '/v1/messages') return reject(404);
  const apiKey = request.headers['x-api-key'];
  if (!apiKey || (expectedKey !== undefined && apiKey !== expectedKey)) return reject(401);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) return reject(415);
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      size += chunk.length;
      if (size > maxBodyBytes) return reject(413);
      chunks.push(chunk);
    }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    if (!matchesPaletteRequest(body) || accepted !== 0) return reject(422);
  } catch {
    return reject(400);
  }

  accepted += 1;
  report('accepted');
  const events = [
    { type: 'message_start', message: { id: 'palette-fixture', model, usage: { input_tokens: 10 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: JSON.stringify({ palette }) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    { type: 'message_stop' },
  ];
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
  response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
});

server.listen(3082, '127.0.0.1', () => report('ready'));
