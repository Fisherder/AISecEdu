const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const base = path.resolve(__dirname, '..');
const requireRuntime = createRequire(path.join(base, 'package.json'));
const ts = requireRuntime('typescript');
const { chromium } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const localRequire = createRequire(file);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports,
    structuredClone,
    require(id) {
      if (id.endsWith('?raw')) return { default: fs.readFileSync(path.resolve(path.dirname(file), id.slice(0, -4)), 'utf8') };
      if (id.endsWith('.json')) return { __esModule: true, default: JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), id), 'utf8')) };
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
      return localRequire(id);
    },
  });
  return exports;
}

const { compileProcessScene } = load(path.join(base, 'lib/process/compile.ts'));
const scene = {
  schemaVersion: 'process-v1', title: '逐步状态实验', summary: '设置每步增量，执行两步并核对同步证据。', modelNote: '离散状态教学模型，不连接外部系统。',
  inputs: [{id: 'delta', label: '每步增量', type: 'number', min: 1, max: 3, step: 1, default: 1, presets: [{label: '边界值', value: 3}]}],
  initialState: {amount: 0, phase: 0, history: []},
  views: [
    {id: 'amount', title: '当前累计值', kind: 'value', value: {state: 'amount'}},
    {id: 'phase', title: '当前步骤', kind: 'text', value: {op: 'concat', args: ['第', {state: 'phase'}, '步']}},
    {id: 'history', title: '累计轨迹', kind: 'bars', value: {state: 'history'}},
  ],
  actions: [{id: 'advance', label: '执行一步', description: '将输入增量加入累计值并记录轨迹。', enabledWhen: {op: 'lt', args: [{state: 'phase'}, 2]}, repeatWhile: {op: 'lt', args: [{state: 'phase'}, 2]},
    locals: [{id: 'nextAmount', value: {op: 'add', args: [{state: 'amount'}, {input: 'delta'}]}}],
    updates: [{target: 'amount', value: {local: 'nextAmount'}}, {target: 'phase', value: {op: 'add', args: [{state: 'phase'}, 1]}}, {target: 'history', value: {op: 'append', args: [{state: 'history'}, {local: 'nextAmount'}]}}],
    feedback: {op: 'concat', args: ['累计值更新为 ', {state: 'amount'}]}}],
  stages: [
    {id: 'ready', title: '准备输入', when: {op: 'eq', args: [{state: 'phase'}, 0]}, explanation: '设置增量并观察初始证据。'},
    {id: 'running', title: '观察中间态', when: {op: 'eq', args: [{state: 'phase'}, 1]}, explanation: '比较数值与第一根轨迹柱。'},
    {id: 'done', title: '核对结果', when: {op: 'eq', args: [{state: 'phase'}, 2]}, explanation: '两步完成后核对累计结果。'},
  ],
  questions: [{id: 'check-amount', prompt: '当前累计值是多少？', evidenceView: 'amount'}], coverage: [],
};
const html = compileProcessScene(scene);

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const failures = [], requests = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent(html);
    await page.waitForFunction(() => globalThis.__process?.getState().count === 0);
    const manifest = await page.evaluate(() => JSON.parse(document.getElementById('widget-config').textContent));
    assert.equal(manifest.schema, 'openmaic-widget-interaction-v1');
    assert.ok(manifest.elements.some(item => item.selector === '#action-advance'));
    await page.screenshot({ path: '/tmp/aisecedu-process-baseline.png', fullPage: true });

    await page.evaluate(() => window.postMessage({ type: 'SET_WIDGET_STATE', state: { inputs: { delta: 2 } } }, '*'));
    await page.waitForFunction(() => document.getElementById('input-delta').value === '2');
    await page.locator('#action-advance').click();
    assert.deepEqual(await page.evaluate(() => __process.getState().state), {amount: 2, phase: 1, history: [2]});
    await page.locator('#auto-advance').click();
    await page.waitForFunction(() => __process.getState().state.phase === 2);
    assert.deepEqual(await page.evaluate(() => __process.getState().state), {amount: 4, phase: 2, history: [2, 4]});
    await page.locator('#answer-check-amount').fill('4');
    await page.locator('#check-check-amount').click();
    assert.equal(await page.locator('#check-check-amount').evaluate(button => button.nextElementSibling.dataset.correct), 'true');

    await page.evaluate(() => window.postMessage({ type: 'HIGHLIGHT_ELEMENT', target: '[data-view="history"]' }, '*'));
    await page.waitForFunction(() => document.querySelector('[data-view="history"]').classList.contains('maic-highlight'));
    await page.screenshot({ path: '/tmp/aisecedu-process-complete.png', fullPage: true });
    await page.locator('#process-back').click();
    assert.equal(await page.evaluate(() => __process.getState().state.phase), 1);
    await page.locator('#process-reset').click();
    assert.deepEqual(await page.evaluate(() => __process.getState().state), {amount: 0, phase: 0, history: []});
    assert.equal(await page.locator('#input-delta').inputValue(), '1');
    assert.deepEqual(failures, []);
    assert.deepEqual(requests, []);
    console.log(JSON.stringify({ passed: true, stateInput: true, atomicStep: true, continuousRun: true, verification: true, undo: true, reset: true, postMessage: true, offline: true }));
    await page.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
