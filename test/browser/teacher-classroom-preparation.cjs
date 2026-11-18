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
  'handleAgentTool', 'loadSessions',
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
    dojo: {value: '17'}, module: {value: '2'}};
  const state = {thread, threadLoadEpoch: 3, executingProposalKeys: new Set(), resolvingApprovalKeys: new Set(),
    appliedActionProposals: new Set(), proposalFailures: new Map()};
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
      assert.equal(path, '/teaching/sessions');
      return responses.get('GET ' + path)?.() ?? {sessions: [
        {id: 'earlier', status: 'READY', dojoId: 17, moduleIndex: 2, title: '此前的会话'},
        {id: 'pinned-ready', status: 'READY', dojoId: 17, moduleIndex: 2, title: '植物的结构'},
      ]};
    },
    async json(method, path, data) {
      calls.push({method, path, data: plain(data)});
      assert.ok(responses.has(path), `Unexpected request to ${path}`);
      return responses.get(path)();
    },
  };
  const approve = () => {
    const savedMessage = structuredClone(message);
    savedMessage.metadata.toolProposalDecisions = {'1': {...approval}};
    return {decision: approval, thread: {...thread, messages: [savedMessage]}};
  };
  responses.set(prefix + '/decision', approve);
  responses.set(prefix + '/prepare-classroom', () => ({sessionId: 'pinned-ready'}));
  responses.set('/teaching/sessions', () => ({sessionId: 'legacy-session'}));
  const context = vm.createContext({
    api,
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
    get continuations() { return continuations; },
    navigate() { state.threadLoadEpoch++; state.thread = otherThread; },
  };
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
  console.log('Pinned classroom proposal approval, navigation, retry, READY, and R1 compatibility: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
