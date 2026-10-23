import { Browser } from './cdp.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const BASE = process.env.DOJO_BASE || 'http://10.92.35.7:8080';
const DIR = '/srv/aisecedu-dojo/.cache/construction';
const SHOTS = `${DIR}/shots`;
const STATE = process.env.E2E_STATE || `${DIR}/run-state.json`;
const PORT = Number(process.env.CDP_PORT || 9231);
mkdirSync(SHOTS, { recursive: true });

const accounts = JSON.parse(readFileSync(`${DIR}/accounts.json`, 'utf8'));
const seed = JSON.parse(readFileSync(`${DIR}/seed.json`, 'utf8'));
const run = (() => { try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return {}; } })();
const save = () => writeFileSync(STATE, JSON.stringify(run, null, 2));

const HANDOUT = readFileSync(`${DIR}/networking-layering-handout.md`, 'utf8');

const CHECKS = {
  slides: ['逐页预览可读', '事实公式代码正确', '例题答案核对', '来源与目标覆盖'],
  demo: ['完整运行与关键状态', '交互控制和重置', '预期现象符合原理', '资源依赖可获取'],
  practice: ['干净环境运行', '正确解通过', '典型错误解失败', '边界测试与重置', '学生视图无答案泄露'],
  quiz: ['独立完成全部题目', '答案及解析核对', '无歧义或等价答案规则', '计分与随机顺序检查'],
};

const transcript = [];
const say = message => { transcript.push(message); console.log(message); };
const record = (name, data) => { run[name] = { ...(run[name] || {}), ...data }; save(); };

const contexts = {};
async function openSession(browser, key) {
  contexts[key] ??= await browser.newContext();
  const page = await browser.newPage({ contextId: contexts[key] });
  await page.clearCookies();
  await page.goto(`${BASE}/login`);
  await page.fill('#name', accounts[key].name);
  await page.fill('#password', accounts[key].newPassword);
  await page.click('#_submit');
  await delay(2500);
  if ((await page.url()).includes('/login')) {
    await page.fill('#password', accounts[key].password);
    await page.click('#_submit');
    await delay(2500);
  }
  if ((await page.url()).includes('/login')) throw new Error(`教师 ${key} 登录失败`);
  return page;
}

async function gotoConstruction(page) {
  await page.goto(`${BASE}/teacher/construction`);
  await page.waitFor(
    `!!document.getElementById('cc-subtitle') && !document.getElementById('cc-subtitle').textContent.includes('正在读取')`,
    { timeout: 30000, message: '建设任务中心未完成加载' },
  );
  return { subtitle: await page.text('#cc-subtitle'), notice: await page.text('#cc-notice') };
}

async function fillForm(page, fields) {
  await page.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000, message: '表单未打开' });
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const selector = `#cc-fields [name="${name}"]`;
    const tag = await page.evaluate(`document.querySelector(${JSON.stringify(selector)})?.tagName`);
    if (!tag) throw new Error(`表单缺少字段 ${name}`);
    if (tag === 'SELECT') {
      const exists = await page.evaluate(`[...document.querySelector(${JSON.stringify(selector)}).options].some(o => o.value === ${JSON.stringify(String(value))})`);
      if (exists) await page.selectOption(selector, value);
      else {
        const fallback = await page.evaluate(`([...document.querySelector(${JSON.stringify(selector)}).options].find(o => o.value !== '') || {}).value ?? ''`);
        if (!fallback) throw new Error(`下拉框 ${name} 没有可选项`);
        await page.selectOption(selector, fallback);
      }
    } else await page.fill(selector, value);
  }
  const invalid = await page.evaluate(`(() => {
    const form = document.getElementById('cc-form-content');
    return [...form.querySelectorAll('[name]')].filter(n => !n.checkValidity()).map(n => n.name);
  })()`);
  if (invalid.length) throw new Error(`表单仍有未填或无效字段：${invalid.join('、')}`);
}

async function submitForm(page, label) {
  await page.click('#cc-form-submit');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(`({
      open: document.getElementById('cc-form').open,
      error: (document.getElementById('cc-form-error').textContent || '').trim(),
      busy: document.getElementById('cc-form-submit').disabled,
    })`);
    if (state.error) throw new Error(`${label} 失败：${state.error}`);
    if (!state.open) return;
    await delay(200);
  }
  throw new Error(`${label} 提交超时，表单仍未关闭`);
}

async function checkAll(page, name) {
  const count = await page.count(`#cc-fields [name="${name}"]`);
  for (let i = 0; i < count; i += 1) await page.check(`#cc-fields [name="${name}"]`, { nth: i });
  return count;
}

async function openTask(page, taskId, view = '任务大厅') {
  await gotoConstruction(page);
  await page.clickText('#cc-nav button[data-view]', view);
  await page.waitFor(`document.querySelectorAll('[data-task="${taskId}"]').length > 0`, { timeout: 20000, message: `列表未显示任务 ${taskId}` });
  await page.click(`[data-task="${taskId}"]`);
  await page.waitFor(`document.getElementById('cc-detail').open`, { timeout: 20000, message: '任务详情未打开' });
  return await page.text('#cc-detail');
}

async function taskStatus(page, taskId) {
  const detail = await page.evaluate(`(async () => {
    const r = await fetch('/pwncollege_api/v1/construction/tasks/${taskId}', { credentials: 'same-origin' });
    const j = await r.json();
    return j?.data?.task || null;
  })()`);
  return detail;
}

async function api(page, method, path, body) {
  return await page.evaluate(`(async () => {
    const client = window.DojoLearning;
    try {
      const envelope = await client.json(${JSON.stringify(method)}, ${JSON.stringify(path)},
        ${body === undefined ? 'undefined' : JSON.stringify(body)});
      return { ok: true, data: envelope && envelope.data };
    } catch (error) {
      return { ok: false, message: String((error && error.message) || error) };
    }
  })()`);
}

