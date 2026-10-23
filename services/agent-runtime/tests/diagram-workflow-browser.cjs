const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require('/Users/fisherder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(base, 'lib/widgets/diagram.ts'), 'utf8');
const output = path.resolve(base, '../../cache/cinematic-controls/diagram-renderer-v7');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/diagram-workflow.json'), 'utf8'));
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  exports: exportsObject,
  require(id) {
    throw Error('Unexpected renderer dependency: ' + id);
  },
});
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const report = { sourceHash: crypto.createHash('sha256').update(source).digest('hex'), cases: [], errors: [], requests: [] };
  const context = await browser.newContext({ offline: true });
  await context.route('**/*', route => { report.requests.push(route.request().url()); return route.abort(); });
  async function createPage(config, viewport) {
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.setContent('<style>html,body{margin:0}iframe{display:block;width:100vw;height:100vh;border:0}</style><iframe title="离线流程图" sandbox="allow-scripts"></iframe>');
    await page.locator('iframe').evaluate((element, html) => { element.srcdoc = html; }, exportsObject.renderDiagramHtml(config));
    const frame = page.frameLocator('iframe');
    await frame.locator('[data-diagram-details][data-state="collapsed"]').waitFor();
    return { page, frame };
  }
  try {
    for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, narrow: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } })) {
      const { page, frame } = await createPage(fixture, viewport);
      try {
        const buttons = frame.locator('[data-diagram-node]:visible');
        assert.equal(await buttons.count(), 5);
        const assertCollapsed = async () => {
          assert.equal(await frame.locator('[data-diagram-node][aria-pressed="true"]').count(), 0);
          assert.equal(await frame.locator('[data-diagram-node][aria-expanded="true"]').count(), 0);
          assert.equal(await frame.locator('[data-diagram-details]').getAttribute('data-state'), 'collapsed');
          assert.equal(await frame.locator('#diagram-detail-title').innerText(), '步骤说明');
          assert.equal(await frame.locator('#diagram-relations li').count(), 0);
        };
        await assertCollapsed();
        await page.screenshot({ path: path.join(output, name + '-initial-collapsed.png') });
        for (const node of fixture.nodes) {
          const button = frame.getByRole('button', { name: node.label, exact: true });
          await button.click();
          assert.equal(await button.getAttribute('aria-pressed'), 'true');
          assert.equal(await frame.locator('[data-diagram-node][aria-pressed="true"]:visible').count(), 1);
          assert.equal(await frame.locator('#diagram-detail-title').innerText(), node.label);
          assert.equal(await frame.locator('#diagram-detail-text').innerText(), node.details);
          assert.equal(await button.getAttribute('aria-expanded'), 'true');
          await button.click(); await assertCollapsed();
        }
        await buttons.first().focus(); await page.keyboard.press('Enter');
        assert.equal(await frame.locator('#diagram-detail-title').innerText(), fixture.nodes[0].label);
        await page.keyboard.press('Enter'); await assertCollapsed();
        await page.keyboard.press('Space');
        assert.equal(await frame.locator('#diagram-detail-title').innerText(), fixture.nodes[0].label);
        await page.keyboard.press('Space'); await assertCollapsed();
        await page.keyboard.press('Tab'); await page.keyboard.press('Space');
        assert.equal(await frame.locator('#diagram-detail-text').innerText(), fixture.nodes[1].details);
        await page.keyboard.press('ArrowRight');
        assert.equal(await frame.locator('#diagram-detail-title').innerText(), fixture.nodes[2].label);
        await page.keyboard.press('End');
        assert.equal(await frame.locator('#diagram-detail-title').innerText(), fixture.nodes[4].label);
        assert.ok((await frame.locator('#diagram-relations').innerText()).includes('改进后再练习'));
        await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
        assert.equal(await frame.locator('#diagram-detail-title').innerText(), fixture.nodes[1].label);
        await page.keyboard.press('Escape'); await assertCollapsed();
        await buttons.first().click();
        await frame.locator('[data-diagram-reset]').click(); await assertCollapsed();
        await buttons.first().click();
        await frame.locator('[data-diagram-reset]').focus(); await page.keyboard.press('Enter'); await assertCollapsed();
        await buttons.first().click();
        await frame.locator('[data-diagram-reset]').focus(); await page.keyboard.press('Space'); await assertCollapsed();
        await page.screenshot({ path: path.join(output, name + '-reset-collapsed.png') });
        await buttons.nth(1).click();
        const metrics = await frame.locator('[data-diagram="v1"]').evaluate(element => {
          const visible = [...element.querySelectorAll('[data-diagram-node]')].filter(node => node.getClientRects().length);
          const rects = visible.map(node => node.getBoundingClientRect());
          const panel = element.querySelector('[data-diagram-details]').getBoundingClientRect();
          const graph = visible[0].closest('.diagram-scroll').getBoundingClientRect();
          return { pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, orientation: visible[0].closest('.diagram-view').dataset.orientation, nodeRects: rects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height })), panel: { left: panel.left, right: panel.right, width: panel.width }, panelOverlapsGraph: Math.min(panel.right, graph.right) > Math.max(panel.left, graph.left) && Math.min(panel.bottom, graph.bottom) > Math.max(panel.top, graph.top), overlaps: rects.some((a, i) => rects.some((b, j) => i < j && Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top))) };
        });
        assert.ok(metrics.pageWidth <= metrics.viewportWidth + 1, name + ' document overflows horizontally');
        assert.ok(metrics.panel.left >= 0 && metrics.panel.right <= metrics.viewportWidth + 1);
        assert.equal(metrics.overlaps, false);
        assert.equal(metrics.panelOverlapsGraph, false);
        assert.equal(metrics.orientation, name === 'narrow' ? 'vertical' : 'horizontal');
        await frame.locator('[data-diagram-details]').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, name + '-details.png') });
        await frame.locator('.diagram-view:visible').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, name + '-graph.png') });
        if (name === 'desktop') {
          await buttons.last().focus(); await page.keyboard.press('Enter');
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(100);
          const focused = await frame.locator('[data-diagram="v1"]').evaluate(() => ({ id: document.activeElement?.getAttribute('data-diagram-node'), visible: Boolean(document.activeElement?.getClientRects().length) }));
          assert.equal(focused.id, 'feedback'); assert.equal(focused.visible, true);
          assert.equal(await frame.locator('#diagram-detail-title').innerText(), '反馈');
          await frame.getByRole('button', { name: '反馈', exact: true }).click(); await assertCollapsed();
          await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(100);
          await assertCollapsed();
          assert.equal(await buttons.last().evaluate(element => document.activeElement === element), true);
          await page.keyboard.press('Enter');
          assert.equal(await frame.locator('#diagram-detail-title').innerText(), '反馈');
        }
        report.cases.push({ name, passed: true, metrics, checks: ['initially all collapsed', 'all node clicks/full details/reclick collapse', 'Enter/Space toggle, Tab/arrows/Home/End', 'Escape collapse and pointer/keyboard reset', 'resize preserves expanded/collapsed state and focus', 'single selected highlight', 'complete feedback graph', 'sandbox offline', 'no document overflow or node overlap'] });
      } finally { await page.close(); }
    }
    const hostile = '" onfocus="globalThis.diagramInjected=1"><script>globalThis.diagramInjected=2</script><img src="https://example.invalid/probe" onerror="globalThis.diagramInjected=3">&';
    const tricky = structuredClone(fixture);
    const hostileId = 'id"><script>globalThis.diagramInjected=1</script>';
    tricky.title = hostile; tricky.description = hostile; tricky.nodes[0].id = hostileId;
    tricky.nodes[0].label = hostile; tricky.nodes[0].details = hostile.repeat(10); tricky.nodes[0].kind = 'constructor'; tricky.edges[0].from = hostileId; tricky.edges[0].label = hostile;
    const { page, frame } = await createPage(tricky, { width: 390, height: 844 });
    try {
      assert.equal(await frame.getByRole('button', { name: hostile, exact: true }).getAttribute('data-diagram-node'), hostileId);
      assert.equal(await frame.locator('[data-diagram-details]').getAttribute('data-state'), 'collapsed');
      await frame.getByRole('button', { name: hostile, exact: true }).click();
      assert.equal(await frame.locator('#diagram-detail-text').textContent(), tricky.nodes[0].details);
      await frame.getByRole('button', { name: hostile, exact: true }).press('Enter');
      assert.equal(await frame.locator('[data-diagram-details]').getAttribute('data-state'), 'collapsed');
      await frame.getByRole('button', { name: hostile, exact: true }).press('Space');
      assert.equal(await frame.locator('#diagram-detail-text').textContent(), tricky.nodes[0].details);
      await frame.locator('[data-diagram-reset]').click();
      assert.equal(await frame.locator('[data-diagram-node][aria-expanded="true"]').count(), 0);
      const safety = await frame.locator('[data-diagram="v1"]').evaluate(() => ({ executed: globalThis.diagramInjected || false, scripts: document.scripts.length, images: document.images.length, autofocus: document.querySelectorAll('[autofocus],[onfocus],[onerror]').length }));
      assert.deepEqual(safety, { executed: false, scripts: 2, images: 0, autofocus: 0 });
      await frame.getByRole('button', { name: '学习', exact: true }).click();
      assert.equal(await frame.locator('#diagram-relations').textContent(), '来自：' + hostile + ' — ' + hostile + '指向：练习 — 应用');
      report.cases.push({ name: 'escaped-config', passed: true, safety });
    } finally { await page.close(); }
    assert.deepEqual(report.requests, []); assert.deepEqual(report.errors, []);
    report.passed = true; console.log(JSON.stringify(report));
  } finally { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
