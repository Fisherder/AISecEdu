import { Browser } from './cdp.mjs';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = 'http://10.92.35.7:8080';
const DIR = '/srv/aisecedu-dojo/.cache/construction';
const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8'));
const TASK = process.env.DEMO_TASK || 'build_ee3b3f15b7434faaba2da2c0f938e770';
const PORT = Number(process.env.CDP_PORT || 9298);

const browser = await Browser.launch({ port: PORT, profileDir: `${DIR}/chrome-anytask-${process.pid}` });
const page = await browser.newPage();
const results = [];
const mark = (n, ok, d) => { results.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n} — ${d}`); };

try {
  await page.goto(`${BASE}/login`);
  await page.fill('#name', accounts.author.name);
  await page.fill('#password', accounts.author.newPassword);
  await page.click('#_submit');
  await delay(2500);

  const task = await page.evaluate(`(async () => (await window.DojoLearning.json('GET', '/construction/tasks/${TASK}')).data.task)()`);
  console.log('任务：', task.code, '| kind =', task.kind, '| status =', task.status);

  await page.goto(`${BASE}/teacher/construction`);
  await page.waitFor(`document.getElementById('cc-panel').children.length > 0`, { timeout: 30000 });
  await page.clickText('#cc-nav button[data-view]', '我的创作');
  await page.waitFor(`document.querySelectorAll('[data-task="${TASK}"]').length > 0`, { timeout: 20000 });
  await page.click(`[data-task="${TASK}"]`);
  await page.waitFor(`document.getElementById('cc-detail').open`, { timeout: 15000 });
  await delay(1200);

  const detail = await page.evaluate(`(() => {
    const body = document.getElementById('cc-detail-body');
    const text = (body?.innerText || '');
    return {
      opened: document.getElementById('cc-detail').open,
      hasSelfTest: text.includes('类型自测'),
      mentionsAny: text.includes('不限产物类型'),
      listsAllFamilies: ['课件','演示','实践题','测验'].every(k => text.includes(k)),
    };
  })()`);
  console.log('详情：', JSON.stringify(detail));
  mark('不限类型的任务详情可正常打开', detail.opened, '对话框已打开');
  mark('详情不再引用不存在的清单而崩溃', detail.hasSelfTest && detail.mentionsAny, '显示“不限产物类型”说明');
  mark('详情列出四类可选清单', detail.listsAllFamilies, '课件/演示/实践题/测验 均出现');
  mark('页面无 JS 异常', page.errors().length === 0, JSON.stringify(page.errors().slice(0, 2)));

  const label = await page.evaluate(`(() => {
    const chip = [...document.querySelectorAll('#cc-detail .cc-chip')].map(c => c.innerText.trim());
    return chip;
  })()`);
  console.log('任务标签：', JSON.stringify(label));

  await page.screenshot(`${DIR}/shots/31-any-task-detail.png`);
  if (results.some(r => !r.ok)) process.exitCode = 2;
} catch (error) {
  console.error('FATAL:', error.message);
  console.error('page errors:', page.errors().slice(0, 3));
  process.exitCode = 1;
} finally {
  await browser.close();
}