async function createPractice(page, key, spec) {
  const ws = seed.workspaces[key];
  await page.goto(`${BASE}/teacher/courses/${ws.reference}/practices/new?module=${ws.moduleId}`);
  await page.waitFor(`!!document.getElementById('manual-create-form')`, { timeout: 30000, message: '手动创建实践题页面未加载' });
  await page.fill('#manual-name', spec.title);
  await page.fill('#manual-description', spec.description);
  await page.selectOption('#manual-category', spec.category);
  await page.selectOption('#manual-difficulty', spec.difficulty);
  await page.fill('#manual-objectives', spec.objectives);
  await page.fill('#manual-tags', spec.tags);
  await page.fill('#manual-expected-answer', spec.answer);
  await page.fill('#manual-teacher-solution', spec.solution);
  await page.click('#manual-form-actions button[name="submitMode"][value="draft"]');
  await page.waitFor(`!document.getElementById('manual-result').hidden`, { timeout: 60000, message: '实践草稿未保存' });
  const title = await page.text('#manual-result-title');
  const copy = await page.text('#manual-result-copy');
  const href = await page.evaluate(`document.querySelector('#manual-result-actions a')?.getAttribute('href') || null`);
  return { title, copy, href };
}

async function reviewStage(browser, page, key, taskId, { decision, note }) {
  const before = await taskStatus(page, taskId);
  say(`  [${key}] 当前状态 ${before.status}，提交 ${before.submissionId}`);
  await openTask(page, taskId, '我的审核');
  const submissionId = before.submissionId;
  await page.click('#cc-detail [data-review]');
  await page.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
  say(`  [${key}] 审核表单已打开`);

  const previewButton = `#cc-fields [data-preview="${submissionId}"]`;
  await page.click(previewButton);
  say(`  [${key}] 已点击「打开固定版本原生预览」，等待新标签页…`);
  const preview = await browser.waitForNewPage({ timeout: 25000 });
  await delay(3000);
  const previewUrl = await preview.url();
  const previewTitle = await preview.title().catch(() => null);
  const previewText = (await preview.text('body') || '').replace(/\s+/g, ' ').slice(0, 300);
  const previewErrors = preview.errors().slice(0, 3);
  say(`  [${key}] 原生预览：${previewUrl}｜标题「${previewTitle}」`);
  say(`  [${key}] 预览正文：${previewText.slice(0, 160)}`);
  await preview.screenshot(`${SHOTS}/06-preview-${key}.png`).catch(error => say(`  [${key}] 预览截图跳过：${error.message}`));
  await browser.closePage(preview);

  await fillForm(page, { decision, note });
  const checkCount = await checkAll(page, 'checks');
  await page.check('#cc-fields [name="previewed"]');
  await page.screenshot(`${SHOTS}/06-review-form-${key}.png`);
  say(`  [${key}] 表单已填妥（核验项 ${checkCount} 条），提交结论…`);
  await submitForm(page, `${key} 审核结论`);
  const after = await taskStatus(page, taskId);
  return { submissionId, previewUrl, previewText, previewErrors, checkCount, status: after.status, before: before.status };
}

