const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');

const directory = resolve(__dirname, '../../dojo_theme/static/js/dojo');
const source = readFileSync(resolve(directory, 'teaching-agent.js'), 'utf8');
for (const asset of ['teaching-agent.dev.js', 'teaching-agent.min.js']) {
  assert.equal(readFileSync(resolve(directory, asset), 'utf8'), source);
}

function definition(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'));
  assert.notEqual(start, -1, name);
  const body = source.slice(start);
  const end = body.search(/^  }$/m);
  assert.notEqual(end, -1, name);
  return body.slice(0, end + 3);
}

const functions = [
  'threadActionCurrent', 'renderAgentActions', 'classroomPreparationKey',
  'isPinnedClassroomProposal', 'savedClassroomApproval', 'executePinnedClassroomPreparation',
  'canExecuteAutomatically', 'proposalKey', 'proposalDecision', 'proposalWasApplied',
  'persistProposalDecision', 'handleProposalApproval', 'executeProposalSequence',
  'handleAgentTool', 'loadSessions', 'classroomScopeSnapshot', 'classroomScopeCurrent',
  'renderOrdinaryClassrooms', 'rememberClassroomSelection', 'selectOrdinaryClassroom', 'actOnOrdinaryClassroom', 'syncThreadLocation',
].map(definition).join('\n');
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return {promise, resolve, reject};
};

function fixture() {
  const reference = {id: 'approval-fixture', sha256: 'a'.repeat(64)};
  const approval = {version: 1, decision: 'APPROVED', requestId: reference.id, requestSha256: reference.sha256};
  const otherTool = {tool: 'material.list'};
  const proposal = {tool: 'classroom.prepare', requiresConfirmation: true, boundScope: {dojoId: 17, moduleIndex: 2},
    arguments: {artifactId: 'published-fixture', expectedRevision: 4, contentHash: 'b'.repeat(64)}};
  const message = {id: 212, role: 'assistant', metadata: {pending: false,
    toolProposals: [otherTool, proposal], toolProposalApprovalRequests: {'1': reference}}};
  const thread = {id: 'thread-origin', status: 'ACTIVE', dojoId: 17, moduleIndex: 2, messages: [message]};
  const otherThread = {id: 'thread-other', status: 'ACTIVE', dojoId: 18, moduleIndex: 3, messages: []};
  const elements = {notice: {}, session: {}, sessionStart: {}, sessionEnd: {}, sessionOpen: {},
    ordinaryClassroom: {hidden: true}, ordinaryClassroomSelect: {replaceChildren(...options) { this.options = options; }},
    ordinaryClassroomStart: {}, ordinaryClassroomEnd: {}, ordinaryClassroomOpen: {},
    dojo: {value: '17'}, module: {value: '2'}};
  const state = {thread, threadLoadEpoch: 3, executingProposalKeys: new Set(), resolvingApprovalKeys: new Set(),
    appliedActionProposals: new Set(), proposalFailures: new Map(), ordinaryClassrooms: []};
  const calls = [];
  const notices = [];
  let continuations = 0;
  const responses = new Map();
  const prefix = '/teaching/threads/thread-origin/messages/212/tool-proposals/1';
  const api = {
    escapeHtml: String,
    showNotice(_, message) { notices.push(message); },
    async request(path) {
      calls.push({method: 'GET', path});
      const url = new URL(path, 'http://fixture.invalid');
      assert.equal(url.pathname, '/teaching/sessions');
      assert.equal(url.searchParams.get('view'), 'summary');
      assert.equal(url.searchParams.get('dojoId'), '17');
      assert.equal(url.searchParams.get('moduleIndex'), '2');
      return responses.get('GET ' + path)?.() ?? responses.get('GET ' + url.pathname)?.() ?? {sessions: [
        ordinarySession('earlier', 'LIVE', '此前的会话'),
        ordinarySession('pinned-ready', 'READY', '植物的结构'),
      ]};
    },
    async json(method, path, data) {
      calls.push({method, path, data: plain(data)});
      assert.ok(responses.has(path), `Unexpected request to ${path}`);
      return responses.get(path)();
    },
  };
  const ordinarySession = (id, status, title, dojoId = 17, moduleIndex = 2) => ({
    id, status, title, dojoId, moduleIndex, ordinaryPrepared: true,
  });
  const page = {href: 'http://fixture.invalid/teacher?view=dashboard&thread=thread-origin&classroom=pinned-ready'};
  const prompts = [];
  const approveStart = async text => { prompts.push(text); return true; };
  const approve = () => {
    const savedMessage = structuredClone(message);
    savedMessage.metadata.toolProposalDecisions = {'1': {...approval}};
    return {decision: approval, thread: {...thread, messages: [savedMessage]}};
  };
  responses.set(prefix + '/decision', approve);
  responses.set(prefix + '/prepare-classroom', () => ({sessionId: 'pinned-ready'}));
  responses.set('/teaching/sessions', () => ({sessionId: 'legacy-session'}));
  const context = vm.createContext({
    api, URL, URLSearchParams, document: {createElement: () => ({})}, window: {
      AISecEduUI: {confirm: approveStart},
      AISecEduCommands: {waitForAction: async action => action},
      location: page, history: {replaceState(_state, _, url) { page.href = url.href; }},
    },
    state, elements, unwrap: data => data, currentDojo: () => ({id: 17, name: '植物课'}),
    classroomPreparationsInFlight: new Set(), preparedClassroomProposals: new Set(),
    automaticReadTools: new Set(), automaticActionTools: new Set(['classroom.prepare']),
    courseTools: new Set(), toolLabels: {'classroom.prepare': '准备课堂'},
    directSuggestionText: String, preflightDestructiveProposal: async () => true,
    renderMessages() {}, updateAgentChrome() {}, focusComposerAfterApproval() {},
    continueAgentAfterTools() { continuations++; },
  });
  vm.runInContext(functions, context);
  const item = {key: 'proposal:212:1:classroom.prepare', message, proposal, index: 1};
  return {context, state, calls, notices, elements, message, proposal, responses, prefix, approve, approval, item,
    ordinarySession, page, prompts,
    get continuations() { return continuations; },
    navigate() { state.threadLoadEpoch++; state.thread = otherThread; },
  };
}

