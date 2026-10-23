import { describe, expect, it } from 'vitest';
import { CinematicExecutionError } from '@/lib/server/cinematic-execution';
import { generationFailure } from '@/lib/server/generation-failure';

describe('generation failure scheduling', () => {
  it('does not restart an entire generation after its absolute delivery budget is exhausted', () => {
    expect(generationFailure(new CinematicExecutionError('budget-exhausted'))).toEqual({
      failureCategory: 'permanent',
      errorCode: 'GENERATION_TIME_BUDGET_EXHAUSTED',
      error: '本轮生成已到达质量交付时限；已保留全部完成步骤，可从检查点继续定向修复。',
    });
  });

  it('keeps provider outages retryable while preserving their checkpoints', () => {
    expect(generationFailure(new CinematicExecutionError('model-timeout'))).toMatchObject({
      failureCategory: 'service',
      errorCode: 'GENERATION_TEMPORARILY_UNAVAILABLE',
      retryAfterSeconds: 30,
    });
  });
});
