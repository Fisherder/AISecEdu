const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');
const markup = read('dojo_theme/templates/teacher_assignment.html').match(/<main[\s\S]*<\/main>/)[0]
  .replace(/\{\{[\s\S]*?\}\}/g, 'synthetic');

for (const width of [1280, 390]) {
  test(`teacher evidence and edits at ${width}px`, async () => {
    const browser = await chromium.launch({ headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.abort());
      await page.setContent(`<style>:root{--theme-text:#18283c;--theme-text-muted:#42566e;--theme-surface:white;--theme-primary:#2462aa}body{margin:0}</style>${markup}`);
      await page.addStyleTag({ content: read('dojo_theme/static/css/teacher-assignment.css') });
      await page.addScriptTag({ content: read('dojo_theme/static/js/dojo/learning-common.js') });
      await page.evaluate(() => {
        const config = { correctAnswer: false, explanation: '合成解析', coursewareEvidence: {
          title: '<img src=x onerror="window.evidenceExecuted=true">合成材料',
          quote: '默认规则 <script>window.evidenceExecuted=true</script> 仅在全部未命中时执行。',
          ordinal: 0, revisionId: 'revision-' + 'a'.repeat(128),
        }};
        window.fixture = { id: 'synthetic', title: '课件测验草稿', courseName: '合成课程', dojoReferenceId: 'synthetic',
          status: 'DRAFT', updated: 'revision-1', itemCount: 1, answerPolicy: { mode: 'NEVER' }, submissionCounts: {},
          settings: { generation: { groundingAudit: { status: 'VALIDATED' } } },
          items: [{ id: 'q1', type: 'TRUE_FALSE', title: '规则判断', prompt: '默认策略是否先于规则匹配执行？',
            points: 10, required: true, config: {}, editConfig: config }] };
        window.DojoLearning.request = async () => ({ data: { assignment: structuredClone(window.fixture) } });
        window.DojoLearning.json = async (method, endpoint, body) => {
          window.savedRequest = { method, endpoint, body };
          window.fixture.items = body.items.map(item => ({ ...item, editConfig: item.config }));
          window.fixture.settings.generation.groundingAudit.status = 'STALE';
        };
      });
      await page.addScriptTag({ content: read('dojo_theme/static/js/dojo/teacher-assignment.js') });
      await page.locator('.assignment-evidence summary').click();
      assert.match(await page.locator('#assignment-edit-hint').textContent(), /原文引用与模型审校已完成/);
      assert.match(await page.locator('.assignment-evidence blockquote').textContent(), /<script>/);
      assert.equal(await page.locator('.assignment-evidence img, .assignment-evidence script').count(), 0);
      assert.equal(await page.locator('.assignment-dependencies').count(), 0);
      assert.equal(await page.evaluate(() => window.evidenceExecuted), undefined);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page must fit viewport');
      await page.selectOption('[data-item-field="booleanAnswer"]', 'true');
      await page.locator('#assignment-items-save').click();
      await page.waitForFunction(() => document.getElementById('assignment-edit-hint').textContent.includes('审查已过期'));
      const saved = await page.evaluate(() => window.savedRequest);
      assert.equal(saved.method, 'PATCH');
      assert.equal(saved.body.expectedUpdated, 'revision-1');
      assert.equal(saved.body.items[0].config.correctAnswer, true);
      assert.equal(saved.body.items[0].config.coursewareEvidence.ordinal, 0);
      assert.equal(saved.body.settings, undefined);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
