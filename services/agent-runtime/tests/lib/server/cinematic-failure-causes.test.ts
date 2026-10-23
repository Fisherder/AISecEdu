import { describe, expect, it, vi } from 'vitest';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import {
  applyCinematicPatches,
  CinematicPatchError,
  CinematicQualityError,
  generateCinematicExplainer,
  validateAndRepairCinematicScene,
} from '@/lib/server/cinematic-generation';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { cinematicQualityDiagnostics } from '@/lib/cinematic/quality-diagnostics';
import { assemblySceneFixture } from '../../fixtures/cinematic-assembly';
import { sceneFixture, directorFixture } from '../../fixtures/cinematic';

const privateText = 'PRIVATE_REQUEST_LABEL_OR_PROVIDER_DETAIL';
const valid = () => resolveCinematicAssembly(assemblySceneFixture()).scene;
const capture = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw Error('Expected failure');
};
const failed = async (action: Promise<unknown>) => {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(CinematicQualityError);
    const result = error as CinematicQualityError;
    expect(JSON.stringify(result.diagnostics)).not.toContain(privateText);
    return result;
  }
  throw Error('Expected rejection, never a fallback artifact');
};
const model = () =>
  vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify(directorFixture))
    .mockResolvedValueOnce(JSON.stringify(valid()));
const generate = (ai: AICallFn) =>
  generateCinematicExplainer(
    {
      type: 'visualization3d',
      title: '结构演示',
      originalRequest: privateText,
    },
    0,
    ai,
  );
const badPatch = { op: 'replace', path: '/nodes/@private-node/absent/position', value: [1, 2, 3] };
const review = (patches: unknown[] = []) => JSON.stringify({ issues: [privateText], patches });

describe('typed cinematic patch failures preserve exact structural cause', () => {
  it.each([
    { path: 'nodes/hero/position', segmentIndex: 0, reason: 'missing-leading-slash' },
    { path: '/nodes/@hero/params/bad~2', segmentIndex: 3, reason: 'invalid-pointer-escape' },
    { path: '/nodes/@hero/params/__proto__/x', segmentIndex: 3, reason: 'unsafe-segment' },
    { path: '/unknown/title', segmentIndex: 0, reason: 'unknown-root' },
    { path: '/nodes/@/position', segmentIndex: 1, reason: 'empty-id' },
    { path: '/nodes/@private-node/position', segmentIndex: 1, reason: 'id-not-found' },
    { path: '/nodes/@hero', segmentIndex: 1, reason: 'add-requires-append', op: 'add' },
    { path: '/nodes/0', segmentIndex: 1, reason: 'add-requires-append', op: 'add' },
    { path: '/tracks/not-an-index/property', segmentIndex: 1, reason: 'invalid-array-index' },
    { path: '/tracks/-/property', segmentIndex: 1, reason: 'append-not-allowed' },
    { path: '/nodes/99/position', segmentIndex: 1, reason: 'index-out-of-bounds' },
    { path: '/nodes/@hero/absent/position', segmentIndex: 2, reason: 'missing-parent' },
    { path: '/nodes/@hero/params/params/label', segmentIndex: 3, reason: 'missing-parent' },
    { path: '/nodes/@hero/absent', segmentIndex: 2, reason: 'missing-path' },
  ])(
    'records $reason at segment $segmentIndex without mutating input',
    ({ path, segmentIndex, reason, op = 'replace' }) => {
      const scene = sceneFixture(),
        before = structuredClone(scene);
      const error = capture(() =>
        applyCinematicPatches(scene, {
          patches: [
            { op: 'replace', path: '/title', value: '补丁工作副本' },
            { op, path, value: [1, 2, 3] },
          ],
        }),
      ) as CinematicPatchError;
      expect(error).toBeInstanceOf(CinematicPatchError);
      expect(error.patchCause).toEqual({ patchIndex: 1, op, path, segmentIndex, reason });
      expect(error.message).toContain('补丁 #2');
      expect(error.message).toContain(JSON.stringify(path));
      expect(scene).toEqual(before);
      const diagnostic = cinematicQualityDiagnostics([
        { status: 'PATCH_FAILED', cause: { stage: 'geometry-repair-patch', ...error.patchCause } },
      ]);
      expect(diagnostic.causes[0].reason).toBe(reason);
      expect(JSON.stringify(diagnostic)).not.toContain('private-node');
    },
  );

  it('distinguishes a missing value from a missing path', () => {
    const error = capture(() =>
      applyCinematicPatches(sceneFixture(), { patches: [{ op: 'replace', path: '/title' }] }),
    ) as CinematicPatchError;
    expect(error.patchCause).toEqual({
      patchIndex: 0,
      op: 'replace',
      path: '/title',
      segmentIndex: 0,
      reason: 'missing-value',
    });
  });

  it('rejects ambiguous IDs with a typed reason', () => {
    const scene = sceneFixture();
    scene.nodes.push(structuredClone(scene.nodes[0]));
    const error = capture(() =>
      applyCinematicPatches(scene, {
        patches: [{ op: 'replace', path: '/nodes/@hero/position', value: [1, 0, 0] }],
      }),
    ) as CinematicPatchError;
    expect(error.patchCause).toMatchObject({
      patchIndex: 0,
      segmentIndex: 1,
      reason: 'ambiguous-id',
    });
  });

  it.each(['literal', 'normalized'])(
    'preserves the no-change rejection after %s patches',
    (kind) => {
      const scene = sceneFixture();
      const patch =
        kind === 'literal'
          ? { op: 'replace', path: '/title', value: scene.title }
          : { op: 'add', path: '/nodes/@hero/ignored-extra', value: privateText };
      const error = capture(() =>
        applyCinematicPatches(scene, { patches: [patch] }),
      ) as CinematicPatchError;
      expect(error).toBeInstanceOf(CinematicPatchError);
      expect(error.patchCause).toEqual({
        patchIndex: null,
        op: null,
        path: null,
        segmentIndex: null,
        reason: 'no-change',
      });
    },
  );
});