async function checkClassroomControlsInChrome() {
  const browserPath = process.env.CHROME_BIN;
  if (!process.argv.includes('--chromium') && !browserPath) return;
  const {createRequire} = require('node:module');
  const fromRuntime = createRequire(resolve(__dirname, '../../services/agent-runtime/package.json'));
  const {chromium} = fromRuntime('@playwright/test');
  const template = readFileSync(resolve(__dirname, '../../dojo_theme/templates/teacher_agent.html'), 'utf8');
  const markup = template.match(/<section id="teaching-ordinary-classrooms"[\s\S]+?<\/section>/)[0];
  const bindings = source.slice(source.indexOf('  elements.ordinaryClassroomSelect?.addEventListener'),
    source.indexOf('  elements.sessionStart.addEventListener'));
  const html = `<!doctype html><meta charset="utf-8">${markup}<script>
    const byId = id => document.getElementById('teaching-ordinary-' + id);
    const elements = {dojo:{value:'17'}, module:{value:'2'}, session:{}, sessionStart:{}, sessionEnd:{}, sessionOpen:{},
      ordinaryClassroom:byId('classrooms'), ordinaryClassroomSelect:byId('classroom-select'),
      ordinaryClassroomStart:byId('classroom-start'), ordinaryClassroomEnd:byId('classroom-end'),
      ordinaryClassroomOpen:byId('classroom-open')};
    const state = {thread:{id:'thread-origin',status:'ACTIVE',dojoId:17,moduleIndex:2}, ordinaryClassrooms:[]};
    const session = (id, title, status) => ({id,title,status,dojoId:17,moduleIndex:2,
      ordinaryPrepared:true});
    const ready = session('pinned-ready','植物的结构','READY');
    const calls = [];
    const failures = [];
    let confirmOperation;
    const api = {
      request: async path => {
        const url = new URL(path, location.origin);
        if (url.pathname !== '/teaching/sessions' || url.searchParams.get('view') !== 'summary' ||
            url.searchParams.get('dojoId') !== '17' || url.searchParams.get('moduleIndex') !== '2' ||
            url.searchParams.get('sessionId') !== 'pinned-ready') throw Error('Expected exact scoped summary');
        return {sessions:[session('earlier','此前的会话','LIVE'),ready]};
      },
      json: async (method,path,data) => {
        calls.push({path,data});
        if(path === '/teaching/sessions/pinned-ready/control')
          return {action:{id:'start-action',targetId:'pinned-ready',request:{command:'start'},
            approvalRequest:{id:'action:start-action',sha256:'b'.repeat(64)}}};
        if(path === '/teaching/actions/start-action/decision') {
          ready.status = 'LIVE';
          return {action:{status:'APPROVED'}};
        }
        if(path === '/teaching/runtime/launch') return {launchUrl:'/fixture-opened'};
        throw Error('Unrecognized fixture request');
      },
    };
    window.AISecEduUI = {confirm: text => new Promise(resolve => {confirmOperation = {text,resolve};})};
    window.AISecEduCommands = {waitForAction: async action => action};
    const unwrap = item => item;
    const showError = error => failures.push(String(error));
    ${['threadActionCurrent','classroomScopeSnapshot','classroomScopeCurrent','renderOrdinaryClassrooms',
      'rememberClassroomSelection','selectOrdinaryClassroom','actOnOrdinaryClassroom','loadSessions'].map(definition).join('\n')}
    ${bindings}
    loadSessions(classroomScopeSnapshot(), new URLSearchParams(location.search).get('classroom')).catch(showError);
  </script>`;
  const browser = await chromium.launch(browserPath ? {executablePath: browserPath} : {});
  try {
    const page = await browser.newPage({viewport: {width: 1200, height: 800}});
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.route('http://classroom-fixture.invalid/**', route => route.fulfill({
      contentType:'text/html; charset=utf-8',
      body: route.request().url().endsWith('/fixture-opened') ? 'Older classroom opened' : html,
    }));
    await page.goto('http://classroom-fixture.invalid/teacher?view=dashboard&thread=thread-origin&classroom=pinned-ready');
    await page.waitForFunction(() => !elements.ordinaryClassroom.hidden && elements.ordinaryClassroomSelect.value === "pinned-ready");
    await page.getByRole('button', {name:'开始课堂'}).click();
    await page.waitForFunction(() => confirmOperation?.text === "确认开始课堂「植物的结构」？");
    assert.equal(await page.evaluate(() => elements.ordinaryClassroomStart.disabled), true);
    await page.evaluate(() => confirmOperation.resolve(true));
    await page.waitForFunction(() => !elements.ordinaryClassroomOpen.disabled && elements.ordinaryClassroomSelect.value === "pinned-ready");
    assert.deepEqual(await page.evaluate(() => calls.map(entry => [entry.path, entry.data])), [
      ['/teaching/sessions/pinned-ready/control', {command:'start'}],
      ['/teaching/actions/start-action/decision', {decision:'APPROVED',confirmed:true,
        approvalRequest:{id:'action:start-action',sha256:'b'.repeat(64)}}],
    ]);
    await page.getByRole('combobox', {name:'普通教学课堂'}).selectOption('earlier');
    assert.match(await page.evaluate(() => elements.ordinaryClassroomSelect.selectedOptions[0].textContent), /此前的会话/);
    assert.deepEqual(await page.evaluate(() => failures), []);
    await page.getByRole('button', {name:'打开课堂'}).click();
    await page.waitForURL('**/fixture-opened');
    assert.deepEqual(pageErrors, []);
    console.log('Chromium teacher controls started the exact prepared classroom and returned to the older live classroom.');
  } finally {
    await browser.close();
  }
}

