import { describe, expect, it, vi } from 'vitest';
import {
  CINEMATIC_DIRECTOR_PROMPT,
  CINEMATIC_SCENE_PROMPT,
  CinematicQualityError,
  applyCinematicPatches,
  generateCinematicExplainer,
  validateAndRepairCinematicScene,
} from '@/lib/server/cinematic-generation';
import { CINEMATIC_MAX_OBJECTIVES, CINEMATIC_MAX_OBJECTIVE_LENGTH } from '@/lib/cinematic/limits';
import {
  cinematicSchema,
  extractCinematicScene,
  parseCinematicScene,
} from '@/lib/cinematic/schema';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { checkCinematicQuality } from '@/lib/cinematic/quality';
import { assemblyDirectorFixture, assemblySceneFixture } from '../../fixtures/cinematic-assembly';

const valid = () => resolveCinematicAssembly(assemblySceneFixture()).scene;
const objectives = (count: number) =>
  Array.from({ length: count }, (_, index) => `原目标 ${index + 1}`);
const input = {
  type: 'visualization3d' as const,
  title: '观察完整教学结构',
  description: '保留各条学习目标，观察部件及逻辑层级。',
};
const cleanReview = JSON.stringify({ issues: [], patches: [] });

describe('v11 shared bounded objectives without truncation or merging', () => {
  it('uses explicit shared limits rather than the former six-objective ceiling', () => {
    expect(CINEMATIC_MAX_OBJECTIVES).toBe(24);
    expect(CINEMATIC_MAX_OBJECTIVE_LENGTH).toBe(160);
  });

  it.each([1, 6, 7, 16, 17, 24])(
    'preserves all %i scene objectives in their original order',
    (count) => {
      const scene = { ...valid(), objectives: objectives(count) };
      const before = structuredClone(scene);
      expect(parseCinematicScene(scene).objectives).toEqual(before.objectives);
      expect(scene).toEqual(before);
    },
  );

  it('accepts a 160-character objective and retains its last character', () => {
    const text = '目'.repeat(159) + '末';
    expect(parseCinematicScene({ ...valid(), objectives: [text] }).objectives).toEqual([text]);
  });

  it.each([
    { name: '25 objectives', values: objectives(25), path: ['objectives'], maximum: 24 },
    { name: '161 characters', values: ['目'.repeat(161)], path: ['objectives', 0], maximum: 160 },
  ])(
    'rejects $name with exact path and maximum, without altering input',
    ({ values, path, maximum }) => {
      const scene = { ...valid(), objectives: values };
      const before = structuredClone(scene);
      const result = cinematicSchema.safeParse(scene);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ code: 'too_big', path, maximum }),
        );
      expect(scene).toEqual(before);
    },
  );

  it('continues to reject an empty objectives array', () => {
    const result = cinematicSchema.safeParse({ ...valid(), objectives: [] });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ code: 'too_small', path: ['objectives'], minimum: 1 }),
      );
  });

  it.each([7, 24])(
    'preserves %i goals across director, scene, grounding and compiled output',
    async (count) => {
      const goals = objectives(count);
      goals[count - 1] = '目'.repeat(159) + '末';
      const scene = { ...valid(), objectives: goals };
      const ai = vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ ...assemblyDirectorFixture, objectives: goals }))
        .mockResolvedValueOnce(JSON.stringify(scene))
        .mockResolvedValueOnce(cleanReview);
      const artifact = await generateCinematicExplainer({ ...input, keyPoints: goals }, 0, ai);
      expect(ai).toHaveBeenCalledTimes(3);
      for (const call of ai.mock.calls)
        expect(JSON.parse(call[1]).request.keyPoints).toEqual(goals);
      for (const index of [1, 2])
        expect(JSON.parse(ai.mock.calls[index][1]).director.objectives).toEqual(goals);
      expect(artifact.content).toMatchObject({ cinematicScene: { objectives: goals } });
      expect(
        extractCinematicScene((artifact.content as { html: string }).html)?.objectives,
      ).toEqual(goals);
    },
  );

  it.each([
    { name: '25 goals', values: objectives(25), maximum: 24 },
    { name: '161 characters', values: ['目'.repeat(161)], maximum: 160 },
  ])(
    'rejects a director with $name using the unchanged three-call bound',
    async ({ values, maximum }) => {
      const director = { ...assemblyDirectorFixture, objectives: values };
      const ai = vi.fn().mockResolvedValue(JSON.stringify(director));
      const error = await generateCinematicExplainer(input, 0, ai).then(
        () => undefined,
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(CinematicQualityError);
      expect(ai).toHaveBeenCalledTimes(3);
      expect(JSON.parse(ai.mock.calls[1][1]).invalidDirector.objectives).toEqual(values);
      expect(JSON.parse(ai.mock.calls[1][1]).correction).toContain('objectives');
      expect((error as CinematicQualityError).attempts).toContainEqual(
        expect.objectContaining({
          status: 'DIRECTOR_INVALID',
          issues: expect.arrayContaining([expect.objectContaining({ code: 'too_big', maximum })]),
        }),
      );
    },
  );

  it.each([CINEMATIC_DIRECTOR_PROMPT, CINEMATIC_SCENE_PROMPT])(
    'exposes both bounds and prohibits destructive goal reduction',
    (prompt) => {
      expect(prompt).toContain('objectives统一为1-24条，每条最多160字符');
      expect(prompt).toContain('完整保留原目标，不截断、不合并、不删除');
      expect(prompt).toContain('不为凑数新增目标');
    },
  );
});

