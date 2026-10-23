import { Browser } from './cdp.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = 'http://10.92.35.7:8080';
const DIR = '/srv/aisecedu-dojo/.cache/construction';
const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8'));
const TASK = process.env.DEMO_TASK || 'build_3b30ffcdc8674ad9ba60a545f73b38ba';
const PORT = Number(process.env.CDP_PORT || 9320);

const browser = await Browser.launch({ port: PORT, profileDir: `${DIR}/chrome-optional-${process.pid}` });
const page = await browser.newPage();
const results = [];
const mark = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} — ${d}`); };

async function status() {
  return await page.evaluate(`(async () => (await window.DojoLearning.json('GET', '/construction/tasks/${TASK}')).data.task)()`);
}

try {
  await page.goto(`${BASE}/login`);
  await page.fill('#name', accounts.author.name);
  await page.fill('#password', accounts.author.newPassword);
  await page.click('#_submit');
  await delay(2500);

  const start = await status();
  console.log('任务起点：', start.code, start.status);

  await page.goto(`${BASE}/teacher/construction`);
  await page.waitFor(`document.getElementById('cc-panel').children.length > 0`, { timeout: 30000 });
  await page.clickText('#cc-nav button[data-view]', '我的创作');
  await page.waitFor(`document.querySelectorAll('[data-task="${TASK}"]').length > 0`, { timeout: 20000 });
  await page.click(`[data-task="${TASK}"]`);
  await page.waitFor(`document.getElementById('cc-detail').open`, { timeout: 15000 });
  await page.click('#cc-detail [data-submit]');
  await page.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
  await delay(1200);

  const form = await page.evaluate(`(() => {
    const required = [...document.querySelectorAll('#cc-fields [required]')].map(n => n.name || n.tagName);
    const collapsed = document.querySelector('#cc-fields .cc-optional');
    return {
      requiredCount: required.length,
      requiredNames: required,
      notesCollapsed: Boolean(collapsed) && !collapsed.open,
      textareaCount: document.querySelectorAll('#cc-fields textarea').length,
      visibleTextareas: [...document.querySelectorAll('#cc-fields textarea')].filter(t => t.offsetParent !== null).length,
    };
  })()`);
  console.log('表单：', JSON.stringify(form));
  mark('除项目选择外没有必填项', form.requiredNames.filter(n => n !== 'source').length === 0, JSON.stringify(form.requiredNames));
  mark('补充说明默认折叠', form.notesCollapsed, `展开时含 ${form.textareaCount} 个文本框，当前可见 ${form.visibleTextareas} 个`);

  const options = await page.evaluate(`[...document.querySelectorAll('#cc-fields [name="source"] option')].map(o => o.textContent.trim())`);
  mark('仍能选择要提交的项目', options.length > 1, options.join(' | '));

  await page.selectOption('#cc-fields [name="source"]', '0');
  await delay(500);
  await page.click('#cc-form-submit');
  const deadline = Date.now() + 90000;
  let error = '';
  while (Date.now() < deadline) {
    const state = await page.evaluate(`({ open: document.getElementById('cc-form').open, error: (document.getElementById('cc-form-error').textContent||'').trim() })`);
    if (state.error) { error = state.error; break; }
    if (!state.open) break;
    await delay(200);
  }
  if (error) throw new Error(`空表单提交被拒：${error}`);

  const after = await status();
  mark('不填任何说明与自测记录即可提交', after.status === 'peer_review', `状态 ${start.status} → ${after.status}`);

  const detail = await page.evaluate(`(async () => (await window.DojoLearning.json('GET', '/construction/tasks/${TASK}')).data)()`);
  const sub = (detail.submissions || [])[0];
  console.log('提交证据：', JSON.stringify(sub?.evidence));
  mark('证据留空被服务端接受', sub && Object.values(sub.evidence || {}).every(v => !v || (Array.isArray(v) && v.length === 0)), JSON.stringify(sub?.evidence).slice(0, 120));

  writeFileSync(`${DIR}/optional-evidence-result.json`, JSON.stringify({ results, form, evidence: sub?.evidence }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 2;
} catch (error) {
  console.error('FATAL:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