describe('bounded repair and semantic failure provenance without extra model calls', () => {
  it('keeps both failed geometry patches and supplies the typed cause to the existing next repair', async () => {
    const scene = valid();
    delete scene.assembly;
    const ai = vi.fn().mockResolvedValue(JSON.stringify({ patches: [badPatch] }));
    const error = await failed(validateAndRepairCinematicScene(scene, {}, ai));
    expect(ai).toHaveBeenCalledTimes(2);
    const attempts = error.attempts as Array<Record<string, any>>;
    expect(attempts.filter((item) => item.status === 'PATCH_FAILED')).toHaveLength(2);
    expect(
      attempts
        .filter((item) => item.status === 'PATCH_FAILED')
        .every((item) => item.cause.reason === 'id-not-found'),
    ).toBe(true);
    expect(JSON.parse(ai.mock.calls[1][1]).previousPatchCause).toMatchObject({
      stage: 'geometry-repair-patch',
      reason: 'id-not-found',
      patchIndex: 0,
      segmentIndex: 1,
    });
    expect(error.diagnostics.causes.map((cause) => cause.reason)).toEqual([
      'id-not-found',
      'id-not-found',
    ]);
  });

  it.each(['call', 'json', 'schema'] as const)(
    'separates semantic %s failures from unresolved teaching content',
    async (kind) => {
      const ai = model();
      if (kind === 'call') ai.mockRejectedValue(new Error(privateText));
      else
        ai.mockResolvedValue(
          kind === 'json' ? 'invalid JSON' : JSON.stringify({ issues: privateText, patches: [] }),
        );
      const error = await failed(generate(ai));
      expect(ai).toHaveBeenCalledTimes(5);
      const cause = error.diagnostics.causes.find((cause) => cause.stage === 'semantic-' + kind)!;
      expect(cause).toMatchObject({
        reason:
          kind === 'call'
            ? 'model-call-failed'
            : kind === 'json'
              ? 'json-invalid'
              : 'schema-invalid',
        semanticAttempt: 2,
      });
      if (kind === 'schema')
        expect(error.diagnostics.causeIssues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'invalid_type', path: 'issues' }),
          ]),
        );
      expect(error.diagnostics.causes[0].reason).toBe('semantic-review-exhausted');
    },
  );

  it('does not clear a reported unresolved issue when later reviews return empty arrays without a repair', async () => {
    const ai = model()
      .mockResolvedValueOnce(review())
      .mockResolvedValue(JSON.stringify({ issues: [], patches: [] }));
    const error = await failed(generate(ai));
    expect(ai).toHaveBeenCalledTimes(5);
    const causes = error.diagnostics.causes.filter(
      (cause) => cause.reason === 'unresolved-without-patch',
    );
    expect(causes).toHaveLength(3);
    expect(causes[0]).toMatchObject({
      reviewIssueCount: 0,
      unresolvedIssueCount: 1,
      patchCount: 0,
    });
    expect(JSON.parse(ai.mock.calls[4][1]).previousUnresolvedIssues).toEqual([privateText]);
  });

  it('retains semantic patch errors and the final unverified-repair limit as different causes', async () => {
    const ai = model().mockResolvedValue(review([badPatch]));
    const error = await failed(generate(ai));
    expect(ai).toHaveBeenCalledTimes(5);
    expect(
      error.diagnostics.causes.filter((cause) => cause.reason === 'id-not-found'),
    ).toHaveLength(2);
    expect(error.diagnostics.causes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'semantic-budget',
          reason: 'repair-limit-unverified',
          patchCount: 1,
        }),
      ]),
    );
    expect(JSON.stringify(error.diagnostics)).not.toContain('private-node');
  });

  it('retains schema paths and limits when a semantic patch makes the scene invalid', async () => {
    const ai = model().mockResolvedValue(
      review([{ op: 'replace', path: '/nodes/@hero/roughness', value: 0 }]),
    );
    const error = await failed(generate(ai));
    expect(ai).toHaveBeenCalledTimes(5);
    expect(error.diagnostics.causes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'semantic-patch', reason: 'schema-invalid' }),
      ]),
    );
    expect(error.diagnostics.causeIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'nodes.0.roughness', code: 'too_small', minimum: 0.05 }),
      ]),
    );
  });

  it('merges failed post-semantic geometry attempts instead of losing them behind semantic-unresolved', async () => {
    const ai = model()
      .mockResolvedValueOnce(review([{ op: 'remove', path: '/assembly' }]))
      .mockResolvedValueOnce(JSON.stringify({ patches: [badPatch] }))
      .mockResolvedValueOnce(JSON.stringify({ patches: [badPatch] }))
      .mockResolvedValue(JSON.stringify({ issues: [], patches: [] }));
    const error = await failed(generate(ai));
    expect(ai).toHaveBeenCalledTimes(7);
    const inner = (error.attempts as Array<Record<string, any>>).filter(
      (item) => item.semanticAttempt === 0,
    );
    expect(inner.filter((item) => item.status === 'PATCH_FAILED')).toHaveLength(2);
    expect(inner.some((item) => item.status === 'FAIL' && item.metrics.relations === 0)).toBe(true);
    expect(error.diagnostics.causes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'semantic-geometry',
          reason: 'quality-recheck-failed',
          nestedAttemptCount: 5,
        }),
      ]),
    );
    expect(error.diagnostics.issues.some((issue) => issue.code === 'composition-assembly')).toBe(
      true,
    );
    expect(JSON.parse(ai.mock.calls[5][1]).scene.assembly).toEqual(valid().assembly);
  });

  it('still rejects a third proposed change even when that review has no issue text', async () => {
    const ai = model();
    for (let i = 0; i < 3; i++)
      ai.mockResolvedValueOnce(
        JSON.stringify({
          issues: i === 2 ? [] : [privateText],
          patches: [
            {
              op: 'replace',
              path: '/chapters/0/caption',
              value: `观察处理器内部结构的预设层次变化，第${i + 1}版说明。`,
            },
          ],
        }),
      );
    const error = await failed(generate(ai));
    expect(ai).toHaveBeenCalledTimes(5);
    expect(error.diagnostics.causes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'repair-limit-unverified',
          reviewIssueCount: 0,
          patchCount: 1,
        }),
      ]),
    );
  });

  it('requires the final fresh review and preserves the successful call count', async () => {
    const ai = model()
      .mockResolvedValueOnce(
        review([
          {
            op: 'replace',
            path: '/chapters/0/caption',
            value: '观察处理器内部结构的预设层次变化，不代表精确计算。',
          },
        ]),
      )
      .mockResolvedValueOnce(JSON.stringify({ issues: [], patches: [] }));
    const result = await generate(ai);
    expect(ai).toHaveBeenCalledTimes(4);
    expect(result.content).toMatchObject({
      cinematicDirection: { groundingReview: { patchCount: 1, finalIssues: [] } },
    });
  });

  it('keeps contract-phase stable-ID failures without entering semantic review', async () => {
    const scene = valid();
    scene.nodes[0].roughness = 0;
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(directorFixture))
      .mockResolvedValueOnce(JSON.stringify(scene))
      .mockResolvedValue(JSON.stringify({ patches: [badPatch] }));
    const error = await failed(generate(ai));
    expect(ai).toHaveBeenCalledTimes(4);
    expect(error.diagnostics.causes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'scene-patch', reason: 'id-not-found', patchIndex: 0 }),
      ]),
    );
    expect(
      error.diagnostics.causes.every((cause) => !String(cause.stage).startsWith('semantic')),
    ).toBe(true);
  });
});
