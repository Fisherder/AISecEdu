import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ generateText: vi.fn(), recordUsage: vi.fn(async () => {}) }));
vi.mock('ai', () => ({ generateText: mocks.generateText, streamText: vi.fn() }));
vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: mocks.recordUsage }));
import { callLLM } from '@/lib/ai/llm';

const options = (signal: AbortSignal) =>
  ({
    model: { provider: 'deepseek', modelId: 'deepseek-v4-flash' },
    prompt: 'test',
    abortSignal: signal,
  }) as Parameters<typeof callLLM>[0];

describe('LLM cancellation does not start retry attempts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects before the first request when already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stopped'));
    await expect(callLLM(options(controller.signal), 'test', { retries: 2 })).rejects.toThrow(
      'stopped',
    );
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it('does not retry an interrupted provider exception', async () => {
    const controller = new AbortController();
    mocks.generateText.mockImplementationOnce(async (params) => {
      expect(params.abortSignal).toBe(controller.signal);
      controller.abort(new Error('stopped'));
      throw new Error('network abort');
    });
    await expect(callLLM(options(controller.signal), 'test', { retries: 2 })).rejects.toThrow(
      'stopped',
    );
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it('never returns output that completed after cancellation', async () => {
    const controller = new AbortController();
    mocks.generateText.mockImplementationOnce(async () => {
      controller.abort(new Error('stopped'));
      return { text: 'late result' };
    });
    await expect(callLLM(options(controller.signal), 'test', { retries: 2 })).rejects.toThrow(
      'stopped',
    );
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });
});
