import { describe, expect, it } from 'vitest';
import { createAgentRunFactory } from '@/lib/agent-run/factory';
import { EMPTY_AGENT_RUN_STATE, reduceAgentRun } from '@/lib/agent-run/reducer';

describe('agent run reducer', () => {
  it('reconstructs an ordered turn from incremental reasoning and command output', () => {
    const factory = createAgentRunFactory('run-1');
    const turnId = 'run-1:turn-1';
    const reasoning = factory.item('reasoning', '模型推理', { id: 'reasoning-1' });
    const command = factory.item('command', '运行校验', {
      id: 'command-1',
      command: 'pnpm test',
      cwd: '/workspace',
    });
    const events = [
      factory.event({ type: 'run.started', label: '生成课程' }),
      factory.event({ type: 'turn.started', turnId, label: '规划' }),
      factory.event({ type: 'item.started', turnId, item: reasoning }),
      factory.event({
        type: 'item.delta',
        turnId,
        itemId: reasoning.id,
        channel: 'content',
        delta: '先读取需求',
      }),
      factory.event({ type: 'item.completed', turnId, itemId: reasoning.id }),
      factory.event({ type: 'item.started', turnId, item: command }),
      factory.event({
        type: 'item.delta',
        turnId,
        itemId: command.id,
        channel: 'output',
        delta: '42 tests passed',
      }),
      factory.event({
        type: 'item.completed',
        turnId,
        itemId: command.id,
        exitCode: 0,
      }),
      factory.event({ type: 'turn.completed', turnId }),
      factory.event({ type: 'run.completed' }),
    ];

    const state = events.reduce(reduceAgentRun, EMPTY_AGENT_RUN_STATE);
    expect(state.status).toBe('completed');
    expect(state.itemOrder).toEqual(['reasoning-1', 'command-1']);
    expect(state.items['reasoning-1']).toMatchObject({
      status: 'completed',
      content: '先读取需求',
    });
    expect(state.items['command-1']).toMatchObject({
      status: 'completed',
      output: '42 tests passed',
      exitCode: 0,
    });
    expect(state.turns[0].itemIds).toEqual(['reasoning-1', 'command-1']);
  });

  it('ignores duplicate and out-of-order events', () => {
    const factory = createAgentRunFactory('run-2');
    const started = factory.event({ type: 'run.started', label: 'run' });
    const item = factory.item('tool', 'read', { id: 'tool-1' });
    const itemStarted = factory.event({ type: 'item.started', item });
    let state = reduceAgentRun(EMPTY_AGENT_RUN_STATE, started);
    state = reduceAgentRun(state, itemStarted);
    state = reduceAgentRun(state, itemStarted);
    expect(state.itemOrder).toEqual(['tool-1']);
  });
});