(async () => {
  {
    const f = fixture();
    const waiting = deferred();
    f.responses.set(f.prefix + '/prepare-classroom', () => waiting.promise);
    const action = f.context.handleProposalApproval(f.item, 'APPROVED');
    await new Promise(setImmediate);
    await f.context.executeProposalSequence(f.state.thread.messages[0], 1, false);
    assert.deepEqual(f.calls.map(call => [call.method, call.path]), [
      ['POST', f.prefix + '/decision'], ['POST', f.prefix + '/prepare-classroom'],
    ]);
    assert.deepEqual(f.calls[1].data, {approvalRequest: {id: f.approval.requestId, sha256: f.approval.requestSha256}});
    waiting.resolve({sessionId: 'pinned-ready'});
    await action;
    assert.equal(f.state.activeSession.id, 'pinned-ready');
    assert.match(f.elements.session.textContent, /待开始：植物的结构/);
    assert.match(f.notices.at(-1), /READY/);
    await f.context.executeProposalSequence(f.state.thread.messages[0], 1, false);
    assert.equal(f.calls.length, 3);
    assert.equal(f.continuations, 0);
  }
  {
    const f = fixture();
    const waiting = deferred();
    f.responses.set(f.prefix + '/decision', () => waiting.promise);
    const action = f.context.handleProposalApproval(f.item, 'APPROVED');
    await new Promise(setImmediate);
    f.navigate();
    waiting.resolve(f.approve());
    await action;
    assert.equal(f.state.thread.id, 'thread-other');
    assert.deepEqual(f.calls.map(call => call.path), [f.prefix + '/decision']);
    assert.deepEqual(f.notices, []);
  }
  {
    const f = fixture();
    const waiting = deferred();
    f.responses.set(f.prefix + '/prepare-classroom', () => waiting.promise);
    const action = f.context.handleProposalApproval(f.item, 'APPROVED');
    await new Promise(setImmediate);
    f.navigate();
    waiting.resolve({sessionId: 'pinned-ready'});
    await action;
    assert.equal(f.state.thread.id, 'thread-other');
    assert.equal(f.calls.length, 2);
    assert.deepEqual(f.notices, []);
  }
  {
    const f = fixture();
    f.state.thread = f.approve().thread;
    const saved = f.state.thread.messages[0];
    f.responses.set(f.prefix + '/prepare-classroom', () => { throw Error('Response lost'); });
    await assert.rejects(f.context.executeProposalSequence(saved, 1, false), /Response lost/);
    assert.match(f.context.renderAgentActions(saved), /准备课堂/);
    f.responses.set(f.prefix + '/prepare-classroom', () => ({sessionId: 'pinned-ready', deduplicated: true}));
    await f.context.executeProposalSequence(saved, 1, false);
    assert.equal(f.calls.length, 3);
    assert.deepEqual(f.calls[0], f.calls[1]);
    assert.match(f.notices.at(-1), /READY/);
  }
  {
    const f = fixture();
    f.state.thread = f.approve().thread;
    const saved = f.state.thread.messages[0];
    saved.metadata.toolProposalDecisions['1'].requestSha256 = 'c'.repeat(64);
    await assert.rejects(f.context.executeProposalSequence(saved, 1, false), /已保存的批准决定/);
    saved.metadata.toolProposalDecisions['1'].requestSha256 = f.approval.requestSha256;
    f.elements.module.value = '3';
    await assert.rejects(f.context.executeProposalSequence(saved, 1, false), /课程或章节已变化/);
    await assert.rejects(f.context.handleAgentTool(f.proposal), /原提案/);
    assert.equal(f.calls.length, 0);
  }
  {
    const f = fixture();
    f.state.thread = f.approve().thread;
    const waiting = deferred();
    f.responses.set('GET /teaching/sessions', () => waiting.promise);
    const action = f.context.executeProposalSequence(f.state.thread.messages[0], 1, false);
    await new Promise(setImmediate);
    f.elements.module.value = '3';
    waiting.resolve({sessions: [{id: 'pinned-ready', status: 'READY', dojoId: 17, moduleIndex: 2}]});
    await action;
    assert.equal(f.state.activeSession, undefined);
    assert.deepEqual(f.notices, []);
  }
  {
    const f = fixture();
    f.state.thread = f.approve().thread;
    const message = f.state.thread.messages[0];
    message.metadata.toolExecutionResults = {'1': {
      tool: 'classroom.prepare', status: 'SUCCEEDED', sessionId: 'durable-ready',
    }};
    assert.doesNotMatch(f.context.renderAgentActions(message), /准备课堂/);
    await f.context.executeProposalSequence(message, 1, false);
    assert.deepEqual(f.calls, []);
  }
  {
    const f = fixture();
    const malformed = {...f.proposal, requiresConfirmation: false};
    assert.equal(f.context.canExecuteAutomatically(malformed), false);
    await assert.rejects(f.context.handleAgentTool(malformed), /原提案/);
    await f.context.handleAgentTool({tool: 'classroom.prepare', requiresConfirmation: false,
      arguments: {artifactId: 'legacy-fixture', title: '旧版备课'}});
    assert.deepEqual(f.calls[0], {method: 'POST', path: '/teaching/sessions',
      data: {dojoId: 17, moduleIndex: 2, threadId: 'thread-origin', artifactId: 'legacy-fixture', title: '旧版备课'}});
  }
  {
    const f = fixture();
    f.context.syncThreadLocation({keepLaunchIntent: true});
    assert.equal(new URL(f.page.href).searchParams.get('view'), 'dashboard');
    assert.equal(new URL(f.page.href).searchParams.get('classroom'), 'pinned-ready');
    await f.context.handleProposalApproval(f.item, 'APPROVED');
    assert.equal(f.state.ordinaryClassroomId, 'pinned-ready');
    assert.equal(f.elements.ordinaryClassroom.hidden, false);
    assert.equal(f.elements.ordinaryClassroomStart.disabled, false);
    assert.equal(f.elements.ordinaryClassroomOpen.disabled, true);
    f.responses.set('/teaching/sessions/pinned-ready/control', () => ({action: {
      id: 'start-action', targetId: 'pinned-ready', request: {command: 'start'},
      approvalRequest: {id: 'action:start-action', sha256: 'c'.repeat(64)},
    }}));
    f.responses.set('/teaching/actions/start-action/decision', () => ({action: {status: 'APPROVED'}}));
    f.responses.set('GET /teaching/sessions', () => ({sessions: [
      f.ordinarySession('earlier', 'LIVE', '此前的会话'),
      f.ordinarySession('pinned-ready', 'LIVE', '植物的结构'),
      f.ordinarySession('different-module', 'LIVE', '其他章节', 17, 3),
    ]}));
    await f.context.actOnOrdinaryClassroom('start');
    assert.equal(f.state.ordinaryClassroomId, 'pinned-ready');
    assert.deepEqual(f.prompts, ['确认开始课堂「植物的结构」？']);
    assert.deepEqual(f.calls.find(item => item.path === '/teaching/actions/start-action/decision').data, {
      decision: 'APPROVED', confirmed: true, approvalRequest: {id: 'action:start-action', sha256: 'c'.repeat(64)},
    });
    assert.equal(f.elements.ordinaryClassroomStart.disabled, true);
    assert.equal(f.elements.ordinaryClassroomOpen.disabled, false);
    f.context.selectOrdinaryClassroom('different-module');
    assert.equal(f.state.ordinaryClassroomId, 'pinned-ready');
    f.context.selectOrdinaryClassroom('earlier');
    f.responses.set('/teaching/runtime/launch', () => ({launchUrl: '/fixture-opened'}));
    await f.context.actOnOrdinaryClassroom('open');
    assert.equal(f.page.href, '/fixture-opened');
    assert.equal(f.calls.at(-1).data.target, '/classroom/earlier');
  }
  {
    const f = fixture();
    await f.context.handleProposalApproval(f.item, 'APPROVED');
    const waiting = deferred();
    f.responses.set('/teaching/sessions/pinned-ready/control', () => waiting.promise);
    const pending = f.context.actOnOrdinaryClassroom('start');
    assert.equal(f.elements.ordinaryClassroomStart.disabled, true);
    assert.equal(f.elements.ordinaryClassroomSelect.disabled, true);
    f.navigate();
    waiting.resolve({action: {targetId: 'pinned-ready', request: {command: 'start'},
      approvalRequest: {id: 'unused', sha256: 'd'.repeat(64)}}});
    await pending;
    assert.deepEqual(f.prompts, []);
    assert.equal(f.elements.ordinaryClassroom.hidden, true);
    assert.equal(f.calls.filter(call => call.path.startsWith('/teaching/actions')).length, 0);
  }
  {
    const f = fixture();
    const delayed = deferred();
    let listCalls = 0;
    f.responses.set('GET /teaching/sessions', () => ++listCalls === 1 ? delayed.promise : {sessions: [
      f.ordinarySession('earlier', 'LIVE', '此前的会话'),
      f.ordinarySession('pinned-ready', 'READY', '植物的结构'),
    ]});
    const original = f.context.loadSessions(f.context.classroomScopeSnapshot(), 'pinned-ready');
    await f.context.loadSessions();
    delayed.resolve({sessions: [f.ordinarySession('earlier', 'LIVE', '旧结果')]});
    await original;
    assert.equal(f.state.ordinaryClassroomId, 'pinned-ready');
    assert.deepEqual(f.calls.map(call => new URL(call.path, f.page.href).searchParams.get('sessionId')),
      ['pinned-ready', 'pinned-ready']);
    await f.context.loadSessions(f.context.classroomScopeSnapshot(), 'missing');
    assert.equal(f.state.ordinaryClassroomId, null);
    assert.equal(f.elements.ordinaryClassroomStart.disabled, true);
    assert.equal(f.elements.ordinaryClassroomOpen.disabled, true);
  }
  console.log('Pinned classroom proposal approval, navigation, retry, READY, and R1 compatibility: PASS');
  await checkClassroomControlsInChrome();
})().catch(error => { console.error(error); process.exitCode = 1; });
