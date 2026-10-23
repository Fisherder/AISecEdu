import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentRunFactory } from '@/lib/agent-run/factory';
import { beginAgentRun, ingestAgentRunEvent, useAgentRunStore } from '@/lib/agent-run/store';

describe('agent run store streaming', () => {
  afterEach(() => {
    useAgentRunStore.getState().clear('buffer-test');
    vi.useRealTimers();
  });

  it('coalesces rapid deltas without losing content or completion ordering', () => {
    vi.useFakeTimers();
    beginAgentRun('buffer-test', 'Parent run', 'parent-run');
    const source = createAgentRunFactory('child-run');
    const item = source.item('reasoning', '模型推理', { id: 'child-reasoning' });

    ingestAgentRunEvent(
      'buffer-test',
      source.event({ type: 'item.started', turnId: 'child-turn', item }),
    );
    ingestAgentRunEvent(
      'buffer-test',
      source.event({
        type: 'item.delta',
        turnId: 'child-turn',
        itemId: item.id,
        channel: 'content',
        delta: '逐字节',
      }),
    );
    ingestAgentRunEvent(
      'buffer-test',
      source.event({
        type: 'item.delta',
        turnId: 'child-turn',
        itemId: item.id,
        channel: 'content',
        delta: '检查边界',
      }),
    );

    expect(useAgentRunStore.getState().runs['buffer-test']?.items[item.id].content).toBeUndefined();
    vi.advanceTimersByTime(50);
    expect(useAgentRunStore.getState().runs['buffer-test']?.items[item.id].content).toBe(
      '逐字节检查边界',
    );

    ingestAgentRunEvent(
      'buffer-test',
      source.event({ type: 'item.completed', itemId: item.id, status: 'completed' }),
    );
    expect(useAgentRunStore.getState().runs['buffer-test']?.items[item.id].status).toBe(
      'completed',
    );
  });
});
