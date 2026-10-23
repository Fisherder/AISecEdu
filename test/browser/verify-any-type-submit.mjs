import { Browser } from './cdp.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = 'http://10.92.35.7:8080';
const DIR = '/srv/aisecedu-dojo/.cache/construction';
const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8'));
const TASK = process.env.E2E_TASK || 'build_549c9d0360fd4fb884b058b4db914f8e';
const PORT = Number(process.env.CDP_PORT || 9280);

const browser = await Browser.launch({ port: PORT, profileDir: `${DIR}/chrome-anytype-${process.pid}` });
await browser.watchTargets();
const contexts = {};
const results = [];
const mark = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`); };

async function session(key) {
  contexts[key] ??= await browser.newContext();
  const page = await browser.newPage({ contextId: contexts[key] });
  await page.goto(`${BASE}/login`);
  await page.fill('#name', accounts[key].name);
  await page.fill('#password', accounts[key].newPassword);
  await page.click('#_submit');
  await delay(2500);
  if ((await page.url()).includes('/login')) throw new Error(`${key} 登录失败`);
  return page;
}

async function api(page, method, path, body) {
  return await page.evaluate(`(async () => {
    try {
      const envelope = await window.DojoLearning.json(${JSON.stringify(method)}, ${JSON.stringify(path)},
        ${body === undefined ? 'undefined' : JSON.stringify(body)});
      return { ok: true, data: envelope && envelope.data };
    } catch (error) { return { ok: false, message: String((error && error.message) || error) }; }
  })()`);
}

async function status(page) {
  const detail = await api(page, 'GET', `/construction/tasks/${TASK}`);
  return detail.data?.task || null;
}

async function openTask(page, view) {
  await page.goto(`${BASE}/teacher/construction`);
  await page.waitFor(`document.getElementById('cc-panel').children.length > 0`, { timeout: 30000 });
  await page.clickText('#cc-nav button[data-view]', view);
  await page.waitFor(`document.querySelectorAll('[data-task="${TASK}"]').length > 0`, { timeout: 20000 });
  await page.click(`[data-task="${TASK}"]`);
  await page.waitFor(`document.getElementById('cc-detail').open`, { timeout: 15000 });
}

async function fillForm(page, fields) {
  for (const [name, value] of Object.entries(fields)) {
    const selector = `#cc-fields [name="${name}"]`;
    const tag = await page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.tagName`);
    if (tag === 'SELECT') {
      const exists = await page.evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].some(o => o.value === ${JSON.stringify(String(value))})`);
      await page.selectOption(selector, exists ? value : await page.evaluate(`([...document.querySelector(${JSON.stringify(selector)}).options].find(o => o.value !== '') || {}).value`));
    } else await page.fill(selector, value);
  }
}

async function submitForm(page, label) {
  await page.click('#cc-form-submit');
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(`({ open: document.getElementById('cc-form').open, error: (document.getElementById('cc-form-error').textContent||'').trim() })`);
    if (state.error) throw new Error(`${label} 失败：${state.error}`);
    if (!state.open) return;
    await delay(200);
  }
  throw new Error(`${label} 超时`);
}

async function visibleChecks(page) {
  return await page.evaluate(`(() => {
    const groups = [...document.querySelectorAll('#cc-fields fieldset')].filter(f => f.querySelector('[name="checks"]'));
    const shown = groups.filter(g => !g.hidden).map(g => g.dataset.family || 'review');
    const items = groups.filter(g => !g.hidden).flatMap(g => [...g.querySelectorAll('[name="checks"]')].map(i => i.value));
    const disabled = groups.filter(g => g.hidden).flatMap(g => [...g.querySelectorAll('input')].map(i => i.disabled));
    return { shown, items, allDisabledWhenHidden: disabled.every(Boolean) };
  })()`);
}

async function tickAllChecks(page) {
  const count = await page.evaluate(`document.querySelectorAll('#cc-fields fieldset:not([hidden]) [name="checks"]').length`);
  for (let i = 0; i < count; i += 1) {
    await page.check('#cc-fields fieldset:not([hidden]) [name="checks"]', { nth: i }).catch(() => {});
  }
  return count;
}

