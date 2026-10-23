import { createHash } from 'node:crypto';
import { inspectionContextLifecycle } from './inspection-context.mjs';

export async function inspectCourseware(browser, { data, renderOrigin, serviceToken, screenshot, signal = undefined }) {
  signal?.throwIfAborted();
  const origin = new URL(renderOrigin);
  const context = await browser.newContext({ viewport: { width: 1000, height: 563 }, deviceScaleFactor: 1,
    reducedMotion: 'reduce', serviceWorkers: 'block' });
  const issues = [];
  const frames = [];
  const lifecycle = inspectionContextLifecycle(context, {signal});
  try {
    lifecycle.throwIfStopped();
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const prefix = origin.pathname.replace(/\/$/, '');
      const permitted = url.origin === origin.origin && (url.pathname === prefix + '/internal/courseware-render' || url.pathname.startsWith(prefix + '/_next/') || url.pathname.startsWith(prefix + '/vendor/'));
      if (!permitted) return route.abort();
      return route.continue({ headers: { ...route.request().headers(), 'X-AISecEdu-Service-Token': serviceToken } });
    });
    const page = await context.newPage();
    page.on('pageerror', error => issues.push(`runtime: ${error.message.slice(0, 500)}`));
    const response = await page.goto(renderOrigin.replace(/\/$/, '') + '/internal/courseware-render', { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response?.ok()) throw new Error(`Rendering surface returned HTTP ${response?.status()}`);
    await page.waitForFunction(() => typeof window.renderCourseware === 'function', null, { timeout: 30000 });
    for (let step = -1; step < data.page.beats.length; step++) {
      await page.evaluate(({ data, step }) => window.renderCourseware(data, step), { data, step });
      await page.waitForFunction(step => document.querySelector('[data-courseware-canvas]')?.getAttribute('data-courseware-step') === String(step), step);
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      if (data.page.visual.kind === 'chart') await page.locator('.base-element-chart canvas,.base-element-chart svg').first().waitFor({ timeout: 10000 });
      const measured = await page.evaluate(pathIds => {
        const canvas = document.querySelector('[data-courseware-canvas]');
        const boundary = canvas.getBoundingClientRect();
        const items = [];
        const errors = [];
        for (const element of canvas.querySelectorAll('.base-element-text')) {
          const root = element.closest('[id^="courseware-element-"]');
          const id = root?.id || element.className;
          const box = element.getBoundingClientRect();
          const content = element.querySelector('.ProseMirror-static');
          const range = document.createRange(); range.selectNodeContents(content);
          const textBox = range.getBoundingClientRect();
          const size = parseFloat(getComputedStyle(content.querySelector('p') || content).fontSize);
          const color = getComputedStyle(content.querySelector('p') || content).color;
          let opacity = 1;
          for (let parent = content; parent && parent !== canvas; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
          const text = content.textContent.trim();
          if (text && (textBox.right > box.right + 2 || textBox.bottom > box.bottom + 2 || textBox.left < box.left - 2 || textBox.top < box.top - 2)) errors.push(`${id}: text needs ${Math.ceil(textBox.width)}×${Math.ceil(textBox.height)}px but region is ${Math.round(box.width)}×${Math.round(box.height)}px; expand the region or reflow while preserving key facts`);
          if (text && (textBox.right > boundary.right + 1 || textBox.bottom > boundary.bottom + 1 || textBox.left < boundary.left - 1 || textBox.top < boundary.top - 1)) errors.push(`${id}: visible text lies outside the canvas`);
          items.push({ id, text, size, color, opacity, x: textBox.x - boundary.x, y: textBox.y - boundary.y, width: textBox.width, height: textBox.height });
        }
        for (let i = 0; i < items.length; i++) for (const other of items.slice(i + 1)) {
          const a = items[i];
          if (a.text && other.text && Math.min(a.x + a.width, other.x + other.width) - Math.max(a.x, other.x) > 3 && Math.min(a.y + a.height, other.y + other.height) - Math.max(a.y, other.y) > 3) errors.push(`${a.id} overlaps ${other.id}`);
        }
        for (const image of canvas.querySelectorAll('img')) if (!image.complete || !image.naturalWidth) errors.push('Image failed to decode');
        // Inspect the rendered SVG geometry, not its semantic label or bounding
        // box. Retraced arcs can have a full-size box but no painted interior.
        // Stroke-only paths are legitimate lines, so this gate only applies to
        // filled paths without a visible outline. It is not an occlusion test.
        const pathFills = [];
        const raster = document.createElement('canvas'); raster.width = raster.height = 256;
        const painter = raster.getContext('2d', { willReadFrequently: true });
        for (const id of pathIds) {
          const root = document.getElementById('courseware-element-scene-' + id);
          const path = root?.querySelector('.base-element-shape svg g path');
          if (!path) continue;
          const style = getComputedStyle(path);
          let opacity = Number(style.fillOpacity);
          for (let parent = path; parent && parent !== canvas; parent = parent.parentElement) opacity *= Number(getComputedStyle(parent).opacity);
          if (opacity < 0.01 || style.fill === 'none' || style.fill === 'rgba(0, 0, 0, 0)' || (style.stroke !== 'none' && style.stroke !== 'rgba(0, 0, 0, 0)' && Number(style.strokeOpacity) > 0 && parseFloat(style.strokeWidth) > 0)) continue;
          painter.resetTransform(); painter.clearRect(0, 0, 256, 256);
          painter.scale(256, 256); painter.fillStyle = '#fff';
          painter.fill(new Path2D(path.getAttribute('d')), style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
          const pixels = painter.getImageData(0, 0, 256, 256).data;
          let paintedArea = 0;
          for (let i = 3; i < pixels.length; i += 4) paintedArea += pixels[i] / 255;
          const fillFraction = paintedArea / (256 * 256);
          pathFills.push({ id, fillFraction });
          if (paintedArea < 0.25) errors.push(`scene-${id}: filled SVG path paints no interior in its 0–1 viewBox; its arcs may retrace or lie outside the box. Construct a nonzero filled region (distinct outer and inner boundaries), or use fill=none with a visible stroke for an intended line; preserve the teaching meaning`);
        }
        return { issues: errors, text: items, pathFills, renderedCharts: canvas.querySelectorAll('.base-element-chart canvas,.base-element-chart svg').length };
      }, data.page.visual.kind === 'scene' ? data.page.visual.objects.filter(object => object.kind === 'path').map(object => object.id) : []);
      const png = await page.locator('[data-courseware-canvas]').screenshot({ animations: 'disabled', timeout: 15000 });
      // Sample the actual painted background, not merely the deck theme: a label
      // may sit on a dark shape or outside it. Hidden/deemphasized states are excluded.
      const hideText = await page.addStyleTag({ content: '[data-courseware-canvas] .base-element-text { visibility: hidden !important; }' });
      let background;
      try { background = await page.locator('[data-courseware-canvas]').screenshot({ animations: 'disabled', timeout: 15000 }); }
      finally { await hideText.evaluate(element => element.remove()); }
      const contrasts = await page.evaluate(async ({ encoded, items }) => {
        const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0); bitmap.close();
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
        return items.map(item => {
          if (!item.text || item.opacity < 0.8 || !item.width || !item.height) return null;
          paint.clearRect(0, 0, 1, 1); paint.fillStyle = item.color; paint.fillRect(0, 0, 1, 1);
          const rgba = [...paint.getImageData(0, 0, 1, 1).data];
          const ratios = [];
          for (const px of [0.15, 0.5, 0.85]) for (const py of [0.2, 0.5, 0.8]) {
            const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(item.x + item.width * px)));
            const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(item.y + item.height * py)));
            const index = (y * canvas.width + x) * 4;
            const bg = [...pixels.slice(index, index + 3)];
            const alpha = rgba[3] / 255 * item.opacity;
            const fg = rgba.slice(0, 3).map((value, i) => value * alpha + bg[i] * (1 - alpha));
            const a = luminance(fg), b = luminance(bg);
            ratios.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
          }
          ratios.sort((a, b) => a - b);
          return { id: item.id, median: Number(ratios[4].toFixed(2)), minimum: Number(ratios[0].toFixed(2)) };
        }).filter(Boolean);
      }, { encoded: background.toString('base64'), items: measured.text });
      measured.contrast = contrasts;
      for (const item of contrasts) if (item.median < 3) measured.issues.push(`${item.id}: text contrast is only ${item.median}:1 against its actual painted background; use a readable text color or a contrasting backing region (at least 3:1), preserving content`);
      const hash = createHash('sha256').update(png).digest('hex');
      issues.push(...measured.issues.map(issue => `frame ${step}: ${issue}`));
      if (screenshot) await screenshot(step, png);
      frames.push({ step, screenshotSha256: hash, ...measured });
    }
    if (data.page.beats.length > 1 && new Set(frames.map(frame => frame.screenshotSha256)).size === 1) issues.push('All teaching steps render exactly the same visual; add actual states/focus rather than only new captions');
    lifecycle.throwIfStopped();
    return { issues: [...new Set(issues)], evidence: { mode: 'headless-chromium-dom-and-pixels', sourceSha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'), inspectedAt: new Date().toISOString(), frames, visualAestheticReview: 'not-scored-by-model' } };
  } catch (error) {
    lifecycle.throwIfStopped();
    if (issues.length) error.message += '\nObserved browser errors: ' + issues.join('; ');
    throw error;
  } finally { await lifecycle.dispose(); }
}
