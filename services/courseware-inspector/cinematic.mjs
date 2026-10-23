import { inspectCinematicDomainDecisions, CinematicDomainProofError } from './domain-decisions.mjs';
import { createHash } from 'node:crypto';
import { inspectionContextLifecycle } from './inspection-context.mjs';

// Complex software-WebGL scenes can need several minutes for every keyframe,
// viewport and interaction. FIFO admission has a separate budget at the server.
// No frame, pixel, framing, or interaction checks are skipped.
export const CINEMATIC_INSPECTION_TIMEOUT_MS = 420000;

export async function captureCinematicPreview(page, preview, canvas) {
  const bounds = await preview.boundingBox();
  const region = cinematicCanvasRegion(bounds, await canvas.boundingBox());
  const viewport = page.viewportSize();
  if (!viewport || bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > viewport.width + 1 || bounds.y + bounds.height > viewport.height + 1)
    throw Error('Cinematic preview is outside the actual screenshot viewport');
  // Capture real compositor pixels without locator auto-scroll/stability waits
  // competing with a continuously drawing software GPU.
  const png = await page.screenshot({clip:bounds, timeout:30000});
  const after = await preview.boundingBox();
  if (!after || ['x','y','width','height'].some(key => Math.abs(after[key]-bounds[key]) > .5))
    throw Error('Cinematic layout moved during capture; frame evidence must be recaptured');
  return {png, region};
}

export function cinematicRenderSamples(scene) {
  const times = [...new Set([0, scene.duration, ...scene.shots.map(shot => shot.at),
    ...scene.chapters.flatMap((chapter, index) => [chapter.at, (chapter.at + (scene.chapters[index + 1]?.at ?? scene.duration)) / 2])])].sort((a, b) => a - b);
  return [...times.map(at => ({ at, width: 1440 })), ...[0, scene.duration / 2, scene.duration].map(at => ({ at, width: 1024 }))];
}

export async function clickCinematicControl(frame, action) {
  const modern = await frame.locator('#animation-toggle').count();
  if (!modern) { await frame.locator('#animation-' + action).click(); return; }
  if (action === 'reset' || action === 'step') {
    if (await frame.locator('#player-settings').isHidden()) await frame.locator('#player-settings-toggle').click();
    await frame.locator('#animation-' + action).click();
    await frame.locator('#player-settings-toggle').click();
    return;
  }
  const playing = await frame.evaluate(() => globalThis.__cinematic.getState().playing);
  if ((action === 'play' && !playing) || (action === 'pause' && playing)) await frame.locator('#animation-toggle').click();
}

export function cinematicCanvasRegion(preview, canvas) {
  if (![preview, canvas].every(box => box && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key])) && box.width > 0 && box.height > 0))
    throw Error('Missing rendered preview or canvas bounds');
  const region = { x: (canvas.x - preview.x) / preview.width, y: (canvas.y - preview.y) / preview.height,
    width: canvas.width / preview.width, height: canvas.height / preview.height };
  if (region.x < -1e-6 || region.y < -1e-6 || region.x + region.width > 1 + 1e-6 || region.y + region.height > 1 + 1e-6)
    throw Error('Rendered canvas is outside the captured preview');
  return region;
}

function verifiedFrameRegion(d) {
  const region = d.frame?.region, proof = d.frameRegion, ids = d.frame?.nodes;
  const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (!region || !vector(region.center) || !vector(region.size) ||
    region.size.some((size, axis) => size < .1 || size > 1 || Math.abs(region.center[axis]) + size / 2 > .5 + 1e-8)) return false;
  if (!proof?.available || proof.method !== 'world-region-projection-v1' || d.explore ||
    !Array.isArray(ids) || !ids.length || JSON.stringify(proof.nodes) !== JSON.stringify(ids) ||
    !vector(proof.region?.center) || !vector(proof.region?.size) ||
    ['center', 'size'].some(key => proof.region[key].some((value, axis) => value !== region[key][axis]))) return false;
  const subjects = ids.map(id => d.nodes.find(node => node.id === id));
  if (subjects.some(node => !vector(node?.bounds?.min) || !vector(node?.bounds?.max) ||
    node.bounds.min.some((value, axis) => value > node.bounds.max[axis]))) return false;
  if (!vector(proof.bounds?.min) || !vector(proof.bounds?.max)) return false;
  for (let axis = 0; axis < 3; axis++) {
    const low = Math.min(...subjects.map(node => node.bounds.min[axis])), high = Math.max(...subjects.map(node => node.bounds.max[axis]));
    for (const [edge, sign] of [['min', -1], ['max', 1]]) {
      const expected = (low + high) / 2 + (high - low) * (region.center[axis] + sign * region.size[axis] / 2);
      if (Math.abs(proof.bounds[edge][axis] - expected) > 1e-6 * (1 + Math.abs(expected))) return false;
    }
  }
  return Array.isArray(proof.projectedCorners) && proof.projectedCorners.length === 8 &&
    proof.projectedCorners.every(point => vector(point) && point.every(value => Math.abs(value) <= 1.001));
}

