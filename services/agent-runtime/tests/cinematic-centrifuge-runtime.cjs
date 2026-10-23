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

const { compileCinematicScene } = load(path.join(base, 'lib/cinematic/compile.ts'));
const { referenceScenes } = load(path.join(base, 'lib/cinematic/reference-scenes.ts'));
const html = compileCinematicScene(referenceScenes[3]);

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const failures = [], requests = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    await page.setContent(html);
    await page.waitForFunction(() => globalThis.__cinematic?.getState().renderer === 'webgl' && globalThis.__cinematic.getState().frames > 0);

    const initial = await page.locator('#cinematic-canvas').screenshot();
    const baseline = await page.evaluate(() => ({
      state: __cinematic.getState(),
      input: document.getElementById('learner-rotor-input').value,
      manifest: JSON.parse(document.getElementById('widget-config').textContent),
      nodes: __cinematic.scene.nodes.filter(node => node.model === 'centrifuge-housing').length,
      rotors: __cinematic.scene.nodes.filter(node => /^rotor-[abc]$/.test(node.id)).length,
    }));
    assert.equal(baseline.input, '1000');
    assert.equal(baseline.nodes, 3);
    assert.equal(baseline.rotors, 3);
    assert.equal(baseline.manifest.schema, 'openmaic-widget-interaction-v1');
    assert.ok(baseline.state.drawCalls > 20);
    await page.screenshot({ path: '/tmp/aisecedu-centrifuge-baseline.png', fullPage: true });

    await page.locator('#learner-rotor-input').evaluate(input => { input.value = '3500'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForFunction(() => Math.abs(__cinematic.getState().time - 47.5) < 0.01);
    assert.equal(await page.locator('#learner-feedback').getAttribute('data-tone'), 'danger');
    assert.notDeepEqual(await page.locator('#cinematic-canvas').screenshot(), initial);
    await page.screenshot({ path: '/tmp/aisecedu-centrifuge-critical.png', fullPage: true });

    await page.evaluate(() => window.postMessage({ type: 'SET_WIDGET_STATE', state: { controlValues: { 'rotor-input': 2000 }, playing: false } }, '*'));
    await page.waitForFunction(() => Math.abs(__cinematic.getState().time - 19) < 0.01);
    assert.equal(await page.locator('#learner-rotor-input').inputValue(), '2000');
    await page.evaluate(() => window.postMessage({ type: 'HIGHLIGHT_ELEMENT', target: '#learner-rotor-input' }, '*'));
    await page.waitForFunction(() => document.getElementById('learner-rotor-input').classList.contains('maic-highlight'));

    await page.locator('#learner-emergency-stop').click();
    await page.waitForFunction(() => Math.abs(__cinematic.getState().time - 64) < 0.01);

    const canvas = page.locator('#cinematic-canvas');
    const box = await canvas.boundingBox();
    const beforeView = await page.evaluate(() => __cinematic.getState().camera);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.42, { steps: 5 });
    await page.mouse.up();
    const afterOrbit = await page.evaluate(() => __cinematic.getState().camera);
    assert.notDeepEqual(afterOrbit, beforeView);
    await page.mouse.wheel(0, -400);
    const afterZoom = await page.evaluate(() => __cinematic.getState().camera);
    assert.notDeepEqual(afterZoom, afterOrbit);

    await page.locator('#learner-reset-experiment').click();
    await page.waitForFunction(() => __cinematic.getState().time === 0 && document.getElementById('learner-rotor-input').value === '1000');
    assert.equal(await page.locator('#learner-rotor-input').inputValue(), '1000');
    assert.deepEqual(failures, []);
    assert.deepEqual(requests, []);
    console.log(JSON.stringify({ passed: true, housings: baseline.nodes, rotors: baseline.rotors, drawCalls: baseline.state.drawCalls, learnerInput: true, emergencyStop: true, postMessage: true, orbit: true, zoom: true, reset: true, offline: true }));
    await page.close();
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
