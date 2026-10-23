import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeEvents, projectActivity, streamedAnswer } from '../src/core/events.ts';

const event = (seq: number, value: Record<string, unknown>) => ({
  id: 'source:' + seq,
  sourceJobId: 'source',
  sourceSequence: seq,
  details: { agentRun: { runId: 'run', seq, time: 1000 * seq, ...value } },
});
test('late and duplicate event pages keep one command and all output in sequence', () => {
  const start = event(1, {
    type: 'item.started',
    item: {
      id: 'command',
      kind: 'command',
      title: '检查',
      command: 'node check.js',
      status: 'running',
    },
  });
  const delta = event(2, {
    type: 'item.delta',
    itemId: 'command',
    channel: 'output',
    delta: '真实输出\n',
  });
  const end = event(3, {
    type: 'item.completed',
    itemId: 'command',
    status: 'completed',
    exitCode: 0,
  });
  const rows = mergeEvents([delta], [end, start, delta]);
  assert.equal(rows.length, 3);
  const items = projectActivity('job', rows);
  assert.equal(items.length, 1);
  assert.equal(items[0].output, '真实输出\n');
  assert.equal(items[0].exitCode, 0);
});
test('unfinished records stay incomplete when a run ends, never reported as successful', () => {
  const rows = [
    event(0, { type: 'item.started', item: { id: 'a', kind: 'tool', status: 'running' } }),
    event(1, { type: 'run.completed' }),
  ];
  assert.equal(projectActivity('job', rows)[0].status, 'incomplete');
});
test('different runs can reuse item IDs without merging their output', () => {
  const rows = [
    event(1, { type: 'item.started', item: { id: 'same', kind: 'tool' } }),
    event(2, { type: 'item.started', runId: 'other', item: { id: 'same', kind: 'tool' } }),
  ];
  assert.equal(new Set(projectActivity('job', rows).map((item) => item.id)).size, 2);
});
test('model records can become reasoning records with completion metadata', () => {
  const rows = [
    event(1, {
      type: 'item.started',
      item: { id: 'model', kind: 'model', metadata: { attempt: 1 } },
    }),
    event(2, {
      type: 'item.updated',
      itemId: 'model',
      patch: { kind: 'reasoning', content: '模型返回的记录' },
    }),
    event(3, { type: 'item.completed', itemId: 'model', metadata: { finishReason: 'stop' } }),
  ];
  const item = projectActivity('job', rows)[0];
  assert.equal(item.kind, 'reasoning');
  assert.equal(item.content, '模型返回的记录');
  assert.deepEqual((item as any).metadata, { attempt: 1, finishReason: 'stop' });
});
test('partial JSON answers decode escapes without exposing unfinished protocol fields', () => {
  assert.equal(streamedAnswer('{"answer":"第一行\\n\\u4e2d\\u6587'), '第一行\n中文');
  assert.equal(streamedAnswer('{"answer":"完成\\"测试\\"","toolProposals":['), '完成"测试"');
  assert.equal(streamedAnswer('{"plan":['), '');
  assert.equal(streamedAnswer('{"answer":"开始\\u4e'), '开始');
});