export function cinematicFrameIssues(frame) {
  const issues = [], { diagnostics: d, pixels, at } = frame;
  const add = (code, message, nodes = []) => issues.push({ code, message, nodes, at });
  if (!d?.available) { add('webgl-unavailable', '真实WebGL场景未初始化，二维兼容画面不能通过三维验收'); return issues; }
  const framed = (d.frame?.nodes || []).map(id => d.nodes.find(node => node.id === id)).filter(Boolean);
  if (d.frame && !framed.length) add('empty-frame', '当前镜头没有可见的取景主体，请修复节点显隐与frame.nodes', d.frame.nodes);
  const regionVerified = d.frame?.region && verifiedFrameRegion(d);
  if (d.frame?.region && !regionVerified) add('detail-region-unverified', '局部取景缺少匹配当前模型边界的实际投影证据，或局部范围本身越界；请修复特写取景', d.frame.nodes);
  const clipped = framed.filter(node => !node.inside && !regionVerified);
  if (clipped.length) add('clipped-subject', '实际渲染中的取景主体越界，请修复镜头和取景范围，保留教学对象', clipped.map(node => node.id));
  if (framed.length && Math.max(...framed.map(node => node.coverage)) < 0.008)
    add('tiny-subject', '当前镜头主体在实际画面中过小；缩小取景范围或分镜观察关键部位，不删除要求', framed.map(node => node.id));
  if (d.labelOverlaps?.length) add('label-overlap', '实际标签相互覆盖，请修复构图或标签布局，保留对象说明', [...new Set(d.labelOverlaps.flat())]);
  if (pixels.brightFraction < 0.001 || pixels.colorBuckets < 6) add('nearly-blank', '实际画布接近空白或看不到明暗细节，请检查主体显隐、材质和灯光');
  return issues;
}

