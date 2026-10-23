const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { chromium } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = path.resolve(__dirname, '..');
const runtimeRequire = createRequire(path.join(base, 'package.json'));
const ts = runtimeRequire('typescript');
let checks = 0;
function check(value, message) { checks++; if (!value) throw Error(message); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function load(file) {
  if (file.endsWith('.json')) return { __esModule: true, default: JSON.parse(fs.readFileSync(file, 'utf8')) };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, structuredClone,
    require(id) {
      if (id.endsWith('?raw')) return { default: fs.readFileSync(path.resolve(path.dirname(file), id.slice(0, -4)), 'utf8') };
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), path.extname(id) ? id : id + '.ts'));
      return runtimeRequire(id);
    },
  });
  return exports;
}
const definitions = load(path.join(base, 'lib/cinematic/asset-definitions.ts'));
const definitionsJson = JSON.parse(fs.readFileSync(path.join(base, 'lib/cinematic/asset-definitions.json'), 'utf8'));
check(same([...definitions.cinematicAssetKinds], Object.keys(definitionsJson)), 'VM loader resolves JSON default imports without appending .ts');
const planningDefinitions = definitions.cinematicPlanningAssets();
check(same(planningDefinitions.map(asset => asset.kind), Object.keys(definitionsJson)), 'planning summaries preserve every JSON asset in order');
function mutateDefinitionCopy(value) {
  if (value === null || typeof value !== 'object') return;
  Object.values(value).forEach(mutateDefinitionCopy);
  if (Array.isArray(value)) value.push('test-copy-mutation');
  else value.testCopyMutation = true;
}
for (const [kind, source] of Object.entries(definitionsJson)) {
  const { defaultStructure, ...coreJson } = source;
  const planningJson = { kind, roles: source.roles, representation: source.representation, defaultStructure };
  const core = definitions.assetDefinition(kind);
  const planning = planningDefinitions.find(asset => asset.kind === kind);
  check(same(core, coreJson), kind + ': core definition preserves every core JSON value');
  check(same(planning, planningJson), kind + ': planning summary preserves every structural JSON value');
  check(same({ ...core, defaultStructure: planning.defaultStructure }, source), kind + ': derived interfaces jointly preserve the complete JSON definition');
  const corePeer = definitions.assetDefinition(kind);
  const planningPeer = definitions.cinematicPlanningAssets().find(asset => asset.kind === kind);
  mutateDefinitionCopy(core);
  mutateDefinitionCopy(planning);
  check(same(corePeer, coreJson), kind + ': existing core copies share no mutable JSON values');
  check(same(planningPeer, planningJson), kind + ': existing planning copies share no mutable JSON values');
  check(same(definitions.assetDefinition(kind), coreJson), kind + ': mutating a core copy cannot change stored JSON values');
  check(same(definitions.cinematicPlanningAssets().find(asset => asset.kind === kind), planningJson), kind + ': mutating a planning copy cannot change stored JSON values');
}
const { compileCinematicScene } = load(path.join(base, 'lib/cinematic/compile.ts'));
const fixture = {
  schemaVersion: 'cinematic-v1', title: 'Quality and interaction regression', subtitle: 'Offline real GPU fixture', duration: 40,
  objectives: ['Verify GPU configuration and camera interaction'], theme: { environment: 'laboratory' },
  nodes: [
    { id: 'chip', kind: 'model', model: 'processor', label: 'Processor', position: [-3, 0, 0] },
    { id: 'stack', kind: 'group', position: [3, 0, 0] },
    { id: 'orb', kind: 'sphere', parent: 'stack', label: 'Orb', color: '#45d9ed', emissive: 0.5 },
    { id: 'other', kind: 'box', position: [3, 0, -4], color: '#f0b751' },
  ],
  connections: [{ id: 'relevant', from: 'chip', to: 'orb' }, { id: 'background', from: 'orb', to: 'other' }],
  tracks: [
    { target: 'chip', property: 'rotation', keyframes: [{ at: 0, value: [0, 0, 0] }, { at: 40, value: [0, 0.4, 0] }] },
    { target: 'other', property: 'emissive', keyframes: [{ at: 0, value: 0 }, { at: 40, value: 0.3 }] },
  ],
  shots: [0, 13, 26, 40].map((at, i) => ({ at, position: [12 - i * 2, 8 + i, 16], target: [0, 0, 0] })),
  chapters: [0, 10, 20, 30].map(at => ({ at, title: at < 20 ? 'Focus' : 'Overview', caption: 'Inspect the scene', focus: at < 20 ? ['chip'] : [] })),
};
let html = compileCinematicScene(fixture).replace('<script src="aisecedu:three"></script>', '');
if (!html.includes('id="interaction-hint"')) html = html.replace('</footer>', '<span id="interaction-hint"></span><output id="quality-output"></output></footer>');
const vendor = fs.readFileSync(path.join(base, 'public/vendor/cinematic-three-r150.min.js'), 'utf8');
const read = page => page.evaluate(() => __cinematic.getState());
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function boot(browser, dpr, kind, limited = false) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: dpr, hasTouch: true });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || /GL_INVALID|incomplete framebuffer/i.test(message.text())) errors.push(message.text()); });
  await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: vendor });
  await page.evaluate(({ kind, limited }) => {
    window.audit = { gpuCalls: 0, framebuffers: new Set(), renderbuffers: new Set(), textures: new Set(), deletedTargets: new Set(), allocations: 0 };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (kind === 'fallback' && /^webgl/.test(type) || kind === 'webgl' && type === 'webgl2') return null;
      const gl = getContext.call(this, type, ...args);
      if (gl && /^webgl/.test(type) && !gl.auditInstalled) {
        gl.auditInstalled = true;
        if (limited) { const get = gl.getParameter.bind(gl); gl.getParameter = key => key === gl.MAX_TEXTURE_SIZE || key === gl.MAX_RENDERBUFFER_SIZE ? 1024 : key === gl.MAX_VIEWPORT_DIMS ? new Int32Array([1024, 1024]) : get(key); }
        for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'clear', 'blitFramebuffer']) if (gl[method]) {
          const original = gl[method].bind(gl); gl[method] = (...args) => { audit.gpuCalls++; return original(...args); };
        }
        for (const [kind, key] of [['Framebuffer', 'framebuffers'], ['Renderbuffer', 'renderbuffers'], ['Texture', 'textures']]) {
          const create = gl['create' + kind].bind(gl), remove = gl['delete' + kind].bind(gl);
          gl['create' + kind] = () => { const handle = create(); audit[key].add(handle); audit.allocations++; return handle; };
          gl['delete' + kind] = handle => { audit[key].delete(handle); return remove(handle); };
        }
      }
      return gl;
    };
    const Renderer = THREE.WebGLRenderer, Composer = THREE.EffectComposer, dispose = THREE.WebGLRenderTarget.prototype.dispose;
    THREE.WebGLRenderer = class extends Renderer { constructor(...args) { super(...args); audit.renderer = this; } };
    THREE.EffectComposer = class extends Composer { constructor(...args) { super(...args); audit.composer = this; } };
    THREE.WebGLRenderTarget.prototype.dispose = function () { audit.deletedTargets.add(this); return dispose.call(this); };
  }, { kind, limited });
  await page.setContent(html);
  await page.waitForFunction(() => globalThis.__cinematic);
  await settle(page);
  return { page, context, errors, requests };
}
async function pixels(page) {
  return page.evaluate(() => {
    __cinematic.seek(0);
    const gl = audit.renderer.getContext(), data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let hash = 2166136261; for (const value of data) hash = Math.imul(hash ^ value, 16777619);
    return { hash: hash >>> 0, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight };
  });
}
async function quality(page, value) {
  await page.selectOption('#quality', value); await settle(page);
  const state = await read(page), gpu = state.gpu;
  const actual = await page.evaluate(() => {
    const r = audit.renderer, gl = r.getContext(), previous = r.getRenderTarget();
    const targets = [audit.composer.renderTarget1, audit.composer.renderTarget2].map(target => {
      r.setRenderTarget(target);
      const raw = r.properties.get(target).__webglColorRenderbuffer, buffer = Array.isArray(raw) ? raw[0] : raw;
      let size = [target.width, target.height];
      if (buffer) { const old = gl.getParameter(gl.RENDERBUFFER_BINDING); gl.bindRenderbuffer(gl.RENDERBUFFER, buffer); size = [gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_WIDTH), gl.getRenderbufferParameter(gl.RENDERBUFFER, gl.RENDERBUFFER_HEIGHT)]; gl.bindRenderbuffer(gl.RENDERBUFFER, old); }
      return { width: size[0], height: size[1], samples: gl.getParameter(gl.SAMPLES), complete: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE };
    });
    r.setRenderTarget(previous);
    return { targets, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, cssWidth: r.domElement.clientWidth, cssHeight: r.domElement.clientHeight };
  });
  check(state.quality === value, 'quality selection state');
  check(same(gpu.composer.targets, actual.targets), 'reported target metrics must equal actual GPU allocation');
  check(actual.targets.every(target => target.complete && Number.isInteger(target.width) && Number.isInteger(target.height)), 'complete integer-sized FBOs');
  check(gpu.drawingBuffer.width === actual.width && gpu.drawingBuffer.height === actual.height, 'reported drawing buffer');
  check(actual.width === Math.floor(actual.cssWidth * gpu.pixelRatio) && actual.height === Math.floor(actual.cssHeight * gpu.pixelRatio), 'renderer/composer resolution agreement');
  check(actual.width * actual.height <= gpu.pixelBudget && actual.width <= gpu.limits.width && actual.height <= gpu.limits.height, 'pixel and hardware bounds');
  check(gpu.bloom.enabled === (value !== 'low') && gpu.gamma === true, 'bloom switch preserves gamma');
  check(gpu.shadow.enabled === (value !== 'low') && (value !== 'low' || same(gpu.shadow.mapSize, [0, 0])), 'actual shadow visibility');
  check(value === 'low' ? gpu.samples === 0 : gpu.samples <= gpu.requestedSamples, 'hardware-supported sample selection');
  check((await page.locator('#quality-output').textContent()).includes(actual.width + '×' + actual.height), 'quality status uses actual pixels');
  return { quality: value, gpu, pixels: await pixels(page) };
}
async function paused(page) {
  await settle(page);
  const start = await page.evaluate(() => ({ frames: __cinematic.getState().frames, gpuCalls: audit.gpuCalls }));
  await page.waitForTimeout(180);
  const end = await page.evaluate(() => ({ frames: __cinematic.getState().frames, gpuCalls: audit.gpuCalls }));
  check(same(start, end), 'paused player must submit zero GPU work');
}
async function controls(page, context) {
  const pickPoint = async () => page.evaluate(() => {
    let orb; audit.composer.passes[0].scene.traverse(object => { if (object.userData.spec?.id === 'orb') orb = object; });
    const p = orb.getWorldPosition(new THREE.Vector3()).project(audit.composer.passes[0].camera), rect = document.getElementById('cinematic-canvas').getBoundingClientRect();
    return { x: rect.left + (p.x * .5 + .5) * rect.width, y: rect.top + (-p.y * .5 + .5) * rect.height };
  });
  await page.evaluate(() => __cinematic.seek(0));
  const point = await pickPoint();
  await page.mouse.click(point.x, point.y); await settle(page);
  check(await page.locator('#detail-title').textContent() === 'Orb' && !(await read(page)).explore, 'model click must not enter exploration');
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 2, point.y + 1); await page.mouse.up();
  check(!(await read(page)).explore, 'click jitter does not become a drag');
  const initial = await read(page);
  await page.locator('#animation-play').click(); await page.waitForTimeout(120);
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 80, point.y - 35, { steps: 8 }); await page.mouse.up(); await settle(page);
  const rotated = await read(page);
  check(rotated.explore && !rotated.playing && !same(rotated.camera, initial.camera), 'direct drag changes actual camera and pauses');
  await paused(page); check(same((await read(page)).camera, rotated.camera) && (await read(page)).time === rotated.time, 'exploration freezes director pose and time');
  await page.mouse.move(point.x, point.y); await page.mouse.wheel(0, -300); await settle(page);
  const zoomed = await read(page);
  check(zoomed.zoom < rotated.zoom && !same(zoomed.camera, rotated.camera), 'wheel changes actual camera distance');
  const distance = state => Math.hypot(...state.camera.map((v, i) => v - state.cameraTarget[i]));
  check(Math.abs(distance(zoomed) / distance(rotated) - zoomed.zoom / rotated.zoom) < 1e-7, 'zoom is reflected in actual camera radius');
  await page.locator('#camera-mode').click(); await settle(page); const director = await read(page);
  await page.evaluate(time => __cinematic.seek(time), director.time);
  check(!director.explore && !director.playing && same(director.camera, (await read(page)).camera), 'return to director remains paused at current time');
  await page.locator('#zoom-in').click(); await page.evaluate(() => __cinematic.seek(20));
  check(!(await read(page)).explore && (await read(page)).zoom === 1, 'seek exits exploration');
  await page.locator('#animation-reset').click(); await settle(page);
  check((await read(page)).time === 0 && !(await read(page)).explore && (await read(page)).zoom === 1, 'reset restores director controls');
  const rect = await page.locator('#cinematic-canvas').boundingBox(), x = rect.x + rect.width * .5, y = rect.y + rect.height * .4;
  const cdp = await context.newCDPSession(page), touch = (id, px, py) => ({ id, x: px, y: py, radiusX: 2, radiusY: 2, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, x - 35, y), touch(2, x + 35, y)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, x - 80, y), touch(2, x + 80, y)] });
  await settle(page); const pinched = await read(page);
  check(pinched.zoom < 1 && pinched.explore && pinched.yaw === 0 && pinched.pitch === 0, 'pinch zoom must not accidentally rotate');
  check(!same(pinched.camera, initial.camera), 'pinch moves actual camera');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  check((await read(page)).activePointers === 0, 'multi-pointer cancel clears captured contacts');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(3, x, y)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(3, x + 40, y - 20)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(page);
  check((await read(page)).yaw !== 0 && (await read(page)).activePointers === 0, 'single touch recovers after multi-touch cancellation');
  await page.locator('#animation-reset').click(); await settle(page); const tap = await pickPoint();
  await page.touchscreen.tap(tap.x, tap.y);
  check(await page.locator('#detail-title').textContent() === 'Orb' && !(await read(page)).explore, 'touch tap still selects a model');
  await page.locator('#zoom-in').click(); await page.locator('#animation-play').click(); await page.waitForTimeout(100);
  check(!(await read(page)).explore && (await read(page)).playing, 'play resumes director motion');
  await page.locator('#animation-pause').click(); await paused(page);
}
async function links(page) {
  const result = await page.evaluate(() => {
    __cinematic.seek(0);
    const scene = audit.composer.passes[0].scene, tubes = scene.children.filter(object => object.geometry?.type === 'TubeGeometry');
    const focus = tubes.map(tube => tube.material.visible);
    const stack = __cinematic.scene.nodes.find(node => node.id === 'stack'), orb = __cinematic.scene.nodes.find(node => node.id === 'orb');
    stack.opacity = .5; orb.opacity = .5; __cinematic.seek(0); const faded = tubes[0].material.opacity;
    stack.opacity = 0; __cinematic.seek(0); const hidden = tubes[0].material.visible;
    stack.opacity = 1; orb.opacity = 1; __cinematic.seek(0);
    return { focus, faded, hidden, restored: tubes[0].material.opacity };
  });
  check(same(result.focus, [true, false]), 'focus hides unrelated background links');
  check(Math.abs(result.faded - .35 * .25) < 1e-10 && !result.hidden && result.restored === .35, 'connections inherit endpoint ancestor opacity reversibly');
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const results = [];
  try {
    for (const dpr of [1, 2]) for (const kind of ['webgl2', 'webgl']) {
      const { page, context, errors, requests } = await boot(browser, dpr, kind);
      const start = checks, samples = [];
      for (const value of ['auto', 'high', 'low', 'auto']) samples.push(await quality(page, value));
      check(new Set(samples.slice(0, 3).map(sample => sample.gpu.pixelRatio)).size === 3, 'all three profiles have independent actual resolution');
      check(same(samples[0].pixels, samples[3].pixels), 'quality round-trip restores actual pixels');
      await paused(page);
      const resources = () => page.evaluate(() => ({ fb: audit.framebuffers.size, rb: audit.renderbuffers.size, tex: audit.textures.size }));
      const baseline = await resources();
      for (const value of ['high', 'low', 'auto', 'high', 'low', 'auto']) { await page.selectOption('#quality', value); await settle(page); }
      check(same(baseline, await resources()), 'hot quality switching must not leak GPU resources');
      const generation = (await read(page)).gpu.composer.generation;
      await page.selectOption('#quality', 'auto'); await settle(page);
      check((await read(page)).gpu.composer.generation === generation, 'same-profile selection must not rebuild FBOs');
      await links(page);
      if (dpr === 1 && kind === 'webgl2') {
        await controls(page, context);
        await page.selectOption('#quality', 'high'); await page.setViewportSize({ width: 3000, height: 2100 }); await settle(page);
        const large = (await read(page)).gpu; check(large.limited && large.drawingBuffer.width * large.drawingBuffer.height <= large.pixelBudget, 'large viewport enforces pixel budget');
      }
      check(errors.length === 0 && requests.length === 0, 'no browser errors or network requests: ' + errors.join(';'));
      await page.evaluate(() => { __cinematic.dispose(); __cinematic.dispose(); });
      const remaining = await page.evaluate(() => {
        const gl = audit.renderer.getContext();
        return { fb: [...audit.framebuffers].filter(handle => gl.isFramebuffer(handle)).length, rb: [...audit.renderbuffers].filter(handle => gl.isRenderbuffer(handle)).length, tex: [...audit.textures].filter(handle => gl.isTexture(handle)).length, contextLost: gl.isContextLost() };
      });
      check(remaining.contextLost && remaining.fb === 0 && remaining.rb === 0 && remaining.tex === 0, 'dispose releases live GPU resources, including context-owned placeholders: ' + JSON.stringify(remaining));
      const result = { kind, dpr, passed: true, checks: checks - start, profiles: samples.slice(0, 3).map(({ quality, gpu }) => ({ quality, drawingBuffer: gpu.drawingBuffer, samples: gpu.samples, shadow: gpu.shadow.mapSize, bloom: gpu.bloom.enabled })), remaining };
      results.push(result); console.log(JSON.stringify(result)); await context.close();
    }
    const limited = await boot(browser, 2, 'webgl2', true);
    const capped = await quality(limited.page, 'high');
    check(capped.gpu.limited && capped.gpu.drawingBuffer.width <= 1024 && capped.gpu.drawingBuffer.height <= 1024 && capped.gpu.shadow.mapSize[0] <= 1024, 'simulated small hardware caps apply to FBO and shadow');
    check(limited.errors.length === 0, 'limited hardware fixture has no rendering errors');
    await limited.page.evaluate(() => __cinematic.dispose()); await limited.context.close();
    const fallback = await boot(browser, 2, 'fallback');
    check((await read(fallback.page)).renderer === '2d' && (await read(fallback.page)).gpu === null, 'fallback does not report fictitious GPU metrics');
    for (const id of ['camera-mode', 'explode-mode', 'zoom-in', 'zoom-out', 'quality']) check(await fallback.page.locator('#' + id).isDisabled(), 'fallback disables ' + id);
    check((await fallback.page.locator('#interaction-hint').textContent()).includes('不可用'), 'fallback states unavailable 3D controls honestly');
    await fallback.page.locator('#animation-play').click(); await fallback.page.waitForTimeout(100);
    check((await read(fallback.page)).time > 0, 'fallback playback remains functional');
    check(fallback.errors.length === 0 && fallback.requests.length === 0, 'fallback has no errors or network');
    await fallback.page.evaluate(() => __cinematic.dispose()); await fallback.context.close();
    console.log(JSON.stringify({ passed: true, checks, webglContexts: results.length, hardwareCapFixture: true, fallbackFixture: true, evidence: 'stdout', files: ['lib/cinematic/player.js', 'tests/cinematic-quality-controls.cjs'] }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
