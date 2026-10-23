const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const project = path.resolve(__dirname, '..');
const evidenceRoot = path.join(project, 'cache/cinematic-controls/generated/example-1');
const args = process.argv.slice(2);
assert.ok(args.every(value => value === '--paths' || value === '--v6-observation' || value.startsWith('--attempt=')), 'Unknown observation argument');
const attemptArgs = args.filter(value => value.startsWith('--attempt='));
assert.ok(attemptArgs.length <= 1, 'Specify --attempt only once');
assert.ok(!attemptArgs.length || /^--attempt=[1-5]$/.test(attemptArgs[0]), '--attempt must be an integer from 1 to 5');
assert.ok(!attemptArgs.length || !args.includes('--v6-observation'), '--attempt and --v6-observation cannot be combined');
const attemptNumber = attemptArgs.length ? Number(attemptArgs[0].slice('--attempt='.length)) : 1;
const sourceDir = attemptNumber === 1 ? evidenceRoot : path.join(evidenceRoot, 'attempt-' + attemptNumber);
const generationPath = path.join(sourceDir, 'generation.json');
const outputRoot = args.includes('--v6-observation') ? path.join(evidenceRoot, 'v6-observation/page-observation') : path.join(sourceDir, 'verification');
const paths = { attemptNumber, sourceDir, generationPath, artifactPath: path.join(sourceDir, 'artifact.json'), optionsPath: path.join(sourceDir, 'options-observed.json'), outputRoot, outputPolicy: 'new run-* directory per invocation; never overwrite prior evidence' };
if (args.includes('--paths')) {
  console.log(JSON.stringify(paths, null, 2));
  process.exit(0);
}
const base = 'http://10.92.35.7:8080';
const generation = JSON.parse(fs.readFileSync(generationPath, 'utf8'));
assert.equal(generation.index, 1);
if (attemptNumber > 1) assert.equal(generation.attemptNumber, attemptNumber, 'Saved generation attempt does not match --attempt');
assert.ok(generation.threadId && generation.artifactId, 'This attempt has no artifact yet; observation must not fall back to another attempt or submit a request');
fs.mkdirSync(outputRoot, { recursive: true });
const output = fs.mkdtempSync(path.join(outputRoot, 'run-'));
const { chromium } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const save = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2));
const report = { observedAt: new Date().toISOString(), attemptNumber, generationPath, outputDirectory: output, threadId: generation.threadId, artifactId: generation.artifactId, jobs: [], screenshots: [], errors: [], generationPassed: false, webglVerification: 'NOT_RUN' };
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

function inspectAssetImplementation() {
  const source = 'services/agent-runtime/lib/cinematic/models.js';
  const models = fs.readFileSync(path.join(project, source), 'utf8');
  const sandbox = vm.createContext({ console, TextEncoder, TextDecoder });
  vm.runInContext(fs.readFileSync(path.join(project, 'services/agent-runtime/public/vendor/cinematic-three-r150.min.js'), 'utf8'), sandbox);
  vm.runInContext(models, sandbox);
  const T = sandbox.THREE, library = sandbox.CinematicModels;
  const record = { source, sha256: crypto.createHash('sha256').update(models).digest('hex'), evidenceType: 'local asset geometry execution; not a generated production artifact or GPU render', cases: [] };
  for (const spec of [
    { model: 'valve', params: {} },
    ...[0, 0.5, 1].map(opening => ({ model: 'valve', params: { actuator: 'manual', opening } })),
    { model: 'pipe-assembly', params: { layout: 'straight' } },
    { model: 'pipe-assembly', params: { layout: 'elbow' } },
  ]) {
    const root = library.create(T, spec);
    const snapshot = () => {
      root.updateMatrixWorld(true);
      const groups = [];
      root.traverse(object => { if (object.isGroup && object.name) groups.push({ name: object.name, position: object.position.toArray(), rotation: object.rotation.toArray().slice(0, 3), matrixWorld: object.matrixWorld.toArray() }); });
      return JSON.parse(JSON.stringify({ groups, ports: root.userData.ports }));
    };
    root.userData.update(0, 0);
    const initial = snapshot();
    root.userData.update(11, 0);
    const later = snapshot();
    root.userData.update(0, 0.5);
    const half = snapshot();
    root.userData.update(0, 1);
    const exploded = snapshot();
    root.userData.update(0, 0);
    const restored = snapshot();
    const moved = exploded.groups.filter((group, index) => JSON.stringify(group.position) !== JSON.stringify(initial.groups[index].position)).map(group => group.name);
    record.cases.push({ spec, effectiveParams: root.userData.params, stats: root.userData.stats, supportsExplode: root.userData.supportsExplode, initial, later, half, exploded, restored, movedLocalGroups: moved, timeAloneChangesGeometry: JSON.stringify(initial) !== JSON.stringify(later), resetExact: JSON.stringify(initial) === JSON.stringify(restored) });
    root.userData.dispose();
  }
  save('asset-capability-probe.json', record);
  return record.cases.map(item => ({ spec: item.spec, effectiveParams: item.effectiveParams, movedLocalGroups: item.movedLocalGroups, timeAloneChangesGeometry: item.timeAloneChangesGeometry, resetExact: item.resetExact }));
}

