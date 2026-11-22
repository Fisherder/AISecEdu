// Runs the React workbench against a loopback teaching API.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { build } = require('esbuild');

const root = resolve(__dirname, '../../..');
const runtimeRequire = createRequire(resolve(root, 'services/agent-runtime/package.json'));
const { chromium } = runtimeRequire('@playwright/test');
const thread = { id: 'teacher-library', title: '图书馆讨论', dojoId: -11, moduleIndex: 0, status: 'ACTIVE' };
const reason = 'teacher_requested_ordinary_debate';
const proposals = ['来访需求', '排班安排', '假期开放', '意见收集'].map((title, index) => ({
  id: `proposal-${index + 1}`, title, summary: '比较不同安排对同学们的影响。',
  content: { type: 'debate', objectives: ['依据记录解释安排'] },
}));
const parent = { id: 'ordinary-parent', kind: 'debate', status: 'READY', request: { generationReason: reason }, candidates: proposals };
const legacy = { ...parent, id: 'legacy-parent', request: {} };
const derived = { ...parent, id: 'derived-set', candidates: [
  { ...proposals[0], id: 'derived-proposal', title: '派生方案：四周试行开放' },
] };
const messages = [
  { id: 1, role: 'assistant', content: '可以审阅辩论方案了。', metadata: { pending: false }, cards: [
    { id: 'parent-card', objectType: 'candidate_set', objectId: parent.id, title: '普通辩论候选' },
    { id: 'legacy-card', objectType: 'candidate_set', objectId: legacy.id, title: '旧辩论候选' },
  ] },
];
const calls = [];
const unexpectedWrites = [];
let job;

async function loadAsset() {
  if (process.argv.includes('--shipped')) {
    const template = readFileSync(resolve(root, 'dojo_theme/templates/teacher_workbench.html'), 'utf8');
    const match = template.match(/path='(js\/dojo\/workbench-v3\/app-([a-f0-9]{12})\.js)', v='\2'/);
    assert.ok(match, 'The teacher template should select a hashed workbench bundle');
    const bytes = readFileSync(resolve(root, 'dojo_theme/static', match[1]));
    assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 12), match[2]);
    return { path: '/' + match[1] + '?v=' + match[2], bytes };
  }
  const bundle = await build({
    entryPoints: [resolve(__dirname, '../src/main.tsx')], write: false, bundle: true, format: 'iife',
    target: ['es2022'], jsx: 'automatic', loader: { '.css': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return { path: '/source-build.js', bytes: bundle.outputFiles[0].contents };
}

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

async function main() {
  const asset = await loadAsset();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/teacher') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html><div id="cocreation-workbench" data-owner-id="synthetic" style="height:900px"></div><script defer src="${asset.path}"></script>`);
      return;
    }
    if (request.url === asset.path) {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(asset.bytes);
      return;
    }
    const prefix = '/pwncollege_api/v1/teaching';
    const path = url.pathname.slice(prefix.length);
    const ok = (data) => json(response, 200, { success: true, data });
    if (url.pathname.startsWith(prefix) && request.method === 'GET') {
      if (path === '/context') return ok({ teacherDojos: [] });
      if (path === '/threads') return ok({ threads: [thread] });
      if (path === '/threads/' + thread.id) return ok({ thread: { ...thread, messages } });
      if (path === '/jobs') return ok({ jobs: job ? [job] : [] });
      if (path === '/artifacts') return ok({ artifacts: [] });
      if (path === '/materials') return ok({ materials: [] });
      if (path.endsWith('/events')) return ok({ events: [], job, nextCursor: 0 });
      const set = [parent, legacy, derived].find((item) => path === '/candidate-sets/' + item.id);
      if (set) return ok({ candidateSet: set });
    }
    if (request.method === 'POST' && path === '/candidate-sets/' + parent.id + '/derive') {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      calls.push({ body: JSON.parse(raw), key: request.headers['idempotency-key'] });
      if (calls.length === 1) return json(response, 502, { success: false, error: '合成临时故障' });
      job = {
        id: 'derive-job-1', kind: 'candidate.generate', artifactType: 'debate', threadId: thread.id,
        title: '派生辩论方案', status: 'QUEUED',
        resultTarget: { kind: 'candidate', candidateSetId: derived.id },
      };
      return json(response, 202, { success: true, data: { candidateSet: { id: derived.id }, job } });
    }
    if (request.method !== 'GET') unexpectedWrites.push({ method: request.method, path });
    return json(response, 404, { success: false });
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1024, height: 860 } });
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const load = () => page.goto(origin + '/teacher?thread=' + thread.id);
    const dialog = page.getByRole('dialog', { name: '审阅生成成品' });
    await load();

    await page.getByRole('button', { name: /旧辩论候选/ }).click();
    await dialog.getByRole('heading', { name: proposals[0].title }).waitFor();
    assert.equal(await dialog.getByText('从现有方案派生', { exact: true }).count(), 0);
    assert.equal(await dialog.getByRole('button', { name: '打开成品工作区' }).count(), 4);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /普通辩论候选/ }).click();
    await dialog.getByText('从现有方案派生', { exact: true }).click();
    const submit = dialog.getByRole('button', { name: '生成新辩论方案' });
    assert.equal(await submit.isEnabled(), false);
    await dialog.getByRole('checkbox', { name: '来访需求' }).check();
    await dialog.getByRole('checkbox', { name: '假期开放' }).check();
    await dialog.getByLabel('派生要求').fill('增加一轮证据比较。');
    await dialog.getByLabel('新方案数量').selectOption('4');
    await submit.evaluate((button) => { button.click(); button.click(); });
    await dialog.getByRole('alert').getByText('合成临时故障', { exact: true }).waitFor();
    assert.equal(calls.length, 1, 'Two rapid clicks should submit only once');
    assert.ok(calls[0].key);
    assert.deepEqual(calls[0].body, {
      candidateIds: ['proposal-1', 'proposal-3'], instruction: '增加一轮证据比较。', candidateCount: 4,
    });

    await submit.click();
    await dialog.getByRole('status').getByText('等待执行', { exact: true }).waitFor();
    assert.equal(await submit.isEnabled(), false);
    assert.deepEqual(calls[1], calls[0], 'The same request must reuse its idempotency key after a transient failure');
    assert.equal(await dialog.getByRole('button', { name: '打开成品工作区' }).count(), 4);

    await dialog.getByRole('button', { name: '打开任务中心' }).click();
    await page.getByRole('heading', { name: '任务中心' }).waitFor();
    const task = page.locator('.task-row').filter({ hasText: '派生辩论方案' });
    await task.getByText('等待执行', { exact: true }).waitFor();
    assert.equal(await task.getByRole('button', { name: '查看辩论候选' }).count(), 0);
    job = { ...job, status: 'SUCCEEDED' };
    await task.getByRole('button', { name: '查看辩论候选' }).click({ timeout: 15000 });
    await dialog.getByRole('heading', { name: derived.candidates[0].title }).waitFor();
    assert.deepEqual(unexpectedWrites, []);
    assert.deepEqual(errors, []);
    console.log(`Ordinary debate derivation works in the ${process.argv.includes('--shipped') ? 'shipped' : 'source'} build.`);
  } finally {
    await browser?.close();
    await new Promise((closed) => server.close(closed));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
