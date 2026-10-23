const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = path.resolve(__dirname, '..');
const output = path.resolve(base, '../../cache/cinematic-assets-v2');
const cases = [
  { kind: 'valve', params: { detail: 3, opening: 0.65 }, view: [4, 2.8, 6.5] },
  { kind: 'pipe-assembly', params: { detail: 3, layout: 'elbow' }, view: [4.5, 5.8, 6.5] },
  { kind: 'circuit-board', params: { detail: 3 }, view: [2.5, 6.4, 4.7] },
  { kind: 'logic-stack', params: { detail: 3, activeLayer: 4, activeCell: 3 }, view: [3.4, 4.1, 6.5] },
  { kind: 'planet', params: { detail: 3, seed: 26, speed: 0, waterLevel: 0.05, rings: true }, view: [2.3, 2.8, 6.5] },
];

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { sourceHash: crypto.createHash('sha256').update(fs.readFileSync(path.join(base, 'lib/cinematic/models.js'))).digest('hex'), assets: [], requests: [], errors: [] };
  try {
    for (const spec of cases) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
      await page.route('**/*', route => { report.requests.push(route.request().url()); return route.abort(); });
      await page.setContent('<!doctype html><style>body{margin:0;background:#0b121b;color:#c7d9e5;font:16px system-ui}header{position:absolute;left:34px;top:24px;letter-spacing:.1em;pointer-events:none}small{display:block;font-size:12px;letter-spacing:.03em;color:#8197a5;margin-top:7px}canvas{display:block}#state{position:absolute;bottom:24px;left:34px;font-size:13px;color:#95c9cd}</style><header></header><canvas></canvas><div id="state"></div>');
      await page.addScriptTag({ content: fs.readFileSync(path.join(base, 'public/vendor/cinematic-three-r150.min.js'), 'utf8') });
      await page.addScriptTag({ content: fs.readFileSync(path.join(base, 'lib/cinematic/models.js'), 'utf8') });
      const initial = await page.evaluate(spec => {
        const T = THREE;
        T.ColorManagement.enabled = true;
        const renderer = new T.WebGLRenderer({ canvas: document.querySelector('canvas'), antialias: true, alpha: false, preserveDrawingBuffer: true });
        renderer.setSize(1280, 900); renderer.setPixelRatio(1);
        renderer.physicallyCorrectLights = true; renderer.outputEncoding = T.sRGBEncoding;
        renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
        const scene = new T.Scene(); scene.background = new T.Color('#0b121b');
        const room = new T.RoomEnvironment(), pmrem = new T.PMREMGenerator(renderer), env = pmrem.fromScene(room, 0.06);
        scene.environment = env.texture; room.dispose(); pmrem.dispose();
        scene.add(new T.HemisphereLight('#d5e3ed', '#172431', 0.9));
        const key = new T.DirectionalLight('#f4ecdc', 3.3); key.position.set(4, 7, 6); key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -7; key.shadow.camera.right = key.shadow.camera.top = 7; key.shadow.normalBias = 0.025; scene.add(key);
        const fill = new T.DirectionalLight('#88bed6', 1.3); fill.position.set(-4, 2, -3); scene.add(fill);
        const root = CinematicModels.create(T, { ...spec, model: spec.kind, color: '#879ca9', accent: '#58bac1' }); scene.add(root);
        const camera = new T.PerspectiveCamera(37, 1280 / 900, 0.01, 200);
        camera.position.fromArray(spec.view).normalize().multiplyScalar(7.5); camera.lookAt(0, 0, 0);
        function frame(bounds) {
          const center = new T.Vector3().fromArray(bounds.min).add(new T.Vector3().fromArray(bounds.max)).multiplyScalar(0.5);
          const direction = new T.Vector3().fromArray(spec.view).normalize();
          camera.position.copy(center).add(direction); camera.lookAt(center); camera.updateMatrixWorld();
          const right = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
          const tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
          let distance = 0;
          const corners = [];
          for (let i = 0; i < 8; i++) {
            const corner = new T.Vector3(...[0, 1, 2].map(axis => i & (1 << axis) ? bounds.max[axis] : bounds.min[axis]));
            corners.push(corner); const local = corner.clone().sub(center), depth = local.dot(direction);
            distance = Math.max(distance, depth + Math.abs(local.dot(right)) / (tangent * camera.aspect * 0.86), depth + Math.abs(local.dot(up)) / (tangent * 0.86));
          }
          camera.position.copy(center).addScaledVector(direction, distance); camera.updateMatrixWorld();
          if (corners.some(corner => { corner.project(camera); return Math.abs(corner.x) > 0.861 || Math.abs(corner.y) > 0.861; })) throw new Error('Inspection frame clips declared geometry bounds');
        }
        frame(root.userData.bounds);
        const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({ color: '#172630', roughness: 0.93, metalness: 0.03 }));
        floor.rotation.x = -Math.PI / 2; floor.position.y = root.userData.floor - 0.012; floor.receiveShadow = true;
        if (spec.kind !== 'planet') scene.add(floor);
        const portMarkers = new T.Group(); scene.add(portMarkers); portMarkers.visible = false;
        const material = new T.MeshBasicMaterial({ color: '#f2bc67', depthTest: false });
        for (const [id, port] of Object.entries(root.userData.ports)) {
          if (port.dynamic) continue;
          const marker = new T.Mesh(new T.SphereGeometry(0.035, 12, 8), material); marker.position.fromArray(port.position); marker.name = id; portMarkers.add(marker);
          const arrow = new T.ArrowHelper(new T.Vector3().fromArray(port.normal), new T.Vector3().fromArray(port.position), 0.4, '#f2bc67', 0.1, 0.06); portMarkers.add(arrow);
        }
        document.querySelector('header').textContent = spec.kind.toUpperCase();
        const note = document.createElement('small'); note.textContent = 'Asset geometry inspection · measured normalized root · detail 3'; document.querySelector('header').append(note);
        document.getElementById('state').textContent = 'Assembled · physical structure / explicit teaching abstraction';
        root.userData.update(0, 0); renderer.render(scene, camera);
        window.assetTest = { root, renderer, scene, camera, env, portMarkers, frame, render() { renderer.render(scene, camera); } };
        return { kind: spec.kind, params: spec.params, metadata: CinematicModels.catalog(T, spec.kind, spec.params), gpu: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }, ports: root.userData.ports };
      }, spec);
      await page.locator('canvas').screenshot({ path: path.join(output, `${spec.kind}-assembled.png`) });
      if (spec.kind !== 'planet') {
        await page.evaluate(() => { assetTest.portMarkers.visible = true; assetTest.render(); });
        await page.locator('canvas').screenshot({ path: path.join(output, `${spec.kind}-ports.png`) });
        await page.evaluate(() => {
          const { root } = assetTest; assetTest.portMarkers.visible = false;
          root.userData.update(7.25, 1);
          assetTest.frame(root.userData.expandedBounds);
          document.getElementById('state').textContent = root.userData.supportsExplode ? 'Explode = 1 · fixed service ports / movable assembly parts' : 'Fixed support asset · no internal explode action advertised'; assetTest.render();
        });
        await page.locator('canvas').screenshot({ path: path.join(output, `${spec.kind}-expanded.png`) });
      }
      const probe = await page.evaluate(() => {
        const { root, renderer } = assetTest;
        root.userData.update(0, 0); assetTest.render();
        const canvas = renderer.domElement, gl = renderer.getContext();
        const pixels = new Uint8Array(1280 * 900 * 4); gl.readPixels(0, 0, 1280, 900, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let lit = 0;
        for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 90) lit++;
        return { litPixels: lit, canvas: [canvas.width, canvas.height], webgl2: renderer.capabilities.isWebGL2, fixedPorts: Object.values(root.userData.ports).filter(port => !port.dynamic).length };
      });
      assert.ok(probe.litPixels > 10000, `${spec.kind} should render visibly`);
      assert.equal(initial.metadata.kind, spec.kind);
      report.assets.push({ ...initial, ...probe });
      console.log(JSON.stringify({ kind: spec.kind, ...probe, cost: initial.metadata.cost }));
      await page.evaluate(() => { assetTest.root.userData.dispose(); assetTest.env.dispose(); assetTest.renderer.dispose(); });
      await page.close();
    }
    assert.deepEqual(report.requests, []); assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
