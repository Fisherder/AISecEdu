import { Browser } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.DOJO_BASE || 'http://10.92.35.7:8080';
const DIR = '/srv/aisecedu-dojo/.cache/construction';
const SHOTS = `${DIR}/shots`;
mkdirSync(SHOTS, { recursive: true });
const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8'));
const seed = JSON.parse(readFileSync(`${DIR}/seed.json`, 'utf8'));
const TASK = 'build_549c9d0360fd4fb884b058b4db914f8e';
const PORT = Number(process.env.CDP_PORT || 9270);

const browser = await Browser.launch({ port: PORT, profileDir: `${DIR}/chrome-quiz-${process.pid}` });
const page = await browser.newPage();
const results = [];
const mark = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

async function api(method, path, body) {
  return await page.evaluate(`(async () => {
    try {
      const envelope = await window.DojoLearning.json(${JSON.stringify(method)}, ${JSON.stringify(path)},
        ${body === undefined ? 'undefined' : JSON.stringify(body)});
      return { ok: true, data: envelope && envelope.data };
    } catch (error) { return { ok: false, message: String((error && error.message) || error) }; }
  })()`);
}

function ccFormFields() {
  return page.evaluate(`(() => {
    const select = document.querySelector('#cc-fields [name="source"]');
    return {
      label: select ? (select.closest('label')?.innerText || '').split(String.fromCharCode(10))[0] : null,
      options: select ? [...select.options].map(o => o.textContent.trim()) : null,
      error: (document.querySelector('#cc-fields .cc-error')?.innerText || '').trim(),
      help: [...document.querySelectorAll('#cc-fields .cc-help')].map(n => n.innerText.trim()),
    };
  })()`);
}

try {
  await page.goto(`${BASE}/login`);
  await page.fill('#name', accounts.author.name);
  await page.fill('#password', accounts.author.newPassword);
  await page.click('#_submit');
  await delay(2500);

  const detail = await api('GET', `/construction/tasks/${TASK}`);
  console.log('task:', detail.data?.task?.code, detail.data?.task?.kind, detail.data?.task?.status);

  if (detail.data?.task?.status === 'open') {
    await api('POST', `/construction/tasks/${TASK}/action`, { revision: detail.data.task.revision, action: 'claim' });
  }

  console.log('\n=== 复现场景：测验任务 + 创作空间里只有课件 ===');
  const sources = await api('GET', `/material-library/sources?kind=artifact&limit=100&courseId=${seed.workspaces.author.dojoId}`);
  const available = (sources.data?.sources || []).map(s => `${s.typeLabel}(${s.type}) · ${s.title}`);
  console.log('  创作空间内项目：', JSON.stringify(available));

  await page.goto(`${BASE}/teacher/construction`);
  await page.waitFor(`document.getElementById('cc-panel').children.length > 0`, { timeout: 30000 });
  await page.clickText('#cc-nav button[data-view]', '我的创作');
  await page.waitFor(`document.querySelectorAll('[data-task="${TASK}"]').length > 0`, { timeout: 20000 });
  await page.click(`[data-task="${TASK}"]`);
  await page.waitFor(`document.getElementById('cc-detail').open`, { timeout: 15000 });
  await page.click('#cc-detail [data-submit]');
  await page.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
  await delay(1500);

  const fields = await ccFormFields();
  console.log('  下拉标题：', fields.label);
  console.log('  下拉选项：', JSON.stringify(fields.options));
  console.log('  提示信息：', fields.error.replace(/\s+/g, ' ').slice(0, 260));
  await page.screenshot(`${SHOTS}/20-quiz-mismatch.png`).catch(() => {});

  mark('下拉标题写明本任务要求的项目类型', /本任务要求：/.test(fields.label || '') && /测验|题集|测评|知识测验|作业/.test(fields.label || ''), fields.label);
  mark('空列表时说明是类型不匹配而不是没有项目', /类型不匹配/.test(fields.error) && /目前是/.test(fields.error), fields.error.replace(/\s+/g, ' ').slice(0, 120));
  mark('提示里给出应创建的目标类型', /课件/.test(fields.error) && /(测验|题集|测评|知识测验|作业)/.test(fields.error), '已同时指出现有类型与要求类型');
  mark('下拉中确实没有可选项（服务端类型门禁生效）', (fields.options || []).length === 1, `选项数 ${(fields.options || []).length}`);

  await page.click('#cc-form [data-close]').catch(() => {});
  await delay(800);

  console.log('\n=== 任务入口：开始创作带入正确产物类型 ===');
  const ctx = await api('GET', `/construction/tasks/${TASK}/create-context`);
  console.log('  href:', ctx.data?.href);
  console.log('  artifactType:', ctx.data?.artifactType, '| requiredKinds:', JSON.stringify(ctx.data?.requiredKinds));
  mark('任务入口给出可直接提交的产物类型', ctx.data?.artifactType === 'question-set', `artifactType=${ctx.data?.artifactType}`);
  mark('入口链接不再携带整份任务说明', (ctx.data?.href || '').length < 200 && !(ctx.data?.href || '').includes('prompt='), `长度 ${(ctx.data?.href || '').length}`);

  await page.goto(`${BASE}${ctx.data.href}`);
  await page.waitFor(`document.querySelector('#teacher-agent')?.dataset.ready === 'true'`, { timeout: 60000, message: 'AI 共创页面未就绪' });
  await delay(3000);
  const ai = await page.evaluate(`({
    promptLength: (document.getElementById('teaching-input')?.value || '').length,
    promptHead: (document.getElementById('teaching-input')?.value || '').slice(0, 60),
    artifactType: document.getElementById('teaching-artifact-type')?.value,
    notice: (document.getElementById('teaching-notice')?.innerText || '').trim().slice(0, 200),
  })`);
  console.log('  AI 页：说明', ai.promptLength, '字｜类型', ai.artifactType, '｜提示', ai.notice.replace(/\s+/g, ' '));
  await page.screenshot(`${SHOTS}/21-quiz-ai-entry.png`).catch(() => {});
  mark('AI 页自动带入任务说明', ai.promptLength > 200 && /WX|CN-BASE/.test(ai.promptHead), `${ai.promptLength} 字`);
  mark('AI 页产物类型已设为可提交类型', ai.artifactType === 'question-set', `artifactType=${ai.artifactType}`);

  writeFileSync(`${DIR}/quiz-repro-result.json`, JSON.stringify({ results, fields, ai }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 2;
} catch (error) {
  console.error('FATAL:', error.message);
  console.error('page errors:', page.errors().slice(0, 3));
  process.exitCode = 1;
} finally {
  await browser.close();
}
