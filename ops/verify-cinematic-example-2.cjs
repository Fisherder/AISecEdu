const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium, request } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const base = 'http://10.92.35.7:8080';
const args = process.argv.slice(2);
const attemptArgs = args.filter(value => value.startsWith('--attempt='));
assert.ok(attemptArgs.length <= 1 && args.every(value => value === '--status' || /^--attempt=[1-5]$/.test(value)), 'Usage: node ops/verify-cinematic-example-2.cjs [--attempt=1..5] [--status]');
const attemptNumber = attemptArgs.length ? Number(attemptArgs[0].split('=')[1]) : 1;
const repoDir = path.resolve(__dirname, '..');
const rootDir = path.join(repoDir, 'cache/cinematic-controls/generated/example-2');
const dir = attemptNumber === 1 ? rootDir : path.join(rootDir, 'attempt-' + attemptNumber);
const storageState = path.join(repoDir, 'cache/acceptance/browser-state.json');
const generationPath = path.join(dir, 'generation.json');
const generationSource = fs.readFileSync(generationPath, 'utf8');
const generation = JSON.parse(generationSource);
if (generation.attemptNumber !== undefined) assert.equal(generation.attemptNumber, attemptNumber, 'Generation record does not match the requested attempt');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const observationRoot = path.join(dir, 'observation');
fs.mkdirSync(observationRoot, { recursive: true });
const observationDir = fs.mkdtempSync(path.join(observationRoot, 'run-'));
const provenance = { attemptNumber, generationPath, generationSha256: hash(generationSource), observationDir };
const save = (name, value) => fs.writeFileSync(path.join(observationDir, name), JSON.stringify(value, null, 2), { flag: 'wx' });
save('observation.json', { at: new Date().toISOString(), ...provenance, mode: args.includes('--status') ? 'status' : 'browser', threadId: generation.threadId, artifactId: generation.artifactId });
console.log('OBSERVATION', observationDir);
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

async function read(client, route) {
  const response = await client.get(base + '/pwncollege_api/v1' + route, { timeout: 20000, maxRetries: 3 });
  assert.equal(response.status(), 200, route);
  return (await response.json()).data;
}

async function status(client) {
  const result = { at: new Date().toISOString(), ...provenance, threadId: generation.threadId, artifactId: generation.artifactId, jobs: [] };
  for (const id of generation.jobs) {
    const job = (await read(client, '/teaching/jobs/' + id)).job;
    result.jobs.push({ id, kind: job.kind, status: job.status, stage: job.stage, progress: job.progress, error: job.error, lastError: job.lastError, failureMessage: job.failureMessage, modelRoute: job.modelRoute, result: job.result, created: job.created, updated: job.updated, model: job.model, modelId: job.modelId, provider: job.provider, availableFields: Object.keys(job) });
  }
  if (generation.artifactId) {
    const artifact = (await read(client, '/teaching/artifacts/' + generation.artifactId)).artifact;
    result.artifact = { id: artifact.id, status: artifact.status, revision: artifact.currentRevision, title: artifact.title };
    if (artifact.status === 'FAILED') save('artifact-failed.json', artifact);
  }
  save('status.json', result);
  console.log(JSON.stringify(result));
  return result;
}

