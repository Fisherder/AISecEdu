import { Browser } from './cdp.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = 'http://10.92.35.7:8080';
const DIR = '/srv/aisecedu-dojo/.cache/construction';
const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8'));
const seed = JSON.parse(readFileSync(`${DIR}/seed.json`, 'utf8'));
const taskId = seed.tasks.slides.id;
const PORT = Number(process.env.CDP_PORT || 9250);

const browser = await Browser.launch({ port: PORT, profileDir: `${DIR}/chrome-ai-retry-${process.pid}` });
await browser.watchTargets();
const page = await browser.newPage();
const say = m => { console.log(m); };
const log = [];
try {
  await page.goto(`${BASE}/login`);
  await page.fill('#name', accounts.author.name);
  await page.fill('#password', accounts.author.newPassword);
  await page.click('#_submit');
  await delay(2500);

  const ctx = await page.evaluate(`(async () => {
    const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'CSRF-Token': window.init.csrfNonce };
    const r = await fetch('/pwncollege_api/v1/construction/tasks/${taskId}/create-context', { credentials: 'same-origin', headers });
    return (await r.json()).data;
  })()`);
  await page.goto(`${BASE}${ctx.href}`);
  await page.waitFor(`document.querySelector('#teacher-agent')?.dataset.ready === 'true'`, { timeout: 60000 });
  await delay(2500);

  const compact = `${ctx.prompt}\n\n补充要求：本次课件控制在 6 页以内，每页只放一个标题区和一到两个正文区块，不要使用重叠或分层布局；标题不超过 18 个字；表格最多 4 行。`;
  await page.evaluate(`(() => {
    const el = document.getElementById('teaching-input');
    el.value = ${JSON.stringify(compact)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await page.click('#teaching-send');
  say('已发送（紧凑版）生成请求');

  const deadline = Date.now() + Number(process.env.AI_TIMEOUT_MS || 1500000);
  let artifactId = null;
  let last = '';
  let plansSelected = 0;
  while (Date.now() < deadline) {
    await delay(5000);
    const state = await page.evaluate(`(() => {
      const picker = document.querySelector('[data-generation-option-picker-message]');
      const pick = picker ? picker.querySelector('[data-generation-option-id]:not([disabled])') : null;
      const candidate = document.querySelector('[data-candidate-set]');
      const materialize = document.querySelector('[data-materialize-candidate]');
      const artifact = document.querySelector('#teaching-artifact[data-artifact-id]');
      return {
        picker: picker ? (pick?.dataset.generationOptionId || 'waiting') : null,
        candidate: candidate?.dataset.candidateSet || null,
        materialize: materialize?.dataset.materializeCandidate || null,
        artifact: artifact?.dataset.artifactId || null,
        drawer: (document.getElementById('teaching-job-list')?.innerText || '').split(String.fromCharCode(10)).join(' ').slice(0, 200),
      };
    })()`);
    const snap = JSON.stringify({ ...state, drawer: state.drawer.replace(/已用时[^ ]* [^ ]* ?[^ ]*/g, '') });
    if (snap !== last) { say(`· ${snap}`); log.push(state); last = snap; }
    if (state.artifact) { artifactId = state.artifact; break; }
    if (state.picker && state.picker !== 'waiting') {
      plansSelected += 1;
      await page.click(`[data-generation-option-message][data-generation-option-id="${state.picker}"]`).catch(e => say(`  选择方案失败：${e.message}`));
      continue;
    }
    if (state.materialize) { await page.click(`[data-materialize-candidate="${state.materialize}"]`).catch(() => {}); continue; }
    if (state.candidate) { await page.click(`[data-candidate-set="${state.candidate}"]`).catch(() => {}); continue; }
  }
  writeFileSync(`${DIR}/ai-retry-result.json`, JSON.stringify({ artifactId, plansSelected, log }, null, 2));
  say(artifactId ? `SUCCESS artifact=${artifactId} url=${await page.url()}` : 'TIMEOUT: 未产出课件作品');
  process.exitCode = artifactId ? 0 : 3;
} catch (error) {
  console.error('FATAL:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