export async function inspectCinematic(browser, { data, renderOrigin, serviceToken, screenshot, signal = undefined }) {
  signal?.throwIfAborted();
  const origin = new URL(renderOrigin), prefix = origin.pathname.replace(/\/$/, '');
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const issues = [], frames = [], hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const lifecycle = inspectionContextLifecycle(context, {signal, timeoutMs: CINEMATIC_INSPECTION_TIMEOUT_MS});
  try {
    lifecycle.throwIfStopped();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin.origin || !(url.pathname === prefix + '/internal/cinematic-render' || url.pathname.startsWith(prefix + '/_next/') || url.pathname.startsWith(prefix + '/vendor/'))) return route.abort();
      return route.continue({ headers: { ...route.request().headers(), 'X-AISecEdu-Service-Token': serviceToken } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => issues.push({ code: 'runtime', message: error.message.slice(0, 1200), nodes: [] }));
    const response = await page.goto(renderOrigin.replace(/\/$/, '') + '/internal/cinematic-render', { waitUntil: 'domcontentloaded', timeout: 25000 });
    if (!response?.ok()) throw Error('Cinematic rendering surface HTTP ' + response?.status());
    await page.waitForFunction(() => typeof window.renderCinematic === 'function');
    await page.evaluate(scene => window.renderCinematic(scene), data);
    await page.locator('[data-aisecedu-cinematic-preview] iframe').waitFor();
    const frame = await page.locator('[data-aisecedu-cinematic-preview] iframe').elementHandle().then(handle => handle.contentFrame());
    await frame.waitForFunction(() => !!globalThis.__cinematic);
    if (await frame.evaluate(() => globalThis.__cinematic.getState().renderer) !== 'webgl') throw Error('Real WebGL unavailable in inspector');
    const settle = () => frame.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    if(data.lab)await frame.locator('#cinema-mode-process').click();
    let previousWidth = 1440;
    for (const sample of cinematicRenderSamples(data)) {
      if (sample.width !== previousWidth) { await page.setViewportSize({ width: sample.width, height: 960 }); previousWidth = sample.width; }
      await frame.evaluate(at => globalThis.__cinematic.seek(at), sample.at); await settle();
      const diagnostics = await frame.evaluate(() => globalThis.__cinematic.getFrameDiagnostics());
      const preview = page.locator('[data-aisecedu-cinematic-preview]');
      const {png, region} = await captureCinematicPreview(page, preview, frame.locator('#cinematic-canvas'));
      // Capture once, then derive the exact canvas evidence from that same real screenshot.
      // A second compositor capture was dominating the software-GPU inspection budget.
      const captured = await page.evaluate(async ({ encoded, region }) => {
        const image = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: 'image/png' }));
        const cropped = document.createElement('canvas');
        cropped.width = Math.max(1, Math.round(image.width * region.width));
        cropped.height = Math.max(1, Math.round(image.height * region.height));
        cropped.getContext('2d').drawImage(image, image.width * region.x, image.height * region.y, image.width * region.width, image.height * region.height, 0, 0, cropped.width, cropped.height);
        image.close();
        const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 100;
        const context = canvas.getContext('2d'); context.drawImage(cropped, 0, 0, 160, 100);
        const rgba = context.getImageData(0, 0, 160, 100).data, colors = new Set(); let bright = 0;
        for (let i = 0; i < rgba.length; i += 4) { if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) > 60) bright++; colors.add([rgba[i], rgba[i + 1], rgba[i + 2]].map(v => Math.floor(v / 24)).join(',')); }
        return { pixels: { brightFraction: bright / 16000, colorBuckets: colors.size }, canvasPng: cropped.toDataURL('image/png').split(',')[1] };
      }, { encoded: png.toString('base64'), region });
      const item = { ...sample, screenshotSha256: hash(png), canvasSha256: hash(Buffer.from(captured.canvasPng, 'base64')), diagnostics, pixels: captured.pixels };
      issues.push(...cinematicFrameIssues(item)); frames.push(item);
      if (screenshot) await screenshot(frames.length - 1, png);
    }
    await clickCinematicControl(frame, 'reset');
    await clickCinematicControl(frame, 'play');
    const canvas = frame.locator('#cinematic-canvas');
    await canvas.scrollIntoViewIfNeeded(); const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .45); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .6, box.y + box.height * .4, { steps: 4 }); await page.mouse.up();
    await settle(); const before = await frame.evaluate(() => globalThis.__cinematic.getState());
    await frame.waitForFunction(time => globalThis.__cinematic.getState().time > time + .2, before.time);
    const after = await frame.evaluate(() => globalThis.__cinematic.getState());
    await page.mouse.wheel(0, -180); await settle(); const zoomed = await frame.evaluate(() => globalThis.__cinematic.getState());
    await clickCinematicControl(frame, 'pause'); const paused = await frame.evaluate(() => globalThis.__cinematic.getState());
    await settle(); const frozen = await frame.evaluate(() => globalThis.__cinematic.getState());
    await clickCinematicControl(frame, 'reset'); const reset = await frame.evaluate(() => globalThis.__cinematic.getState());
    const controls = { playingWhileExploring: before.playing && after.playing && after.explore, cameraHeld: JSON.stringify(before.camera) === JSON.stringify(after.camera),
      zoomWorked: zoomed.zoom < after.zoom && zoomed.playing, paused: !paused.playing && paused.time === frozen.time,
      reset: !reset.playing && !reset.explore && reset.time === 0 && reset.zoom === 1, elapsed: after.time - before.time };
    if (Object.entries(controls).some(([key, value]) => key !== 'elapsed' && value !== true) || controls.elapsed <= 0)
      issues.push({ code: 'playback-interaction', message: '播放、自由拖拽、缩放、暂停或重置的实际浏览器行为未通过', nodes: [] });
    let domainDecisions=[], domainProofPassed=true;
    try {domainDecisions=await inspectCinematicDomainDecisions(frame,data,settle);}
    catch(error) {
      if(!(error instanceof CinematicDomainProofError))throw error;
      domainProofPassed=false;domainDecisions=error.evidence;issues.push(error.issue);
    }
    if(data.lab)controls.domainDecisions=domainProofPassed&&domainDecisions.length===data.lab.model.scene.decisions.length;
    lifecycle.throwIfStopped();
    return { issues: issues.slice(0, 160), evidence: { mode: 'headless-chromium-webgl-dom-and-pixels', sourceSha256: hash(JSON.stringify(data)),
      inspectedAt: new Date().toISOString(), visualAestheticReview: 'not-scored-by-model', frames, controls,...(data.lab?{domainDecisions}:{}) } };
  } catch (error) { lifecycle.throwIfStopped(); throw error; }
  finally { await lifecycle.dispose(); }
}