async function main() {
  const stage = process.argv[2] || 'all';
  const browser = await Browser.launch({ port: PORT, profileDir: `${DIR}/chrome-e2e-${process.argv[2] || 'all'}-${process.pid}` });
  await browser.watchTargets();
  const pages = {};
  const out = { stages: [] };
  const mark = (name, ok, detail) => { out.stages.push({ name, ok, detail }); say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

  try {
    const practiceTask = seed.tasks.practice.id;
    const authorKey = 'author';

    if (['all', 'claim'].includes(stage)) {
      say('\n=== 阶段 1：领取任务（任务大厅 → 任务详情 → 领取）===');
      pages.author = await openSession(browser, authorKey);
      await openTask(pages.author, practiceTask);
      const beforeText = await pages.author.text('#cc-detail');
      const claimable = await pages.author.exists('#cc-detail [data-task-action="claim"]');
      await pages.author.screenshot(`${SHOTS}/02-task-open.png`);
      await pages.author.click('#cc-detail [data-task-action="claim"]');
      await delay(3000);
      const after = await taskStatus(pages.author, practiceTask);
      record('claim', { before: beforeText.slice(0, 200), claimable, status: after.status, ownerId: after.ownerId });
      mark('领取任务', claimable && after.status === 'working' && after.ownerId === seed.members[authorKey].userId,
        `状态 ${after.status}，主责人 ${after.ownerId}`);
      await pages.author.screenshot(`${SHOTS}/02-task-claimed.png`);
    }

    if (['all', 'content'].includes(stage)) {
      say('\n=== 阶段 2：生成内容（AI 共创入口 + 教师手动创作实践题）===');
      pages.author ??= await openSession(browser, authorKey);
      const createContext = await pages.author.evaluate(`(async () => {
        const r = await fetch('/pwncollege_api/v1/construction/tasks/${practiceTask}/create-context', { credentials: 'same-origin' });
        const j = await r.json();
        return j?.data || j;
      })()`);
      say(`  AI 共创入口：${createContext.href?.slice(0, 120)}…`);
      record('createContext', { href: createContext.href, workspaceId: createContext.workspaceId, prompt: createContext.prompt?.slice(0, 400) });

      const draft = await createPractice(pages.author, authorKey, {
        title: '三次握手抓包观察',
        description: '在给定的容器环境中使用 tcpdump 捕获本机 8080 端口的一次完整 TCP 三次握手，把三个报文的序号与标志位整理成表，并说明每个报文的作用。完成后把整理结果写入 /home/hacker/handshake.txt 并提交。环境已预装 tcpdump 与 python3；服务可用 python3 -m http.server 8080 启动。要求：必须是真实抓取的报文，SYN、SYN-ACK、ACK 三个报文的 Seq/Ack 关系要与讲义一致；如果三次握手没有完整出现，需要说明原因并重新抓取。',
        category: 'GENERAL',
        difficulty: '2',
        objectives: '能使用抓包工具捕获一次完整的三次握手\n能指出 SYN、SYN-ACK、ACK 三个报文的作用与关键字段\n能解释序号与确认号在一次握手内的变化',
        tags: 'TCP, 三次握手, 抓包, 入门',
        answer: 'FLAG{three_way_handshake_observed}',
        solution: '1) python3 -m http.server 8080 启动服务；2) sudo tcpdump -i lo -n -c 3 tcp port 8080 -w /tmp/hs.pcap；3) curl -s http://127.0.0.1:8080/ >/dev/null；4) 用 tcpdump -r /tmp/hs.pcap 观察三个报文：客户端 SYN(Seq=x)，服务端 SYN-ACK(Seq=y,Ack=x+1)，客户端 ACK(Seq=x+1,Ack=y+1)；5) 把三行结果写入 /home/hacker/handshake.txt。',
      });
      await pages.author.screenshot(`${SHOTS}/03-practice-draft.png`);
      say(`  实践草稿：${draft.title} — ${draft.copy}`);
      record('practiceDraft', draft);
      mark('生成内容（实践题草稿）', /已保存|成功/.test(draft.title || ''), `${draft.title}`);

      const sources = await pages.author.evaluate(`(async () => {
        const r = await fetch('/pwncollege_api/v1/material-library/sources?kind=practice&limit=100&courseId=${seed.workspaces[authorKey].dojoId}', { credentials: 'same-origin' });
        const j = await r.json();
        return (j?.data?.sources || []).map(s => ({ id: s.id, title: s.title, type: s.type }));
      })()`);
      say(`  本人创作空间可提交项目：${sources.length} 个`);
      record('sources', sources);
      mark('草稿进入可提交项目列表', sources.length > 0, `${sources.length} 个项目`);
    }

    if (['all', 'submit'].includes(stage)) {
      say('\n=== 阶段 3：提交固定版本（含自测证据与类型检查）===');
      pages.author ??= await openSession(browser, authorKey);
      await openTask(pages.author, practiceTask);
      await pages.author.click('#cc-detail [data-submit]');
      await pages.author.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
      const optionCount = await pages.author.count('#cc-fields [name="source"] option');
      await fillForm(pages.author, {
        source: '0',
        sources: 'SRC-01《计算机网络：自顶向下方法（第8版）》第 1 章 P12–P48 分层图与协议栈表；SRC-02 Wireshark 官方用户指南第 3 章抓包步骤。题目中的三次握手字段含义直接取自 SRC-01 第 3 章，抓包命令取自 SRC-02 第 3 章。未使用课程外资料。',
        tests: '环境：Ubuntu 22.04 容器，tcpdump 4.99.1，python3 3.10。步骤：1) python3 -m http.server 8080；2) sudo tcpdump -i lo -n -c 3 tcp port 8080 -w /tmp/hs.pcap；3) curl -s http://127.0.0.1:8080/。实际结果：抓到 3 个报文，Flags 依次为 [S]、[S.]、[.]，Seq/Ack 满足 Ack=x+1、Ack=y+1 的关系，写入 /home/hacker/handshake.txt 后检查器判定通过。典型错误解（只写两行、或把 SYN-ACK 的 Ack 写成 y）被检查器判为失败。边界：重复运行会重新抓包，重置脚本会清空 /home/hacker/handshake.txt。',
        answers: '参考答案位置：教师解法字段（仅教师可见）。评分点：三个报文各 10 分，共 30 分；Seq/Ack 关系正确 20 分；说明每个报文作用 30 分；真实抓包证据（含 pcap 路径）20 分。边界与典型错误：缺少 ACK 报文最多 20 分；把 SYN-ACK 方向写反最多 10 分。学生视图仅显示题面与提交入口，不含教师解法与期望答案。',
        environment: '运行环境：课程 Linux 容器（runtimeEnvironment=labs）。依赖：tcpdump 4.99.1、python3 3.10、curl 7.81。重置方法：重置工作区后 /home/hacker/handshake.txt 被清除，服务需重新启动。',
        changes: '首次提交。包含完整题面、起始环境说明、教师解法、期望答案与评分规则；已按实践题五项检查逐条实测。',
      });
      const checks = await checkAll(pages.author, 'checks');
      await pages.author.screenshot(`${SHOTS}/04-submit-form.png`);
      await submitForm(pages.author, '提交固定版本');
      const after = await taskStatus(pages.author, practiceTask);
      record('submit', { optionCount, checks, status: after.status, submissionId: after.submissionId });
      mark('提交固定版本', after.status === 'peer_review' && Boolean(after.submissionId),
        `状态 ${after.status}，提交号 ${after.submissionId}，自测项 ${checks} 条`);
      await pages.author.screenshot(`${SHOTS}/04-submitted.png`);
    }

    if (['all', 'review-peer'].includes(stage)) {
      say('\n=== 阶段 4：独立复核（打开固定版本原生预览 + 记录结论）===');
      pages.peer = await openSession(browser, 'peer');
      const review = await reviewStage(browser, pages.peer, 'peer', practiceTask, {
        decision: 'pass',
        note: '实际核验过程：打开固定版本预览，题目结构完整（题面、环境、起始文件、期望答案、教师解法齐全）。在干净容器中按教师解法执行 tcpdump 抓包，三个报文 Flags 依次为 [S]、[S.]、[.]，Ack 关系与题面一致，检查器判定通过；故意提交只有两行的结果被判失败。重置后 /home/hacker/handshake.txt 被清空。学生视图不含期望答案与教师解法，无答案泄露。结论依据：五项类型自测全部通过，题面与 SRC-01/SRC-02 引用位置一致。',
      });
      record('reviewPeer', review);
      mark('独立复核通过', review.status === 'final_review', `状态 ${review.before} → ${review.status}，预览 ${review.previewUrl}`);
    }

    if (['all', 'review-final'].includes(stage)) {
      say('\n=== 阶段 5：教师终审 ===');
      pages.final = await openSession(browser, 'final');
      const review = await reviewStage(browser, pages.final, 'final', practiceTask, {
        decision: 'pass',
        note: '终审核验：打开固定版本原生预览，逐项复核题面与评分规则；与课程 CH01 目标 OBJ-02（能用抓包工具观察并解释一次完整的三次握手）逐字对齐。在干净环境重跑教师解法成功，典型错误解失败，边界与重置说明可复现。引用位置 SRC-01 第 3 章、SRC-02 第 3 章准确，与课程规划登记一致；术语与课件保持一致。同意入库。',
      });
      record('reviewFinal', review);
      mark('终审通过', review.status === 'release_pending', `状态 ${review.before} → ${review.status}`);
    }

    if (['all', 'publish'].includes(stage)) {
      say('\n=== 阶段 6：验收入库 ===');
      pages.final ??= await openSession(browser, 'final');
      await openTask(pages.final, practiceTask);
      const publishable = await pages.final.exists('#cc-detail [data-publish]');
      await pages.final.click('#cc-detail [data-publish]');
      await delay(4000);
      const notice = await pages.final.text('#cc-notice');
      const after = await taskStatus(pages.final, practiceTask);
      record('publish', { publishable, notice, status: after.status, materialId: after.materialId });
      mark('验收入库', after.status === 'released' && Boolean(after.materialId), `状态 ${after.status}，素材 ${after.materialId}，提示「${notice}」`);
      await pages.final.screenshot(`${SHOTS}/07-released.png`);
    }

    if (['all', 'verify'].includes(stage)) {
      say('\n=== 阶段 7：素材库端到端验证（检索 → 预览 → 加入自己的课程）===');
      pages.peer ??= await openSession(browser, 'peer');
      await pages.peer.goto(`${BASE}/teacher/library`);
      await pages.peer.waitFor(`document.body.innerText.includes('素材库')`, { timeout: 30000, message: '素材库未加载' });
      await delay(2500);
      const libraryResult = await api(pages.peer, 'GET', '/material-library/items?limit=50');
      run.libraryId ??= null;
      const library = (libraryResult.data?.items || [])
        .map(i => ({ id: i.id, title: i.title, version: i.version, visibility: i.visibility, type: i.type, verified: i.verified, taskCode: i.library?.code }))
        .filter(i => i.title.includes('三次握手'));
      say(`  素材库检索到已验收素材：${JSON.stringify(library)}`);
      record('library', library);
      mark('入库素材可被其他教师检索', library.length > 0 && library[0].visibility === 'teachers', JSON.stringify(library[0] || {}));
      const libraryId = library[0]?.id;
      run.libraryId = libraryId; save();

      const previewResult = await api(pages.peer, 'POST', `/construction/materials/${library[0]?.id}/preview`, {});
      record('materialPreview', previewResult);
      mark('已入库素材可原生预览', previewResult.ok === true,
        previewResult.data?.href || JSON.stringify(previewResult).slice(0, 200));

      if (previewResult.ok) {
        const previewPage = await browser.newPage();
        try {
          await previewPage.goto(`${BASE}${previewResult.data.href}`);
          await delay(3500);
          const title = await previewPage.title();
          const text = (await previewPage.text('body') || '').replace(/\s+/g, ' ').slice(0, 400);
          record('materialPreviewPage', { url: await previewPage.url(), title, text });
          mark('已入库素材的验收版本可在浏览器打开', text.includes('三次握手') || text.includes('题目'),
            `${title}｜${text.slice(0, 140)}`);
          await previewPage.screenshot(`${SHOTS}/09-material-preview.png`).catch(() => {});
        } finally {
          await browser.closePage(previewPage);
        }
      }
      await pages.peer.screenshot(`${SHOTS}/08-library.png`);
    }

    if (['all', 'plan'].includes(stage)) {
      say('\n=== 阶段 12：统筹人员按真实资料校准课程规划（资料登记与实际文件一致）===');
      pages.lead ??= await openSession(browser, 'lead');
      await gotoConstruction(pages.lead);
      await pages.lead.clickText('#cc-nav button[data-view]', '课程规划');
      await pages.lead.waitFor(`document.querySelectorAll('[data-plan]').length > 0`, { timeout: 20000, message: '课程规划未列出可编辑课程' });
      await pages.lead.click('[data-plan]');
      await pages.lead.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
      const sourcesText = [
        'SRC-01 | 计算机网络基础 · 第 1 章讲义（课程组编写） | 课程资料区 / networking-layering-handout.md 第 1–5 节 | 2026 春季学期讲义 v1.0 | 可摘录概念与表格用于课件，须注明出处，不得整章复制',
        'SRC-02 | Wireshark 官方用户指南 | https://www.wireshark.org/docs/wsug_html_chunked/ 第 2–3 章 | 4.2 | 可用于演示步骤与截图',
      ].join('\n');
      await fillForm(pages.lead, { sources: sourcesText });
      await pages.lead.screenshot(`${SHOTS}/13-plan-form.png`).catch(() => {});
      await submitForm(pages.lead, '课程规划');
      const context = await api(pages.lead, 'GET', `/construction/context`);
      const course = (context.data?.courses || []).find(c => c.code === seed.courseCode);
      const registered = (course?.plan?.sources || []).map(x => `${x.id}:${x.location}`);
      record('plan', { registered });
      mark('课程规划已按真实资料登记', registered.some(x => x.includes('networking-layering-handout.md')),
        registered.join('｜'));
      say(`  已登记资料：${registered.join(' ｜ ')}`);
    }

    if (['all', 'material'].includes(stage)) {
      say('\n=== 阶段 11：把真实课程资料上传进创作空间（AI 必须先能读到资料）===');
      pages.author ??= await openSession(browser, authorKey);
      await pages.author.goto(`${BASE}/teacher`);
      await pages.author.waitFor(`!!window.DojoLearning`, { timeout: 30000 });
      await delay(2000);
      const handout = HANDOUT;
      const upload = await pages.author.evaluate(`(async () => {
        const blob = new Blob([${JSON.stringify(handout)}], { type: 'text/markdown' });
        const form = new FormData();
        form.set('nonce', window.init.csrfNonce);
        form.set('dojoId', '${seed.workspaces.author.dojoId}');
        form.set('file', new File([blob], 'networking-layering-handout.md', { type: 'text/markdown' }));
        const response = await fetch('/pwncollege_api/v1/teaching/materials', {
          method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, body: form,
        });
        const text = await response.text();
        let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
        return { status: response.status, body: parsed };
      })()`);
      const materialId = upload.body?.data?.material?.id || upload.body?.material?.id;
      const listing = await api(pages.author, 'GET', `/teaching/materials?dojoId=${seed.workspaces.author.dojoId}`);
      const titles = (listing.data?.materials || []).map(m => m.title || m.filename);
      record('material', { status: upload.status, materialId, titles });
      mark('真实课程资料已进入创作空间', upload.status < 400 && titles.length > 0, `资料 ${titles.join('、')}`);
      say(`  资料档案：${JSON.stringify(titles)}`);
    }

    if (['all', 'ai'].includes(stage)) {
      say('\n=== 阶段 9：AI 共创生成课件（/teacher 深度链接 → 方案选择 → 生成 → 打开作品）===');
      pages.author ??= await openSession(browser, 'author');
      const slidesTask = seed.tasks.slides.id;
      const ctx = await api(pages.author, 'GET', `/construction/tasks/${slidesTask}/create-context`);
      const href = ctx.data?.href;
      if (!href) throw new Error(`未取得创作入口：${JSON.stringify(ctx).slice(0, 200)}`);
      say(`  深度链接长度 ${href.length} 字符（修复前会把整份任务说明塞进查询串）`);
      await pages.author.goto(`${BASE}${href}`);
      await pages.author.waitFor(`document.querySelector('#teacher-agent')?.dataset.ready === 'true'`, { timeout: 60000, message: 'AI 共创页面未就绪' });
      await delay(2500);
      const prefill = await pages.author.evaluate(`({
        promptLength: (document.getElementById('teaching-input')?.value || '').length,
        artifactType: document.getElementById('teaching-artifact-type')?.value,
        dojo: document.getElementById('teaching-dojo')?.value,
      })`);
      say(`  任务说明已带入 ${prefill.promptLength} 字符，产物类型 ${prefill.artifactType}，创作空间 ${prefill.dojo}`);
      mark('任务入口可打开且说明自动带入', prefill.promptLength > 200 && prefill.artifactType === 'slide-deck',
        `说明 ${prefill.promptLength} 字，类型 ${prefill.artifactType}`);
      await pages.author.screenshot(`${SHOTS}/11-ai-prefilled.png`).catch(() => {});

      await pages.author.click('#teaching-send');
      say('  已发送生成请求，等待模型与生成流水线…');
      const deadline = Date.now() + Number(process.env.AI_TIMEOUT_MS || 25 * 60 * 1000);
      let artifactId = null;
      let lastState = '';
      while (Date.now() < deadline) {
        await delay(5000);
        const state = await pages.author.evaluate(`(() => {
          const picker = document.querySelector('[data-generation-option-picker-message]');
          const pick = picker ? picker.querySelector('[data-generation-option-id]:not([disabled])') : null;
          const candidate = document.querySelector('[data-candidate-set]');
          const materialize = document.querySelector('[data-materialize-candidate]');
          const artifact = document.querySelector('#teaching-artifact[data-artifact-id]');
          const notice = (document.getElementById('teaching-notice')?.innerText || '').trim().slice(0, 160);
          const drawer = (document.getElementById('teaching-job-list')?.innerText || '').split(String.fromCharCode(10)).join(' ').slice(0, 200);
          return {
            url: location.href,
            picker: picker ? (pick?.dataset.generationOptionId || 'waiting') : null,
            candidate: candidate?.dataset.candidateSet || null,
            materialize: materialize?.dataset.materializeCandidate || null,
            artifact: artifact?.dataset.artifactId || null,
            notice, drawer,
          };
        })()`);
        const snapshot = JSON.stringify({ ...state, drawer: state.drawer.replace(/已用时[^0-9]*[0-9]+\s*[^0-9 ]*/, '') });
        if (snapshot !== lastState) { say(`  · ${snapshot}`); lastState = snapshot; }
        if (state.artifact) { artifactId = state.artifact; break; }
        if (state.picker && state.picker !== 'waiting') {
          await pages.author.click(`[data-generation-option-message][data-generation-option-id="${state.picker}"]`).catch(error => say(`  选择方案跳过：${error.message}`));
          continue;
        }
        if (state.materialize) {
          await pages.author.click(`[data-materialize-candidate="${state.materialize}"]`).catch(error => say(`  生成并打开跳过：${error.message}`));
          continue;
        }
        if (state.candidate) {
          await pages.author.click(`[data-candidate-set="${state.candidate}"]`).catch(error => say(`  打开候选集跳过：${error.message}`));
          continue;
        }
        if (/失败|未通过|错误/.test(state.notice + state.drawer)) {
          say(`  生成过程报告：${state.notice || state.drawer}`);
        }
      }
      if (!artifactId) throw new Error('AI 生成未在限定时间内产出课件作品');
      await pages.author.waitFor(`document.querySelector('#teaching-artifact[data-artifact-id]')`, { timeout: 30000 });
      const artifactTitle = await pages.author.text('h1').catch(() => '');
      record('ai', { href, prefill, artifactId, title: artifactTitle });
      mark('AI 共创产出课件作品', Boolean(artifactId), `作品 ${artifactId}｜${(artifactTitle || '').trim().slice(0, 60)}`);
      say(`  作品地址：${await pages.author.url()}`);
      await pages.author.screenshot(`${SHOTS}/12-ai-artifact.png`).catch(() => {});
    }

    if (['all', 'guards'].includes(stage)) {
      say('\n=== 阶段 10：流程与独立性约束（负向验证）===');
      const practiceTask = seed.tasks.practice.id;
      pages.author ??= await openSession(browser, authorKey);
      pages.peer ??= await openSession(browser, 'peer');
      pages.lead ??= await openSession(browser, 'lead');

      const current = await taskStatus(pages.author, practiceTask);
      const checksFor = kind => CHECKS[kind];

      const selfReview = await api(pages.author, 'POST', `/construction/tasks/${practiceTask}/review`, {
        revision: current.revision, submissionId: current.submissionId, decision: 'pass',
        note: '作者自审，应被拒绝。', checks: checksFor('practice'), previewed: true,
      });
      mark('作者不能审核自己的提交', selfReview.ok === false,
        `被拒绝：${(selfReview.message || '').slice(0, 90)}`);

      const badChecks = await api(pages.peer, 'POST', `/construction/tasks/${practiceTask}/submit`, {
        revision: current.revision, requestKey: `guard-${Date.now()}`, source: { kind: 'practice', id: 'not-owned' },
        evidence: { sources: 'x', tests: 'x', answers: 'x', environment: 'x', changes: 'x', checks: ['不完整的检查'] },
      });
      mark('提交必须来自本人创作空间', badChecks.ok === false,
        `被拒绝：${(badChecks.message || '').slice(0, 90)}`);

      const prematurePublish = await api(pages.peer, 'POST', `/construction/tasks/${practiceTask}/publish`, { revision: current.revision });
      mark('未完成终审不能入库', current.status !== 'release_pending' || prematurePublish.ok === false,
        `当前状态 ${current.status}｜${(prematurePublish.message || '').slice(0, 80)}`);

      const foreignClaim = await api(pages.lead, 'POST', `/construction/tasks/${practiceTask}/action`, { revision: current.revision, action: 'claim' });
      mark('已领取任务不能被他人重复领取', foreignClaim.ok === false,
        `被拒绝：${(foreignClaim.message || '').slice(0, 90)}`);

      const foreignSubmit = await api(pages.peer, 'POST', `/construction/tasks/${practiceTask}/action`, { revision: current.revision, action: 'new_version' });
      mark('非主责人不能开始新版本', foreignSubmit.ok === false,
        `被拒绝：${(foreignSubmit.message || '').slice(0, 90)}`);

      const outsourced = await api(pages.peer, 'GET', `/construction/tasks/${seed.tasks.slides.id}/create-context`);
      mark('非主责人不能取得他人任务的创作入口', outsourced.ok === false,
        `被拒绝：${(outsourced.message || '').slice(0, 90)}`);
    }

    if (['all', 'adopt'].includes(stage)) {
      say('\n=== 阶段 8：教师从素材库采用已验收素材（创建独立课程草稿）===');
      pages.peer ??= await openSession(browser, 'peer');
      await pages.peer.goto(`${BASE}/teacher/library`);
      await pages.peer.waitFor(`document.querySelectorAll('[data-library-use]').length > 0`, { timeout: 30000, message: '素材库卡片未加载' });
      await delay(1500);
      const itemId = run.libraryId;
      if (!itemId) throw new Error('未记录已入库素材 id，请先运行 verify 阶段');
      await pages.peer.check(`[data-library-select="${itemId}"]`);
      await pages.peer.click(`[data-library-use="${itemId}"]`);
      await pages.peer.waitFor(`document.getElementById('library-import-dialog').open`, { timeout: 15000, message: '加入课程对话框未打开' });
      await pages.peer.waitFor(`document.getElementById('library-target-course').options.length > 1`, { timeout: 15000 });
      const courseOptions = await pages.peer.evaluate(`[...document.getElementById('library-target-course').options].map(o => ({ value: o.value, text: o.textContent.trim() }))`);
      say(`  可选目标课程：${JSON.stringify(courseOptions)}`);
      const targetCourse = (courseOptions.find(o => o.value === String(seed.workspaces.peer.dojoId)) || courseOptions.find(o => o.value !== ''))?.value;
      await pages.peer.selectOption('#library-target-course', targetCourse);
      await delay(800);
      await pages.peer.waitFor(`document.getElementById('library-target-module').options.length > 0`, { timeout: 15000 });
      await pages.peer.screenshot(`${SHOTS}/10-import-dialog.png`).catch(() => {});
      await pages.peer.click('#library-import-form footer button[type="submit"]');
      const importDeadline = Date.now() + 60000;
      let importError = '';
      while (Date.now() < importDeadline) {
        const state = await pages.peer.evaluate(`({ open: document.getElementById('library-import-dialog').open, error: (document.getElementById('library-import-error').textContent || '').trim() })`);
        if (state.error) { importError = state.error; break; }
        if (!state.open) break;
        await delay(300);
      }
      if (importError) throw new Error(`加入课程失败：${importError}`);
      const imported = await api(pages.peer, 'GET', '/material-library/context');
      const drafts = await api(pages.peer, 'GET', `/material-library/sources?kind=practice&limit=100&courseId=${seed.workspaces.peer.dojoId}`);
      record('adopt', { targetCourse, drafts: drafts.data?.sources?.length });
      const frozenListed = courseOptions.some(o => o.text.includes('审核 ·'));
      mark('固定审核副本不再出现在可选课程中', !frozenListed, `可选项 ${courseOptions.length} 个`);
      mark('已验收素材可加入教师课程', (drafts.data?.sources || []).some(x => x.title.includes('三次握手')),
        `目标课程 ${targetCourse}，该课程可用实践项目 ${drafts.data?.sources?.length ?? 0} 个`);
      say(`  加入课程后该课程项目：${JSON.stringify((drafts.data?.sources || []).map(x => x.title))}`);
    }

    if (['all', 'rework'].includes(stage)) {
      say('\n=== 阶段 13：退回返修闭环（新版本 → 复核退回 → 修订重提 → 通过 → 入库 v2）===');
      const practiceTask = seed.tasks.practice.id;
      pages.author ??= await openSession(browser, authorKey);
      pages.peer ??= await openSession(browser, 'peer');
      pages.final ??= await openSession(browser, 'final');

      const start = await taskStatus(pages.author, practiceTask);
      if (start.status === 'released') {
        await openTask(pages.author, practiceTask, '我的创作');
        await pages.author.click('#cc-detail [data-task-action="new_version"]');
        await delay(3500);
      }
      const working = await taskStatus(pages.author, practiceTask);
      say(`  返修起点状态 ${working.status}`);

      await openTask(pages.author, practiceTask, '我的创作');
      await pages.author.click('#cc-detail [data-submit]');
      await pages.author.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
      await fillForm(pages.author, {
        source: '0',
        sources: 'SRC-01 课程组讲义第 1–5 节；SRC-02 Wireshark 指南第 3 章。',
        tests: '第二轮：在干净容器重跑教师解法，三个报文 Flags 依次 [S]、[S.]、[.]，检查器通过；重置后 handshake.txt 清空。',
        answers: '参考解与评分点同教师解法字段；本轮补充了缺少 ACK 报文的判分说明。',
        environment: 'labs 容器，tcpdump 4.99.1，python3 3.10。',
        changes: '第二版：补充了学生视图的提交格式说明与边界判分规则。',
      });
      const v2checks = await checkAll(pages.author, 'checks');
      await submitForm(pages.author, '第二次提交');
      const afterSubmit = await taskStatus(pages.author, practiceTask);
      const numberV2 = (await (async () => {
        const detail = await api(pages.author, 'GET', `/construction/tasks/${practiceTask}`);
        return (detail.data?.submissions || []).map(x => x.number).sort((a, b) => b - a)[0];
      })());
      mark('已入库任务可开始新版本并重新提交', afterSubmit.status === 'peer_review' && numberV2 === 2,
        `状态 ${afterSubmit.status}，第 ${numberV2} 次提交，核验项 ${v2checks} 条`);

      const returned = await reviewStage(browser, pages.peer, 'peer', practiceTask, {
        decision: 'return',
        note: '退回修改：第 2 版题面未写清 handshake.txt 的逐行格式（期望三行、每行“报文名 空格 Seq 空格 Ack”），学生按自由格式提交会被判失败。请在第 3 版题面中补充格式示例，并补一条格式不符的典型错误解。其余检查项通过。',
      });
      mark('复核可退回并进入待返修', returned.status === 'changes_requested', `状态 ${returned.before} → ${returned.status}`);

      const revisit = await taskStatus(pages.author, practiceTask);
      mark('退回后原提交与意见保留', (revisit.status === 'changes_requested' && revisit.submissionId === returned.submissionId),
        `当前提交仍为 ${revisit.submissionId}`);

      await openTask(pages.author, practiceTask, '我的创作');
      await pages.author.click('#cc-detail [data-submit]');
      await pages.author.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
      await fillForm(pages.author, {
        source: '0',
        sources: 'SRC-01 课程组讲义第 1–5 节；SRC-02 Wireshark 指南第 3 章。',
        tests: '第三轮：按新增格式示例提交三行结果，检查器通过；自由格式提交被判定失败，与预期一致。',
        answers: '评分点补充格式分 10 分；格式不符的典型错误解已写入教师解法字段。',
        environment: 'labs 容器，tcpdump 4.99.1，python3 3.10。',
        changes: '第 3 版：逐条回应复核意见——补充 handshake.txt 行格式示例；补充格式不符的典型错误解与判分。',
      });
      await checkAll(pages.author, 'checks');
      await submitForm(pages.author, '返修后提交');
      const afterRework = await taskStatus(pages.author, practiceTask);
      const numbers = await (async () => {
        const detail = await api(pages.author, 'GET', `/construction/tasks/${practiceTask}`);
        return (detail.data?.submissions || []).map(x => x.number).sort((a, b) => a - b);
      })();
      mark('返修后可提交新版本并保留历史', afterRework.status === 'peer_review' && numbers.join(',') === '1,2,3',
        `状态 ${afterRework.status}，历史提交 ${numbers.join('、')}`);

      const peerPass = await reviewStage(browser, pages.peer, 'peer', practiceTask, {
        decision: 'pass',
        note: '返修复核：第 3 版已补充 handshake.txt 逐行格式示例，并新增格式不符的典型错误解；实测格式正确提交通过、自由格式提交失败。上一轮意见已逐条落实，通过本轮复核。',
      });
      mark('返修后复核通过', peerPass.status === 'final_review', `状态 ${peerPass.before} → ${peerPass.status}`);

      const finalPass = await reviewStage(browser, pages.final, 'final', practiceTask, {
        decision: 'pass',
        note: '终审：第 3 版内容与 CH01 目标 OBJ-02 一致，格式说明清晰、判分可复现，引用位置准确。同意入库为 v2。',
      });
      mark('返修后终审通过', finalPass.status === 'release_pending', `状态 ${finalPass.before} → ${finalPass.status}`);

      await openTask(pages.final, practiceTask);
      await pages.final.click('#cc-detail [data-publish]');
      await delay(4000);
      const released = await taskStatus(pages.final, practiceTask);
      const dbRelease = await api(pages.final, 'GET', `/construction/tasks/${practiceTask}`);
      record('rework', { numbers, status: released.status, materialId: released.materialId });
      mark('返修版本验收入库为 v2', released.status === 'released', `状态 ${released.status}，素材 ${released.materialId}`);
    }

    if (['all', 'slides'].includes(stage)) {
      say('\n=== 阶段 14：课件任务走完提交 → 复核 → 终审 → 入库（AI 生成作品）===');
      const slidesTask = seed.tasks.slides.id;
      pages.author ??= await openSession(browser, authorKey);
      pages.peer ??= await openSession(browser, 'peer');
      pages.final ??= await openSession(browser, 'final');

      const before = await taskStatus(pages.author, slidesTask);
      say(`  起始状态 ${before.status}，主责人 ${before.ownerId}`);
      await openTask(pages.author, slidesTask, '我的创作');
      await pages.author.click('#cc-detail [data-submit]');
      await pages.author.waitFor(`document.getElementById('cc-form').open`, { timeout: 15000 });
      const sourceOptions = await pages.author.evaluate(`[...document.querySelectorAll('#cc-fields [name="source"] option')].map(o => ({ value: o.value, text: o.textContent.trim() }))`);
      say(`  可选原项目：${JSON.stringify(sourceOptions)}`);
      await fillForm(pages.author, {
        source: '0',
        sources: 'SRC-01 计算机网络基础 · 第 1 章讲义（课程组编写）第 1–5 节（networking-layering-handout.md）；SRC-02 Wireshark 官方用户指南第 2–3 章。课件中的分层职责表、封装过程与两道练习均取自 SRC-01，未使用课程外资料。',
        tests: '逐页核对 6 页课件：每页标题与正文可读、无重叠；分层职责表与 SRC-01 第 1 章表格一致；两道练习的答案与解析与讲义第 4 节一致；引用位置已标注到章节。来源覆盖：OBJ-01 的课件要求已覆盖。',
        answers: '课件内每道练习页均含答案与解析；分层职责与协议归属以 SRC-01 第 1 章表格为准。教师视图含完整解析，学员视图仅含题干与提示。',
        environment: '课件为原生 slide-deck 作品，浏览器逐页预览即可核对；无需额外运行环境。',
        changes: '首次提交：AI 共创生成的 6 页课件，已在原作品基础上核对事实与答案。',
      });
      const slideChecks = await checkAll(pages.author, 'checks');
      await submitForm(pages.author, '课件提交');
      const submitted = await taskStatus(pages.author, slidesTask);
      mark('课件可提交为固定版本', submitted.status === 'peer_review', `状态 ${before.status} → ${submitted.status}，核验项 ${slideChecks} 条`);

      const peerReview = await reviewStage(browser, pages.peer, 'peer', slidesTask, {
        decision: 'pass',
        note: '独立复核：打开固定版本原生预览，逐页核对 6 页课件——标题与正文版式正常、无重叠；分层职责表与 SRC-01 第 1 章一致；TCP/IP 四层与协议示例（HTTP/DNS、TCP/UDP、IP/ICMP、Ethernet/Wi-Fi）归类正确；两道练习的答案与解析与讲义第 4 节一致；引用位置标注到章节。四项类型检查全部通过。',
      });
      mark('课件复核通过', peerReview.status === 'final_review', `状态 ${peerReview.before} → ${peerReview.status}`);

      const finalReview = await reviewStage(browser, pages.final, 'final', slidesTask, {
        decision: 'pass',
        note: '终审：课件与 CH01 目标 OBJ-01「能说出 TCP/IP 四层模型各层职责并各举两个典型协议」逐项对齐；术语、顺序与课程规划一致；事实与讲义相符；引用位置准确。同意入库。',
      });
      mark('课件终审通过', finalReview.status === 'release_pending', `状态 ${finalReview.before} → ${finalReview.status}`);

      await openTask(pages.final, slidesTask);
      await pages.final.click('#cc-detail [data-publish]');
      await delay(4000);
      const released = await taskStatus(pages.final, slidesTask);
      const notice = await pages.final.text('#cc-notice');
      record('slides', { sourceOptions, status: released.status, materialId: released.materialId });
      mark('课件验收入库', released.status === 'released' && Boolean(released.materialId),
        `状态 ${released.status}，素材 ${released.materialId}，提示「${notice}」`);
      await pages.final.screenshot(`${SHOTS}/14-slides-released.png`).catch(() => {});
    }

    say('\n=== 汇总 ===');
    for (const s of out.stages) say(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name} — ${s.detail}`);
    writeFileSync(`${DIR}/e2e-result.json`, JSON.stringify(out, null, 2));
    if (out.stages.some(s => !s.ok)) process.exitCode = 2;
  } catch (error) {
    console.error('\nFATAL:', error.message);
    for (const [key, page] of Object.entries(pages)) {
      console.error(`  ${key}:`, await page.url().catch(() => '?'));
      console.error(`  ${key} pageErrors:`, page.errors().slice(0, 3));
      console.error(`  ${key} consoleErrors:`, page.fatalConsole().slice(0, 4));
    }
    writeFileSync(`${DIR}/e2e-result.json`, JSON.stringify({ ...out, fatal: error.message, transcript }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

await main();
