const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const base = path.resolve(__dirname, '..');
const requireRuntime = createRequire(path.join(base, 'package.json'));
const ts = requireRuntime('typescript');
const { chromium } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

function load(file) {
  const exports = {};
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
const html = compileCinematicScene({
  schemaVersion: 'cinematic-v1', title: 'Player regression', subtitle: 'Offline fixture', duration: 60,
  objectives: ['Observe deterministic state'], theme: { environment: 'space' },
  nodes: [
    { id: 'bank', kind: 'model', model: 'memory-bank', label: 'Bank', opacity: 0.4, position: [-3, 0, 0], parent: 'stack' },
    { id: 'wave', kind: 'model', model: 'wave-surface', label: 'Wave', opacity: 0.35, position: [3, 0, 0] },
    { id: 'planet', kind: 'model', model: 'planet', opacity: 0.65, position: [0, 0, -5], params: { detail: 1 } },
    { id: 'pairing', kind: 'box', position: [0, 0, 1], params: { width: 2.6, height: 0.5, depth: 0.5 }, color: '#ffffff', emissive: 1 },
    { id: 'stack', kind: 'group' },
  ],
  connections: [{ id: 'flow', from: 'bank', to: 'wave' }],
  tracks: [
    { target: 'bank', property: 'emissive', keyframes: [{ at: 0, value: 0 }, { at: 60, value: 0 }] },
    { target: 'bank', property: 'explode', keyframes: [{ at: 0, value: 0 }, { at: 60, value: 1 }] },
    { target: 'wave', property: 'opacity', keyframes: [{ at: 0, value: 0.35 }, { at: 30, value: 0 }, { at: 60, value: 0.35 }] },
    { target: 'bank', property: 'position', keyframes: [{ at: 0, value: [-3, 0, 0] }, { at: 60, value: [-2, 2, 0] }] },
  ],
  shots: [0, 20, 40, 60].map((at, index) => ({ at, position: [12 + index, 8, 16], target: [0, 0, 0] })),
  chapters: [0, 20, 40, 60].map(at => ({ at, title: 'Observe', caption: 'Observe the model and material state.' })),
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    for (const contextType of ['webgl2', 'webgl']) {
      const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
      const failures = [], requests = [];
      page.on('pageerror', error => failures.push(error.message));
      page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
      await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
      await page.setContent('<body></body>');
      await page.addScriptTag({ content: fs.readFileSync(path.join(base, 'public/vendor/cinematic-three-r150.min.js'), 'utf8') });
      await page.evaluate(kind => {
        if (kind === 'webgl') {
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : getContext.call(this, type, ...args); };
        }
        window.__runtimeTest = { modelDisposals: 0, textureDisposals: 0, targets: new Set(), models: [] };
        const Composer = THREE.EffectComposer;
        THREE.EffectComposer = class extends Composer { constructor(...args) { super(...args); __runtimeTest.composer = this; } };
        const dispose = THREE.WebGLRenderTarget.prototype.dispose;
        THREE.WebGLRenderTarget.prototype.dispose = function () { __runtimeTest.targets.add(this); return dispose.call(this); };
      }, contextType);
      const instrument = `<script>const library=globalThis.CinematicModels;globalThis.CinematicModels={...library,create(T,spec){const root=library.create(T,spec);__runtimeTest.models.push(root);const dispose=root.userData.dispose;root.userData.dispose=()=>{__runtimeTest.modelDisposals++;dispose();};const textures=new Set();root.traverse(o=>{if(o.material)for(const value of Object.values(o.material))if(value?.isTexture)textures.add(value);});for(const texture of textures)texture.addEventListener('dispose',()=>__runtimeTest.textureDisposals++);return root;}};</script>`;
      const source = html.replace('<script src="aisecedu:three"></script>', '').replace('<script>(function(){', instrument + '<script>(function(){');
      await page.setContent(source);
      await page.waitForFunction(() => globalThis.__cinematic && __cinematic.getState().renderer === 'webgl');
      await page.waitForTimeout(150);
      const result = await page.evaluate(() => {
        const bank = __runtimeTest.models[0], wave = __runtimeTest.models[1];
        let bankOpacity, waveOpacity;
        bank.traverse(o => { if (o.material) bankOpacity = o.material.opacity; });
        wave.traverse(o => { if (o.material?.uniforms?.uOpacity) waveOpacity = o.material.uniforms.uOpacity.value; });
        const scene = __runtimeTest.composer.passes[0].scene;
        const tube = scene.children.find(o => o.geometry?.type === 'TubeGeometry');
        __runtimeTest.tube = tube;
        __runtimeTest.geometry = tube.geometry;
        __runtimeTest.positions = tube.geometry.attributes.position;
        __runtimeTest.zeroPositions = Array.from(tube.geometry.attributes.position.array);
        __cinematic.seek(30);
        let emissive = 0, hidden = true;
        bank.traverse(o => { emissive = Math.max(emissive, o.material?.emissiveIntensity || 0); });
        wave.traverse(o => { if (o.material) hidden = hidden && !o.material.visible; });
        __cinematic.scene.tracks.reverse();__cinematic.seek(30);
        bank.traverse(o => { emissive = Math.max(emissive, o.material?.emissiveIntensity || 0); });
        __cinematic.seek(0);
        let maximumDelta = 0;
        tube.geometry.attributes.position.array.forEach((value, i) => { maximumDelta = Math.max(maximumDelta, Math.abs(value - __runtimeTest.zeroPositions[i])); });
        return { bankOpacity, waveOpacity, emissive, hidden, maximumDelta, bufferReused: tube.geometry === __runtimeTest.geometry && tube.geometry.attributes.position === __runtimeTest.positions, state: __cinematic.getState() };
      });
      assert.equal(result.bankOpacity, 0.4);assert.equal(result.waveOpacity, 0.35);
      assert.equal(result.emissive, 0);assert.equal(result.hidden, true);assert.equal(result.bufferReused, true);assert.equal(result.maximumDelta, 0);
      const zero = await page.locator('#cinematic-canvas').screenshot();
      await page.evaluate(() => { __cinematic.seek(17);__cinematic.seek(0); });
      assert.deepEqual(await page.locator('#cinematic-canvas').screenshot(), zero);
      const paused = await page.evaluate(() => __cinematic.getState().frames);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => __cinematic.getState().frames), paused);
      const labels = await page.evaluate(() => {
        const read = () => [...document.querySelectorAll('.node-label')].map(label => ({ hidden: label.hidden, left: label.style.left, top: label.style.top }));
        __cinematic.seek(13);const before = read();
        for (const time of [49, 0.0001, 28.375, 60, 0, 13]) __cinematic.seek(time);
        const after = read();
        const camera = __runtimeTest.composer.passes[0].camera;
        const viewport = document.getElementById('viewport');
        const measured = __cinematic.getFrameDiagnostics().nodes.find(node => node.id === 'bank');
        const position = new THREE.Vector3().fromArray(measured.bounds.min).add(new THREE.Vector3().fromArray(measured.bounds.max)).multiplyScalar(.5).project(camera);
        const expectedTop = (1 - measured.ndc.top) * viewport.clientHeight / 2;
        const expectedLeft = (position.x * 0.5 + 0.5) * viewport.clientWidth;
        __cinematic.seek(0);
        return { before, after, expectedLeft, expectedTop };
      });
      assert.deepEqual(labels.after, labels.before);assert.ok(labels.before.some(label => !label.hidden));
      assert.ok(Math.abs(parseFloat(labels.after[0].left) - labels.expectedLeft) < 0.001);
      assert.ok(Math.abs(parseFloat(labels.after[0].top) - labels.expectedTop) < 0.001);
      const pickPoint = await page.evaluate(() => {
        const bank = __runtimeTest.models[0], camera = __runtimeTest.composer.passes[0].camera;
        const rect = document.getElementById('cinematic-canvas').getBoundingClientRect();
        let mesh;bank.traverse(object => { if (!mesh && object.isMesh && !object.isInstancedMesh) mesh = object; });
        const point = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
        return { x: rect.left + (point.x * 0.5 + 0.5) * rect.width, y: rect.top + (-point.y * 0.5 + 0.5) * rect.height };
      });
      await page.mouse.click(pickPoint.x, pickPoint.y);
      assert.equal(await page.locator('#detail-title').textContent(), 'Bank');
      const hiddenStates = [];
      for (const opacity of [0, 0.05, 0.075]) {
        const hidden = await page.evaluate(value => {
          const bank = __runtimeTest.models[0];bank.parent.userData.spec.opacity = value;__cinematic.seek(0);
          document.getElementById('detail-title').textContent = 'No selection';
          return { opacity: bank.userData.sceneOpacity, labelHidden: [...document.querySelectorAll('.node-label')].find(label => label.textContent === 'Bank').hidden };
        }, opacity);
        assert.ok(hidden.opacity <= 0.03);assert.ok(hidden.labelHidden);
        await page.mouse.click(pickPoint.x, pickPoint.y);
        assert.notEqual(await page.locator('#detail-title').textContent(), 'Bank');
        hiddenStates.push(hidden);
      }
      await page.evaluate(() => { __runtimeTest.models[0].parent.userData.spec.opacity = 1;__cinematic.seek(0); });
      assert.equal(await page.locator('.node-label').filter({ hasText: 'Bank' }).isVisible(), true);
      await page.mouse.click(pickPoint.x, pickPoint.y);
      assert.equal(await page.locator('#detail-title').textContent(), 'Bank');
      await page.evaluate(() => {
        const scene = __runtimeTest.composer.passes[0].scene;
        __runtimeTest.visibility = scene.children.map(object => [object, object.visible]);
        scene.children.forEach(object => { if (!object.isLight) object.visible = false; });
        __runtimeTest.pairing = scene.children.find(object => object.userData.spec?.id === 'pairing');
        __runtimeTest.pairing.visible = true;
        __cinematic.seek(0);
      });
      const opaque = await page.locator('#cinematic-canvas').screenshot();
      const versions = await page.evaluate(() => {
        __runtimeTest.pairing.userData.spec.opacity = 0.5;__cinematic.seek(0);
        const partial = __runtimeTest.pairing.material.version;
        __cinematic.seek(0);
        return { partial, repeated: __runtimeTest.pairing.material.version, transparent: __runtimeTest.pairing.material.transparent };
      });
      assert.equal(versions.partial, versions.repeated);assert.ok(versions.transparent);
      assert.notDeepEqual(await page.locator('#cinematic-canvas').screenshot(), opaque);
      await page.evaluate(() => { __runtimeTest.pairing.userData.spec.opacity = 0;__cinematic.seek(0); });
      const hiddenPrimitive = await page.locator('#cinematic-canvas').screenshot();
      await page.evaluate(() => { __runtimeTest.pairing.visible = false;__cinematic.seek(0); });
      const empty = await page.locator('#cinematic-canvas').screenshot();
      assert.deepEqual(hiddenPrimitive, empty);assert.notDeepEqual(opaque, empty);
      await page.evaluate(() => {
        const wave = __runtimeTest.models[1];wave.visible = true;
        wave.traverse(object => { if (object.isMesh) object.visible = !!object.material.isShaderMaterial; });
        __cinematic.seek(0);
      });
      assert.notDeepEqual(await page.locator('#cinematic-canvas').screenshot(), empty);
      await page.evaluate(() => {
        const track = __cinematic.scene.tracks.find(track => track.target === 'wave' && track.property === 'opacity');
        __runtimeTest.waveTrack = track;__runtimeTest.waveFrames = track.keyframes;
        track.keyframes = track.keyframes.map(key => ({ ...key, value: 0 }));__cinematic.seek(0);
        __runtimeTest.models[1].traverse(object => { if (object.material?.isShaderMaterial) object.material.visible = true; });
        __runtimeTest.composer.render();
      });
      assert.deepEqual(await page.locator('#cinematic-canvas').screenshot(), empty);
      await page.evaluate(() => {
        __runtimeTest.waveTrack.keyframes = __runtimeTest.waveFrames;
        __runtimeTest.pairing.userData.spec.opacity = 1;
        for (const [object, visible] of __runtimeTest.visibility) object.visible = visible;
        __runtimeTest.models[1].traverse(object => { if (object.isMesh) object.visible = true; });
        __cinematic.seek(0);
      });
      await page.setViewportSize({ width: 390, height: 800 });
      await page.locator('#viewport').evaluate(element => { element.style.setProperty('height', '500px', 'important');element.style.setProperty('min-height', '500px', 'important'); });
      await page.waitForTimeout(100);
      const fit = await page.evaluate(() => {
        const camera = __runtimeTest.composer.passes[0].camera, shot = __cinematic.scene.shots[0];
        const expected = Math.hypot(...shot.position.map((value, index) => value - shot.target[index])) * Math.max(1, (16 / 9) / camera.aspect);
        return { expected, actual: Math.hypot(...__cinematic.getState().camera.map((value, index) => value - shot.target[index])), aspect: camera.aspect };
      });
      assert.ok(Math.abs(fit.actual - fit.expected) < 1e-7);assert.ok(fit.aspect < 1);
      await page.locator('#viewport').evaluate(element => { element.style.removeProperty('height');element.style.removeProperty('min-height'); });
      await page.setViewportSize({ width: 900, height: 650 });await page.waitForTimeout(100);
      const framing = await page.evaluate(() => {
        const bank = __runtimeTest.models[0];
        const instances = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2);
        instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-12, 0, 0));
        instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(12, 0, 0));
        bank.add(instances);
        for (const shot of __cinematic.scene.shots) shot.frame = { nodes: ['bank'], padding: 1.2 };
        const results = [0, 30, 60].map(time => {
          __cinematic.seek(time);
          return __cinematic.getFrameDiagnostics().nodes.find(node => node.id === 'bank');
        });
        instances.visible = false;__cinematic.seek(0);
        const withoutInstances = __cinematic.getFrameDiagnostics().nodes.find(node => node.id === 'bank');
        bank.remove(instances);instances.geometry.dispose();instances.material.dispose();
        __cinematic.seek(60);
        const exploded = __cinematic.getFrameDiagnostics().nodes.find(node => node.id === 'bank');
        return { results, withoutInstances, exploded };
      });
      for (const item of framing.results) {
        assert.ok(item.inside, 'every distant instance remains within the fitted camera');
        assert.ok(item.bounds.max[0] - item.bounds.min[0] >= 24.99, 'bounds include instance transforms, not only base geometry');
      }
      assert.ok(framing.withoutInstances.bounds.max[0] - framing.withoutInstances.bounds.min[0] < 24);
      assert.ok(framing.exploded.inside, 'expanded model remains framed');
      await page.setViewportSize({ width: 390, height: 800 });await page.waitForTimeout(100);
      assert.ok(await page.evaluate(() => __cinematic.getFrameDiagnostics().nodes.find(node => node.id === 'bank').inside), 'frame fitting also supports portrait aspect');
      await page.evaluate(() => { for (const shot of __cinematic.scene.shots) delete shot.frame;__cinematic.seek(0); });
      await page.setViewportSize({ width: 900, height: 650 });await page.waitForTimeout(100);
      await page.locator('#animation-play').click();
      const begin = await page.evaluate(() => ({ now: performance.now(), frames: __cinematic.getState().frames }));
      await page.waitForTimeout(700);
      const end = await page.evaluate(() => ({ now: performance.now(), ...__cinematic.getState() }));
      assert.ok(end.time > 0);assert.ok(end.frames > begin.frames);assert.ok(end.drawCalls > 10);
      await page.locator('#animation-pause').click();
      await page.selectOption('#quality', 'low');
      assert.deepEqual(await page.evaluate(() => ({ bloom: __runtimeTest.composer.passes[1].enabled, gamma: __runtimeTest.composer.passes[2].enabled })), { bloom: false, gamma: true });
      const disposal = await page.evaluate(() => {
        const composer = __runtimeTest.composer, bloom = composer.passes[1];
        const targets = [composer.renderTarget1, composer.renderTarget2, bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical];
        __cinematic.dispose();__cinematic.dispose();
        return { modelDisposals: __runtimeTest.modelDisposals, textureDisposals: __runtimeTest.textureDisposals, allTargetsDisposed: targets.every(target => __runtimeTest.targets.has(target)), disposed: __cinematic.getState().disposed };
      });
      assert.equal(disposal.modelDisposals, 3);assert.equal(disposal.textureDisposals, 5);assert.ok(disposal.allTargetsDisposed);assert.ok(disposal.disposed);
      assert.deepEqual(failures, []);assert.deepEqual(requests, []);
      console.log(JSON.stringify({ contextType, passed: true, initialOpacity: result.bankOpacity, shaderOpacity: result.waveOpacity, resetPixelsIdentical: true, pausedFramesStable: true, linkBuffersReused: true, seekLabelsDeterministic: true, hiddenLabelsAndRaycast: hiddenStates, primitiveAndShaderPixelHide: true, stableMaterialVersion: true, portraitFit: fit, playingFps: +(1000 * (end.frames - begin.frames) / (end.now - begin.now)).toFixed(1), totalDrawCalls: end.drawCalls, disposal }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
