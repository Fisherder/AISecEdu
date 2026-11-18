// Uses the fixed browser from services/agent-runtime; no external service or account.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');

const root = resolve(__dirname, '../../..');
const requireRuntime = createRequire(resolve(root, 'services/agent-runtime/package.json'));
const { chromium } = requireRuntime('@playwright/test');
const template = readFileSync(resolve(root, 'dojo_theme/templates/teacher_workbench.html'), 'utf8');
const assetPath = template.match(/path='(js\/dojo\/workbench-v3\/app-([a-f0-9]{12})\.js)', v='\2'/);
assert.ok(assetPath);
const asset = readFileSync(resolve(root, 'dojo_theme/static', assetPath[1]));
assert.equal(createHash('sha256').update(asset).digest('hex').slice(0, 12), assetPath[2]);
if (process.argv.includes('--match-rebuild')) {
  for (const name of ['app.js', 'app.dev.js', 'app.min.js']) {
    assert.ok(asset.equals(readFileSync(resolve(root, 'dojo_theme/static', 'js/dojo/workbench-v3', name))),
      'The immutable template asset must equal the standard build output');
  }
}
const originThread = 'ordinary-teacher-thread';
const otherThread = 'other-teacher-thread';
const sessionId = 'session_' + 'a'.repeat(32);
const approval = { id: 'proposal:ordinary-teacher-thread:21:0', sha256: 'e'.repeat(64) };
const prepared = { sessionId, artifactId: 'published-plant-deck', artifactRevision: 4 };
const ordinary = { id: originThread, dojoId: -11, moduleIndex: 0, status: 'ACTIVE', title: '植物课堂准备' };
const other = { id: otherThread, dojoId: -12, moduleIndex: 1, status: 'ACTIVE', title: '其他独立会话' };
const deck = {
  id: 'synthetic-math-deck', type: 'slide-deck', title: '三角形的内角', status: 'READY',
  currentRevision: 2, capabilities: { edit: true }, revision: { content: { note: 'PRIVATE-CANVAS-SELECTION' } },
};
const fixture = { writes: [], decision: null, receipt: null, rejectPrepare: true, pauseDecision: null };
const message = () => ({
  id: 21, role: 'assistant', content: '请核对植物观察课件。',
  metadata: {
    pending: false,
    toolProposals: [{
      tool: 'classroom.prepare', requiresConfirmation: true,
      boundScope: { dojoId: -11, moduleIndex: 0 },
      arguments: { artifactId: prepared.artifactId, expectedRevision: 4, contentHash: 'a'.repeat(64) },
    }],
    toolProposalApprovalRequests: { 0: approval },
    toolProposalDecisions: fixture.decision ? { 0: fixture.decision } : {},
    toolExecutionResults: fixture.receipt ? { 0: fixture.receipt } : {},
  },
});