let options = [];
let checks = { shown: [], items: [] };
let reviewChecks = { shown: [], items: [] };
try {
  const author = await session('author');
  const startState = await status(author);
  console.log('  任务起点状态：', startState.status);
  await openTask(author, '我的创作');
  if (startState.status === 'working' || startState.status === 'changes_requested') {
  await author.click('#cc-detail [data-submit]');
  await author.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
  await delay(1500);

  const head = await author.evaluate(`document.querySelector('#cc-fields')?.parentElement?.innerText || ''`);
  options = await author.evaluate(`[...document.querySelectorAll('#cc-fields [name="source"] option')].map(o => ({ value: o.value, text: o.textContent.trim() }))`);
  console.log('  下拉选项：', JSON.stringify(options));
  mark('任务现在能列出课件项目', options.some(o => o.text.includes('课件')), options.map(o => o.text).join(' | '));
  mark('对话框说明本任务接受任意类型', /接受任意类型/.test(head), '已说明');
  mark('未选项目时不显示任何自测清单', (await visibleChecks(author)).shown.length === 0, '初始无清单');

  const slideIndex = options.find(o => o.text.includes('课件'))?.value;
  await author.selectOption('#cc-fields [name="source"]', slideIndex);
  await delay(600);
  checks = await visibleChecks(author);
  console.log('  选中课件后显示的清单：', JSON.stringify(checks.shown), checks.items.join('、'));
  mark('自测清单切换为课件（slides）家族', checks.shown.length === 1 && checks.shown[0] === 'slides', checks.shown.join(','));
  mark('其他家族的清单被禁用（不会随表单提交）', checks.allDisabledWhenHidden, 'hidden 组内 input 全部 disabled');

  await fillForm(author, {
    sources: 'SRC-01 计算机网络基础 · 第 1 章讲义（课程组编写）第 1–5 节；SRC-02 Wireshark 官方用户指南第 2–3 章。课件分层职责表与两道练习均取自 SRC-01，未使用课程外资料。',
    tests: '逐页核对 6 页课件：标题与正文可读、无重叠；分层职责表与 SRC-01 第 1 章一致；两道练习答案与解析与讲义第 4 节一致；引用位置标注到章节。',
    answers: '课件每道练习页均含答案与解析；分层职责与协议归属以 SRC-01 第 1 章表格为准；学员视图仅含题干与提示。',
    environment: '原生 slide-deck 作品，浏览器逐页预览核对即可，无需额外运行环境。',
    changes: '按任务要求以课件形式交付，说明本任务接受任意类型后的首次提交。',
  });
  const itemCount = await author.count('#cc-fields .cc-checks:not([hidden]) [name="checks"]');
  for (let i = 0; i < itemCount; i += 1) await author.check('#cc-fields .cc-checks:not([hidden]) [name="checks"]', { nth: i }).catch(() => {});
  const checkedValues = await author.evaluate(`[...document.querySelectorAll('#cc-fields .cc-checks:not([hidden]) [name="checks"]')].map(i => ({ v: i.value, c: i.checked }))`);
  console.log('  勾选自测项：', JSON.stringify(checkedValues));
  mark('课件家族的全部自测项可勾选', checkedValues.length > 0 && checkedValues.every(x => x.c), `${checkedValues.length} 项`);

  await submitForm(author, '提交课件');
  const afterSubmit = await status(author);
  mark('课件可以提交到该任务（不限定类型）', afterSubmit.status === 'peer_review', `状态 → ${afterSubmit.status}`);
  } else {
    mark('课件可以提交到该任务（不限定类型）', ['peer_review','final_review','release_pending','released'].includes(startState.status), `已在 ${startState.status}（沿用上一轮提交）`);
  }

  const detail = await api(author, 'GET', `/construction/tasks/${TASK}`);
  const sub = (detail.data?.submissions || [])[0];
  console.log('  提交记录：', JSON.stringify({ contentType: sub?.contentType, productKind: sub?.productKind, taskKind: sub?.taskKind }));
  mark('提交记录了实际交付类型与任务类型', sub?.contentType === 'slide-deck' && sub?.productKind === 'slides' && ['quiz','any'].includes(sub?.taskKind),
    `contentType=${sub?.contentType} productKind=${sub?.productKind} taskKind=${sub?.taskKind}`);

  const peer = await session('peer');
  const peerState = await status(peer);
  if (peerState.status !== 'released') await openTask(peer, '我的审核');
  if (peerState.status === 'peer_review') {
  await peer.click('#cc-detail [data-review]');
  await peer.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
  const reviewHead = await peer.evaluate(`document.querySelector('#cc-fields')?.parentElement?.innerText || ''`);
  reviewChecks = await visibleChecks(peer);
  console.log('  复核清单：', reviewChecks.items.join('、'));
  mark('复核清单与所交课件类型一致（不是测验清单）', reviewChecks.items.some(x => /逐页|事实公式/.test(x)) && !reviewChecks.items.some(x => /计分与随机顺序/.test(x)), reviewChecks.items.join('、'));
  mark('复核页标明项目类型', /项目类型：课件/.test(reviewHead), '已标明');

  await peer.click(`#cc-fields [data-preview="${sub.id}"]`);
  const preview = await browser.waitForNewPage({ timeout: 25000 });
  await delay(2500);
  const previewUrl = await preview.url();
  await browser.closePage(preview);
  mark('冻结副本可打开', /teacher\/artifacts\/artifact_/.test(previewUrl), previewUrl);

  await fillForm(peer, { decision: 'pass', note: '独立复核：逐页核对课件，版式与事实均正确，练习答案与解析完整，符合课件家族全部自测项。本任务接受任意类型，课件作为交付物成立。' });
  const peerTicked = await tickAllChecks(peer);
  mark('复核表单提供与课件一致的自测项并可勾选', peerTicked === 4, `${peerTicked} 项`);
  await peer.check('#cc-fields [name="previewed"]');
  await submitForm(peer, '复核');
  mark('复核通过', (await status(peer)).status === 'final_review', (await status(peer)).status);
  } else {
    mark('复核通过', ['final_review','release_pending','released'].includes(peerState.status), `已在 ${peerState.status}`);
  }

  const final = await session('final');
  const finalState = await status(final);
  if (finalState.status === 'final_review') {
  await openTask(final, '我的审核');
  await final.click('#cc-detail [data-review]');
  await final.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
  await final.click(`#cc-fields [data-preview="${sub.id}"]`);
  await browser.waitForNewPage({ timeout: 25000 }).then(p => browser.closePage(p));
  await fillForm(final, { decision: 'pass', note: '终审：课件与课程 CH02 目标对齐，术语与课程规划一致，同意入库。' });
  const finalTicked = await tickAllChecks(final);
  mark('终审表单提供与课件一致的自测项并可勾选', finalTicked === 4, `${finalTicked} 项`);
  await final.check('#cc-fields [name="previewed"]');
  await submitForm(final, '终审');
  mark('终审通过', (await status(final)).status === 'release_pending', (await status(final)).status);
  } else {
    mark('终审通过', ['release_pending','released'].includes(finalState.status), `已在 ${finalState.status}`);
  }

  const preRelease = await status(final);
  if (preRelease.status === 'release_pending') {
    await openTask(final, '我的审核');
    await final.click('#cc-detail [data-publish]');
    await delay(4000);
  }
  const released = await status(final);
  mark('任意类型任务可验收入库', released.status === 'released' && Boolean(released.materialId), `素材 ${released.materialId}`);

  writeFileSync(`${DIR}/any-type-result.json`, JSON.stringify({ results, options, checks, reviewChecks }, null, 2));
  if (results.some(r => !r.ok)) process.exitCode = 2;
} catch (error) {
  console.error('FATAL:', error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