(async () => {
  if (process.argv.includes('--status')) {
    const client = await request.newContext({ storageState });
    try { await status(client); } finally { await client.dispose(); }
    return;
  }
  assert.ok(generation.passed && generation.artifactId, 'Wait for the existing generation to finish; do not create another project');
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ storageState, viewport: { width: 1680, height: 1050 } });
  const page = await context.newPage();
  const report = { at: new Date().toISOString(), ...provenance, artifactId: generation.artifactId, threadId: generation.threadId, url: base + '/teacher/artifacts/' + generation.artifactId, browser: 'Chrome headless, actual production page', errors: [], checks: [], issues: [], screenshots: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  try {
    await status(context.request);
    const artifact = (await read(context.request, '/teaching/artifacts/' + generation.artifactId)).artifact;
    save('artifact-verified.json', artifact);
    const content = artifact.revision.content.lesson.artifacts[0].content;
    assert.equal(content.renderingMode, 'cinematic-v1');
    const scene = content.cinematicScene;
    report.title = artifact.title; report.revision = artifact.currentRevision;
    report.sceneHash = hash(JSON.stringify(scene));
    report.summary = { nodes: scene.nodes, connections: scene.connections, assembly: scene.assembly, tracks: scene.tracks, shots: scene.shots, chapters: scene.chapters, objectives: scene.objectives };
    await page.goto(report.url, { waitUntil: 'domcontentloaded' });
    await page.locator('#teaching-artifact[data-preview-state="ready"]').waitFor({ timeout: 90000 });
    let frame, host;
    for (let attempt = 0; attempt < 40; attempt++) {
      for (const candidate of page.frames()) {
        if (await candidate.locator('[data-aisecedu-cinematic-preview="v1"]').count()) host = candidate;
        if (await candidate.locator('#cinema[data-cinematic="v1"]').count()) frame = candidate;
      }
      if (frame && host) break;
      await page.waitForTimeout(500);
    }
    assert.ok(frame && host, 'Production iframe missing');
    await frame.waitForFunction(() => globalThis.__cinematic);
    const state = () => frame.evaluate(() => globalThis.__cinematic.getState());
    report.initialState = await state();
    assert.equal(report.initialState.renderer, 'webgl', 'Production player did not use WebGL');
    report.renderedSceneHash = await frame.evaluate(() => JSON.stringify(globalThis.__cinematic.scene)).then(hash);
    if (report.sceneHash !== report.renderedSceneHash) report.issues.push('SceneIR differs between the artifact and the running player; compare canonicalization');
    const screenshot = async (name, time) => {
      if (typeof time === 'number') await frame.evaluate(value => globalThis.__cinematic.seek(value), time);
      await page.waitForTimeout(120);
      const diagnostics = await frame.evaluate(() => globalThis.__cinematic.getFrameDiagnostics());
      const entry = { name, state: await state(), diagnostics, caption: await frame.locator('#chapter-caption').count() ? await frame.locator('#chapter-caption').innerText() : null };
      const buffer = await page.screenshot({ path: path.join(observationDir, name + '.png'), timeout: 20000 });
      entry.sha256 = hash(buffer); report.screenshots.push(entry);
      if (diagnostics.nodes.some(node => node.framed && !node.inside)) report.issues.push(name + ': framed subject outside viewport');
      if (diagnostics.labelOverlaps.length) report.issues.push(name + ': overlapping visible labels');
      console.log('CAPTURED', name, entry.state.time);
    };
    await screenshot('production-normal', 0);
    await host.getByRole('button', { name: '沉浸演示', exact: true }).click();
    for (const [index, shot] of scene.shots.entries()) await screenshot('shot-' + index, shot.at);
    for (const [index, chapter] of scene.chapters.entries()) {
      const end = scene.chapters[index + 1]?.at ?? scene.duration;
      await screenshot('chapter-' + index, chapter.at + Math.max(0, end - chapter.at) * 0.55);
    }
    await screenshot('story-end', scene.duration);
    await frame.locator('#animation-reset').click();
    await frame.locator('#animation-play').click(); await page.waitForTimeout(1100);
    await frame.locator('#animation-pause').click(); const paused = await state();
    await page.waitForTimeout(350); const still = await state();
    if (!(paused.time > 0 && paused.time === still.time && paused.frames === still.frames)) report.issues.push('Play/pause does not freeze time and renders');
    else report.checks.push('Playback advances; pause freezes time and render count');
    await frame.locator('#animation-step').click();
    if ((await state()).time <= paused.time) report.issues.push('Step does not advance');
    await frame.locator('#animation-reset').click();
    await frame.locator('#explode-mode').click();
    await screenshot('manual-explode');
    await frame.locator('#animation-reset').click();
    const before = await state();
    const box = await frame.locator('#cinematic-canvas').boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.5 + 75, box.y + box.height * 0.6 + 25, { steps: 8 }); await page.mouse.up();
    const dragged = await state();
    if (!dragged.explore || dragged.yaw === before.yaw) report.issues.push('Direct canvas drag does not enter orbit and change yaw');
    else report.checks.push('Direct canvas drag enters orbit without a separate mode toggle');
    await page.mouse.wheel(0, -180); await page.waitForTimeout(200);
    const zoomed = await state();
    if (zoomed.zoom === dragged.zoom) report.issues.push('Wheel does not zoom');
    await screenshot('interaction-orbit-zoom');
    report.interaction = { before, dragged, zoomed };
    await frame.locator('#animation-reset').click();
    report.qualities = [];
    for (const quality of ['low', 'high', 'auto']) {
      await frame.locator('#quality').selectOption(quality);
      report.qualities.push(await state());
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await screenshot('portrait-overview', 0);
    await screenshot('portrait-logical', scene.chapters.at(-2)?.at ?? scene.duration * 0.7);
    report.checks.push('All shot positions and interior chapter states captured from the production iframe');
    report.checks.push('No SceneIR edits, regeneration, version rollback or deployment');
    report.automationCompleted = true;
    report.visualReview = 'Pending human/model inspection of saved screenshot images; structural checks are not visual acceptance';
    console.log(JSON.stringify({ artifactId: report.artifactId, revision: report.revision, captures: report.screenshots.length, errors: report.errors, issues: report.issues }));
  } catch (error) {
    report.failure = error.message;
    await page.screenshot({ path: path.join(observationDir, 'verification-failure.png'), timeout: 20000 }).catch(() => {});
    throw error;
  } finally {
    save('browser-verification.json', report);
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