function json(response, data, status = 200) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}
const ok = (response, data) => json(response, { success: true, data });

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const prefix = '/pwncollege_api/v1/teaching';
  if (url.pathname === '/teacher') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><div id="cocreation-workbench" data-owner-id="synthetic" style="height:900px"></div><script defer src="/${assetPath[1]}?v=${assetPath[2]}"></script>`);
    return;
  }
  if (url.pathname === '/' + assetPath[1]) {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(asset);
    return;
  }
  if (!url.pathname.startsWith(prefix)) return json(response, {}, 404);
  const path = url.pathname.slice(prefix.length);
  if (path === '/context') return ok(response, { teacherDojos: [] });
  if (path === '/threads') return ok(response, { threads: [ordinary, other] });
  if (path === '/artifacts') return ok(response, { artifacts: [deck] });
  if (path === '/artifacts/' + deck.id) return ok(response, { artifact: deck });
  if (path === '/artifacts/' + deck.id + '/revise' && request.method === 'POST') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    fixture.writes.push({ path, body: JSON.parse(raw) });
    return ok(response, {});
  }
  if (path === '/jobs') return ok(response, { jobs: [] });
  if (/\/events$/.test(path)) return ok(response, { events: [], nextCursor: 0 });
  if (path === '/threads/' + originThread) return ok(response, { thread: { ...ordinary, messages: [message()] } });
  if (path === '/threads/' + otherThread) return ok(response, { thread: { ...other, messages: [] } });

  const base = `/threads/${originThread}/messages/21/tool-proposals/0`;
  if (request.method === 'POST' && [base + '/decision', base + '/prepare-classroom'].includes(path)) {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    fixture.writes.push({ path, body, key: request.headers['idempotency-key'] });
    if (path.endsWith('/decision')) {
      if (fixture.pauseDecision) {
        const pause = fixture.pauseDecision;
        pause.signalStarted();
        await pause.resume;
      }
      fixture.decision = { version: 1, requestId: approval.id, requestSha256: approval.sha256, decision: body.decision };
      return ok(response, { decision: fixture.decision });
    }
    if (fixture.rejectPrepare) return json(response, { success: false, error: '合成暂时故障' }, 502);
    fixture.receipt = { ...prepared, tool: 'classroom.prepare', status: 'SUCCEEDED' };
    return ok(response, { ...prepared, deduplicated: false });
  }
  fixture.writes.push({ unexpected: path, method: request.method });
  return json(response, { success: false }, 404);
});

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    const load = () => page.goto(origin + '/teacher?thread=' + originThread);
    const approve = page.getByRole('button', { name: '批准并准备课堂', exact: true });
    const continuation = page.getByRole('button', { name: '继续准备课堂', exact: true });
    const link = page.getByRole('link', { name: '查看已准备的课堂', exact: true });
    await load();
    await approve.waitFor();
    assert.deepEqual(fixture.writes, []);
    await approve.evaluate(button => { button.click(); button.click(); });
    await page.getByText('合成暂时故障', { exact: true }).waitFor();
    assert.equal(fixture.writes.length, 2);
    assert.ok(fixture.writes.every(row => row.key));
    assert.deepEqual(fixture.writes.map(row => [row.path.split('/').at(-1), row.body]), [
      ['decision', { decision:'APPROVED', confirmed:true, approvalRequest:approval }],
      ['prepare-classroom', { approvalRequest:approval }],
    ]);

    await page.reload();
    await continuation.waitFor();
    assert.equal(await approve.count(), 0);
    fixture.rejectPrepare = false;
    await continuation.click();
    await link.waitFor();
    assert.deepEqual(fixture.writes.map(row => row.path.split('/').at(-1)), ['decision','prepare-classroom','prepare-classroom']);
    assert.match(await link.getAttribute('href'), /^\/teacher\?view=dashboard&thread=ordinary-teacher-thread&classroom=/);
    assert.equal(new URL(await link.getAttribute('href'), origin).searchParams.get('classroom'), sessionId);
    await page.reload();
    await link.waitFor();
    assert.equal(fixture.writes.length, 3);

    fixture.decision = fixture.receipt = null;
    let resumeDecision;
    let signalStarted;
    const decisionStarted = new Promise(resolve => { signalStarted = resolve; });
    fixture.pauseDecision = { signalStarted, resume: new Promise(resolve => { resumeDecision = resolve; }) };
    await load();
    await approve.click();
    await decisionStarted;
    const switchThread = page.getByRole('button', { name: '其他独立会话', exact: true });
    await switchThread.click();
    await page.waitForURL(url => url.searchParams.get('thread') === otherThread);
    const ended = page.waitForResponse(response => response.url().endsWith('/decision'));
    resumeDecision();
    fixture.pauseDecision = null;
    await ended;
    await page.waitForFunction(() => !document.querySelector('#cocreation-workbench').shadowRoot.querySelector('.thread-link[disabled]'));
    assert.deepEqual(fixture.writes.map(row => row?.path?.split('/').at(-1)), ['decision','prepare-classroom','prepare-classroom','decision']);

    fixture.decision = null;
    await load();
    await page.getByRole('button', { name: '拒绝', exact: true }).click();
    await page.getByText('已拒绝课堂准备。', { exact: true }).waitFor();
    assert.equal(await link.count(), 0);
    assert.equal(await continuation.count(), 0);
    assert.equal(fixture.writes.length, 5);
    assert.equal(fixture.writes.at(-1).body.decision, 'REJECTED');
    await page.getByRole('tab', { name: '成品', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(deck.title) }).click();
    await page.getByRole('tab', { name: '源码', exact: true }).click();
    const source = page.getByRole('textbox', { name: '成品完整源码' });
    await source.evaluate(element => {
      element.focus();
      const start = element.value.indexOf('PRIVATE-CANVAS-SELECTION');
      element.setSelectionRange(start, start + 'PRIVATE-CANVAS-SELECTION'.length);
      element.dispatchEvent(new Event('select', { bubbles: true }));
    });
    const clearSelection = page.getByRole('button', { name: '取消源码选区' });
    await clearSelection.waitFor();
    const instruction = '请调整第2页的版式：把标题移到右上方';
    const editor = page.getByRole('textbox', { name: '成品局部修改要求' });
    const submit = page.getByRole('button', { name: '提交局部修改' });
    await editor.fill('请修改这段文字：调整标点');
    assert.equal(await submit.isEnabled(), true);
    await editor.fill(instruction);
    await page.getByText('请先取消源码选区，再提交按页修改。').waitFor();
    assert.equal(await submit.isDisabled(), true);
    assert.equal(fixture.writes.length, 5);
    await clearSelection.click();
    const posted = page.waitForResponse(response => response.url().endsWith('/' + deck.id + '/revise'));
    await submit.click();
    await posted;
    assert.deepEqual(fixture.writes.at(-1).body, { instruction, expectedRevision: 2 });
    assert.deepEqual(errors, []);
    console.log('Teacher workbench classroom preparation and slide revision checks passed', assetPath[2]);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