describe('v11 explicit missing-container patches and unchanged atomic execution', () => {
  const missingAssembly = () => {
    const scene = valid();
    delete scene.assembly;
    return scene;
  };

  it('does not auto-create an absent assembly for a nested add', () => {
    const scene = missingAssembly();
    expect(() =>
      applyCinematicPatches(scene, {
        patches: [
          {
            op: 'add',
            path: '/assembly/placements/-',
            value: valid().assembly!.placements[1],
          },
        ],
      }),
    ).toThrow('补丁父路径不存在');
    expect(scene.assembly).toBeUndefined();
  });

  it('accepts adding a complete missing assembly root', () => {
    const scene = missingAssembly();
    const assembly = valid().assembly!;
    const result = applyCinematicPatches(scene, {
      patches: [{ op: 'add', path: '/assembly', value: assembly }],
    });
    expect(result.assembly).toEqual(assembly);
    expect(scene.assembly).toBeUndefined();
  });

  it('accepts explicitly creating the root before nested appends in the same batch', () => {
    const assembly = valid().assembly!;
    const result = applyCinematicPatches(missingAssembly(), {
      patches: [
        { op: 'add', path: '/assembly', value: { version: 'assembly-v1', placements: [] } },
        ...assembly.placements.map((value) => ({
          op: 'add',
          path: '/assembly/placements/-',
          value,
        })),
      ],
    });
    expect(result.assembly).toEqual(assembly);
  });

  it('rejects replace of a missing root instead of implicitly adding it', () => {
    expect(() =>
      applyCinematicPatches(missingAssembly(), {
        patches: [
          {
            op: 'replace',
            path: '/assembly',
            value: valid().assembly,
          },
        ],
      }),
    ).toThrow('补丁路径不存在');
  });

  it('replays required earlier operations after a failed batch and retains the two-repair bound', async () => {
    const scene = missingAssembly();
    const before = structuredClone(scene);
    const titlePatch = { op: 'replace', path: '/title', value: '本次有效补丁标题' };
    const assembly = valid().assembly!;
    const ai = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [
            titlePatch,
            {
              op: 'add',
              path: '/assembly/placements/-',
              value: assembly.placements[1],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [titlePatch, { op: 'add', path: '/assembly', value: assembly }],
        }),
      );
    const result = await validateAndRepairCinematicScene(scene, {}, ai, {
      requireComposition: true,
    });
    expect(ai).toHaveBeenCalledTimes(2);
    expect(result.repairs).toBe(2);
    const second = JSON.parse(ai.mock.calls[1][1]);
    expect(second.scene).toEqual(before);
    expect(second.previousPatchError).toContain('segment="assembly": 补丁父路径不存在');
    expect(result.scene.title).toBe(titlePatch.value);
    expect(result.quality.status).toBe('PASS');
    expect(scene).toEqual(before);
    const prompt = ai.mock.calls[0][0];
    expect(prompt).toContain('不自动创建祖先容器');
    expect(prompt).toContain('replace/remove要求目标路径已经存在');
    expect(prompt).toContain('"op":"add","path":"/assembly"');
    expect(prompt).toContain('缺失coverage时同理先add完整 /coverage');
    expect(prompt).toContain('补丁操作批次具有原子性');
    expect(prompt).toContain('只以当前提供的scene/invalidScene为准');
  });
});