async function inspectProductionScene(page, artifact) {
  const result = { checks: [], shots: [], chapters: [], screenshots: [], visualReview: 'PENDING_HUMAN_IMAGE_INSPECTION', controls: {} };
  report.productionScene = result;
  const check = (name, passed, details) => result.checks.push({ name, passed: Boolean(passed), details });
  let frame, host;
  for (let index = 0; index < 80; index++) {
    for (const candidate of page.frames()) {
      if (await candidate.locator('[data-aisecedu-cinematic-preview="v1"]').count()) host = candidate;
      if (await candidate.locator('#cinema[data-cinematic="v1"]').count()) frame = candidate;
    }
    if (frame && host) break;
    await page.waitForTimeout(500);
  }
  assert.ok(frame && host, 'No real production cinematic iframe');
  await frame.waitForFunction(() => Boolean(globalThis.__cinematic), null, { timeout: 30000 });
  const read = () => frame.evaluate(() => globalThis.__cinematic.getState());
  const diagnose = () => frame.evaluate(() => globalThis.__cinematic.getFrameDiagnostics());
  assert.equal((await read()).renderer, 'webgl', 'A fallback page is not a 3D visual verification');
  result.runtime = await frame.locator('#cinema').getAttribute('data-cinematic-runtime');
  const scene = await frame.evaluate(() => globalThis.__cinematic.scene);
  save('scene-runtime.json', scene);
  save('artifact.json', artifact);
  result.scene = { title: scene.title, duration: scene.duration, models: scene.nodes.filter(node => node.kind === 'model'), assembly: scene.assembly, connections: scene.connections, tracks: scene.tracks };
  result.controlInventory = await frame.locator('button, select, input').evaluateAll(elements => elements.map(element => ({ id: element.id, text: element.textContent, label: element.getAttribute('aria-label'), type: element.type })));
  const immersion = host.getByRole('button', { name: '沉浸演示', exact: true });
  if (await immersion.isVisible()) await immersion.click();
  await page.waitForTimeout(250);
  const seek = async time => { await frame.evaluate(value => globalThis.__cinematic.seek(value), time); await page.waitForTimeout(100); };
  const capture = async name => {
    const filename = name + '.png';
    const png = await page.screenshot({ path: path.join(output, filename), timeout: 20000 });
    result.screenshots.push(filename);
    return { screenshot: filename, sha256: crypto.createHash('sha256').update(png).digest('hex'), state: await read(), diagnostics: await diagnose(), caption: await frame.locator('#chapter-caption').innerText() };
  };
  for (const [index, shot] of scene.shots.entries()) {
    await seek(shot.at);
    result.shots.push({ index, declared: shot, ...await capture('shot-' + String(index + 1).padStart(2, '0')) });
  }
  for (const [index, chapter] of scene.chapters.entries()) {
    const end = scene.chapters[index + 1]?.at ?? scene.duration;
    const at = chapter.at + (end - chapter.at) * 0.45;
    await seek(at);
    result.chapters.push({ index, declared: chapter, ...await capture('chapter-' + String(index + 1).padStart(2, '0')) });
  }
  const framed = [...result.shots, ...result.chapters].flatMap(item => item.diagnostics.nodes.filter(node => node.framed).map(node => ({ time: item.state.time, ...node })));
  check('framed geometry stays inside viewport', framed.length > 0 && framed.every(node => node.inside), framed.filter(node => !node.inside));
  await frame.locator('#animation-reset').click();
  await page.waitForTimeout(100);
  const before = await read();
  const box = await frame.locator('#cinematic-canvas').boundingBox();
  assert.ok(box && box.width > 50 && box.height > 50);
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 110, box.y + box.height * 0.5 + 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const dragged = await read();
  result.controls.drag = { before, after: dragged, ...await capture('controls-drag') };
  check('direct drag moves actual camera and pauses', dragged.explore && !dragged.playing && JSON.stringify(dragged.camera) !== JSON.stringify(before.camera), { before: before.camera, after: dragged.camera });
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(200);
  const wheeled = await read();
  const radius = state => Math.hypot(...state.camera.map((value, index) => value - state.cameraTarget[index]));
  result.controls.wheel = { before: dragged, after: wheeled, ...await capture('controls-wheel') };
  check('wheel changes actual camera radius', radius(wheeled) < radius(dragged), { before: radius(dragged), after: radius(wheeled) });
  await frame.locator('#camera-mode').click();
  await page.waitForTimeout(100);
  check('return to director restores its actual camera', !(await read()).explore && JSON.stringify((await read()).camera) === JSON.stringify(before.camera));
  await frame.locator('#animation-reset').click();
  const assembled = await capture('assembled');
  await frame.locator('#explode-mode').click();
  const exploded = await capture('exploded');
  await frame.locator('#explode-mode').click();
  const restored = await capture('restored');
  result.controls.explode = { assembled, exploded, restored };
  check('explode changes rendered model bounds', JSON.stringify(assembled.diagnostics.nodes.map(node => node.bounds)) !== JSON.stringify(exploded.diagnostics.nodes.map(node => node.bounds)));
  check('explode reset restores model bounds', JSON.stringify(assembled.diagnostics.nodes.map(node => node.bounds)) === JSON.stringify(restored.diagnostics.nodes.map(node => node.bounds)));
  result.qualities = [];
  for (const quality of ['low', 'auto', 'high']) {
    await frame.locator('#quality').selectOption(quality);
    await page.waitForTimeout(100);
    const metrics = await frame.evaluate(() => {
      const canvas = document.getElementById('cinematic-canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return { state: __cinematic.getState(), canvas: [canvas.width, canvas.height], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], output: document.getElementById('quality-output').textContent };
    });
    result.qualities.push({ quality, ...metrics, ...await capture('quality-' + quality) });
  }
  check('quality changes actual drawing buffers', new Set(result.qualities.map(item => item.buffer.join('x'))).size === 3, result.qualities.map(item => ({ quality: item.quality, buffer: item.buffer, gpu: item.state.gpu })));
  await frame.locator('#quality').selectOption('auto');
  const deterministicTime = scene.chapters[Math.min(1, scene.chapters.length - 1)].at;
  await seek(deterministicTime);
  const labelsA = await diagnose();
  const pixelsA = await frame.locator('#cinematic-canvas').screenshot({ timeout: 20000 });
  await seek(scene.duration * 0.87);
  await seek(deterministicTime);
  const labelsB = await diagnose();
  const pixelsB = await frame.locator('#cinematic-canvas').screenshot({ timeout: 20000 });
  check('random seek restores geometry and label diagnostics', JSON.stringify(labelsA) === JSON.stringify(labelsB));
  check('random seek restores actual canvas pixels', pixelsA.equals(pixelsB));
  await frame.locator('#animation-reset').click();
  await frame.locator('#animation-play').click();
  const playingStart = { wall: Date.now(), state: await read() };
  await page.waitForTimeout(1100);
  const playingEnd = { wall: Date.now(), state: await read() };
  result.playingFrames = { start: playingStart, end: playingEnd, measuredFPS: (playingEnd.state.frames - playingStart.state.frames) * 1000 / (playingEnd.wall - playingStart.wall) };
  await frame.locator('#animation-pause').click();
  const paused = await read();
  await page.waitForTimeout(350);
  check('paused scene performs zero extra GPU frames', (await read()).frames === paused.frames);
  await page.setViewportSize({ width: 390, height: 900 });
  await seek(0);
  result.portrait = await capture('portrait');
  check('portrait framed geometry remains visible', result.portrait.diagnostics.nodes.filter(node => node.framed).every(node => node.inside));
  result.runtimeChecksPassed = result.checks.every(item => item.passed);
  result.checkCounts = { passed: result.checks.filter(item => item.passed).length, total: result.checks.length };
  save('production-scene-verification.json', result);
  console.log(JSON.stringify({ actualProductionArtifact: artifact.id, checks: result.checkCounts, screenshots: result.screenshots.length, visualReview: result.visualReview, output }));
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ storageState: path.join(project, 'cache/acceptance/browser-state.json'), viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  const read = async route => {
    const response = await context.request.get(base + '/pwncollege_api/v1' + route, { timeout: 20000, maxRetries: 2 });
    assert.equal(response.status(), 200, route);
    return (await response.json()).data;
  };
  try {
    const thread = await read('/teaching/threads/' + generation.threadId);
    save('thread-observed.json', thread);
    const artifactData = await read('/teaching/artifacts/' + generation.artifactId);
    save('artifact-observed.json', artifactData);
    const artifact = artifactData.artifact;
    assert.equal(artifact.lineage?.generationJob?.threadId, generation.threadId);
    const pending = [...generation.jobs];
    const visited = new Set();
    while (pending.length) {
      const id = pending.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const data = await read('/teaching/jobs/' + id);
      save(id + '.json', data);
      const job = data.job;
      assert.equal(job.threadId, generation.threadId);
      report.jobs.push(job);
      if (job.result?.materializationJobId) pending.push(job.result.materializationJobId);
    }
    if (artifact.lineage?.generationJob?.id && !visited.has(artifact.lineage.generationJob.id)) {
      const data = await read('/teaching/jobs/' + artifact.lineage.generationJob.id);
      save(data.job.id + '.json', data);
      report.jobs.push(data.job);
    }
    report.title = artifact.title;
    report.artifactStatus = artifact.status;
    report.currentRevision = artifact.currentRevision;
    report.originalPrompt = generation.prompt;
    report.selectedRewrittenPrompt = generation.selected?.data?.proposal?.arguments?.prompt;
    report.assetImplementation = inspectAssetImplementation();
    await page.goto(base + '/teacher/artifacts/' + artifact.id, { waitUntil: 'domcontentloaded' });
    await page.locator('#teaching-artifact').waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('artifact-meta')?.textContent !== '正在读取内容信息…', null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    report.artifactPage = await page.evaluate(() => ({ url: location.href, previewState: document.getElementById('teaching-artifact')?.dataset.previewState, text: document.body.innerText }));
    await page.screenshot({ path: path.join(output, 'production-artifact-observed.png'), timeout: 20000 });
    report.screenshots.push('production-artifact-observed.png');
    const contents = artifact.revision?.content?.lesson?.artifacts?.map(item => item.content) || [];
    report.contentSummary = contents.map(content => ({ renderingMode: content.renderingMode || null, hasSceneIR: Boolean(content.cinematicScene), hasHTML: Boolean(content.html), keys: Object.keys(content) }));
    report.generationPassed = ['DRAFT', 'READY', 'READY_TO_PUBLISH'].includes(artifact.status) && contents.length === 1 && contents[0].renderingMode === 'cinematic-v1';
    report.webglVerification = report.generationPassed ? 'READY_FOR_SEPARATE_REAL_PAGE_VERIFICATION' : 'NOT_RUN_NO_SUCCESSFUL_CINEMATIC_ARTIFACT';
    if (report.generationPassed) {
      await inspectProductionScene(page, artifact);
      report.webglVerification = 'REAL_UI_CHECKS_RECORDED_VISUAL_REVIEW_REQUIRED';
    }
    await page.goto(base + '/teacher?thread=' + generation.threadId, { waitUntil: 'domcontentloaded' });
    await page.locator('#teacher-agent[data-ready="true"]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    report.threadPage = await page.evaluate(() => ({ url: location.href, text: document.body.innerText }));
    const failures = page.locator('[data-run-retry]:visible');
    if (await failures.count()) await failures.last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'production-thread-observed.png'), timeout: 20000 });
    report.screenshots.push('production-thread-observed.png');
    report.observationComplete = true;
  } catch (error) {
    report.observerFailure = String(error.stack || error);
    process.exitCode = 1;
  } finally {
    report.completedAt = new Date().toISOString();
    save('observation-report.json', report);
    await browser.close();
  }
  console.log(JSON.stringify({ observationComplete: report.observationComplete, artifactStatus: report.artifactStatus, generationPassed: report.generationPassed, webglVerification: report.webglVerification, jobs: report.jobs.map(job => ({ id: job.id, kind: job.kind, status: job.status, attemptCount: job.attemptCount, modelRoute: job.modelRoute })), observerFailure: report.observerFailure, report: path.join(output, 'observation-report.json') }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
