import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import {
  parseVisualGenerationIntent,
  resolveVisualGenerationIntent,
} from '@/lib/cinematic/capabilities';
import {
  visualIntentAttemptFailure,
  VisualIntentResolutionError,
  VisualIntentContractError,
} from '@/lib/cinematic/intent-diagnostics';

const secret = 'PRIVATE_CONTENT_SENTINEL';
const valid = {
  mode: 'cinematic-v1',
  reason: '需要连续观察实体的三维结构',
  objects: ['阀门'],
  interactions: ['暂停播放'],
  interactionRequirements: [
    { description: '暂停播放', kind: 'player-control', controls: ['pause'] },
  ],
};

async function failed(ai: AICallFn) {
  try {
    await resolveVisualGenerationIntent(secret, { title: '保留原方案' }, ai);
    throw new Error('Expected resolution failure');
  } catch (error) {
    expect(error).toBeInstanceOf(VisualIntentResolutionError);
    return error as VisualIntentResolutionError;
  }
}

describe('visual intent failure diagnostics without model or credential disclosure', () => {
  it('retains both failed attempts with exact schema paths and limits', async () => {
    const invalid = {
      ...valid,
      interactionRequirements: [{ ...valid.interactionRequirements[0], controls: [] }],
    };
    const ai = vi.fn().mockResolvedValue(JSON.stringify(invalid));
    const error = await failed(ai);
    expect(ai).toHaveBeenCalledTimes(2);
    expect(error.diagnostics.version).toBe('visual-intent-diagnostics-v1');
    expect(error.diagnostics.attempts).toHaveLength(2);
    for (const [index, attempt] of error.diagnostics.attempts.entries()) {
      expect(attempt).toMatchObject({
        attempt: index + 1,
        phase: 'schema',
        code: 'SCHEMA_INVALID',
        issueCount: 1,
        omittedIssueCount: 0,
      });
      expect(attempt.issues).toContainEqual({
        path: 'interactionRequirements.0.controls',
        code: 'too_small',
        minimum: 1,
      });
    }
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(error.message).toContain('[schema:SCHEMA_INVALID]');
  });

  it('preserves syntax and semantic failures separately, without the returned text', async () => {
    const ai = vi
      .fn()
      .mockResolvedValueOnce(
        `{"mode":"cinematic-v1","private":"${secret}","mode":"interactive-2d"}`,
      )
      .mockResolvedValueOnce(JSON.stringify({ ...valid, interactionRequirements: [] }));
    const error = await failed(ai);
    expect(error.diagnostics.attempts[0]).toMatchObject({
      attempt: 1,
      phase: 'json',
      code: 'DUPLICATE_KEY',
    });
    expect(error.diagnostics.attempts[0].offset).toBeGreaterThan(0);
    expect(error.diagnostics.attempts[1]).toMatchObject({
      attempt: 2,
      phase: 'contract',
      code: 'INTERACTION_MAPPING_MISMATCH',
    });
    expect(JSON.stringify(error.diagnostics)).not.toContain(secret);
  });

  it('does not treat upstream failures as malformed JSON or resubmit their messages', async () => {
    const upstream = Object.assign(new Error(`Bearer ${secret}; password=${secret}`), {
      name: 'AI_APICallError',
      statusCode: 429,
      responseBody: secret,
      cause: Object.assign(new Error(secret), { code: 'ETIMEDOUT' }),
    });
    const ai = vi.fn().mockRejectedValue(upstream);
    const error = await failed(ai);
    expect(ai).toHaveBeenCalledTimes(1);
    expect(error.diagnostics.attempts).toEqual([
      {
        attempt: 1,
        phase: 'upstream',
        code: 'AI_APICallError',
        statusCode: 429,
        transportCode: 'ETIMEDOUT',
      },
    ]);
    expect(error).not.toHaveProperty('cause');
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it('handles a successful format correction without changing the requirement', async () => {
    const ai = vi
      .fn()
      .mockResolvedValueOnce('not JSON')
      .mockResolvedValueOnce(JSON.stringify(valid));
    const result = await resolveVisualGenerationIntent(secret, { title: '保留原方案' }, ai);
    expect(ai).toHaveBeenCalledTimes(2);
    expect(result).toEqual(parseVisualGenerationIntent(valid));
    for (const call of ai.mock.calls) expect(JSON.parse(call[1]).request).toBe(secret);
    expect(JSON.parse(ai.mock.calls[1][1]).correction).toContain('上次输出不符合合同');
  });

  it.each([
    [{ mode: 'interactive-2d', reason: '明确二维关系图' }, 'MISSING_2D_FORMAT'],
    [{ ...valid, interactionRequirements: [] }, 'INTERACTION_MAPPING_MISMATCH'],
    [
      { ...valid, interactionRequirements: [{ description: '暂停播放', kind: 'player-control' }] },
      'INVALID_PLAYER_CONTROLS',
    ],
    [
      {
        ...valid,
        interactionRequirements: [{ description: '暂停播放', kind: 'view', controls: ['pause'] }],
      },
      'CONTROLS_ON_TEACHING_REQUIREMENT',
    ],
  ])('records the specific contract error without accepting it', (value, code) => {
    try {
      parseVisualGenerationIntent(value);
      throw new Error('Expected an invalid contract');
    } catch (error) {
      expect(error).toBeInstanceOf(VisualIntentContractError);
      expect(visualIntentAttemptFailure(error, 'schema', 1)).toEqual({
        attempt: 1,
        phase: 'contract',
        code,
      });
    }
  });

  it('bounds large diagnostic reports while explicitly counting omitted issues', () => {
    const error = new z.ZodError(
      Array.from({ length: 30 }, () => ({
        code: 'custom',
        path: [secret, 'controls'],
        message: secret,
      })),
    );
    const result = visualIntentAttemptFailure(error, 'schema', 1);
    expect(result).toMatchObject({ issueCount: 30, omittedIssueCount: 6 });
    expect(result.issues).toHaveLength(24);
    expect(result.issues?.[0].path).toBe('<field>.controls');
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('never copies arbitrary error names, codes, nested request bodies or messages', () => {
    const error = {
      name: secret,
      code: secret,
      message: secret,
      body: secret,
      statusCode: secret,
      cause: { code: secret, responseBody: secret },
    };
    expect(visualIntentAttemptFailure(error, 'upstream', 1)).toEqual({
      attempt: 1,
      phase: 'upstream',
      code: 'UNCLASSIFIED_ERROR',
    });
    expect(visualIntentAttemptFailure(error, 'json', 1)).toEqual({
      attempt: 1,
      phase: 'json',
      code: 'UNCLASSIFIED_ERROR',
    });
  });
});