describe('v11 transport examples agree with unchanged quality predicates', () => {
  const description = '观察实际运输过程';
  const check = (scene: ReturnType<typeof valid>) =>
    checkCinematicQuality(scene, {
      interactionRequirements: [{ description, kind: 'transport' }],
    });
  const displacement = () => {
    const scene = valid();
    const [x, y, z] = scene.nodes[0].position;
    scene.tracks[0] = {
      target: 'hero',
      property: 'position',
      easing: 'linear',
      keyframes: [
        { at: 0, value: [x, y, z] },
        { at: 60, value: [x, y + 3, z] },
      ],
    };
    scene.coverage!.interactions[0] = {
      description,
      chapter: 1,
      targets: ['hero'],
      properties: ['position'],
    };
    return scene;
  };

  it('accepts explicitly mapped visible position tracks as transport', () => {
    const result = check(displacement());
    expect(result.status).toBe('PASS');
    expect(result.interactionEvidence[0]).toMatchObject({
      status: 'PASS',
      tracks: ['hero:position'],
      connections: [],
    });
  });

  it('does not treat properties transport as a wildcard for a position track', () => {
    const scene = displacement();
    scene.coverage!.interactions[0].properties = ['transport'];
    const result = check(scene);
    expect(result.status).toBe('FAIL');
    expect(result.interactionEvidence[0].diagnostics?.mappings[0].tracks[0]).toMatchObject({
      property: 'position',
      propertyMapped: false,
      reasons: expect.arrayContaining(['property-not-mapped']),
    });
  });

  it('accepts bound visible connection particles, but rejects an unbound connection', () => {
    const scene = valid();
    const transported = parseCinematicScene({
      ...scene,
      tracks: [],
      connections: [{ id: 'flow-link', from: 'hero', to: 'logic', particles: 8, speed: 0.1 }],
    });
    transported.coverage!.interactions[0] = {
      description,
      chapter: 1,
      targets: ['hero', 'logic'],
      properties: ['transport'],
      connections: ['flow-link'],
    };
    expect(check(transported).interactionEvidence[0]).toMatchObject({
      status: 'PASS',
      tracks: [],
      connections: ['flow-link'],
    });
    transported.coverage!.interactions[0].connections = [];
    expect(check(transported).interactionEvidence[0].status).toBe('FAIL');
  });

  it('provides distinct position and connection examples without redefining transport', () => {
    expect(CINEMATIC_SCENE_PROMPT).toContain(
      '"targets":["moving-entity"],"properties":["position"]',
    );
    expect(CINEMATIC_SCENE_PROMPT).toContain(
      '"properties":["transport"],"connections":["flow-link"]',
    );
    expect(CINEMATIC_SCENE_PROMPT).toContain('不是position轨道的通配符');
    expect(CINEMATIC_SCENE_PROMPT).toContain('两种实现都保持原transport语义');
  });
});
