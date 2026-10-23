import { describe, it, expect, vi } from 'vitest';
import {
  generateCinematicExplainer,
  parseCinematicCandidate,
  validateAndRepairCinematicScene,
  CinematicQualityError,
} from '@/lib/server/cinematic-generation';
import { parseCinematicScene } from '@/lib/cinematic/schema';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { assemblySceneFixture, assemblyDirectorFixture } from '../../fixtures/cinematic-assembly';

const valid = () => resolveCinematicAssembly(assemblySceneFixture()).scene;
const cleanReview = JSON.stringify({ issues: [], patches: [] });
const input = {
  type: 'visualization3d' as const,
  title: '观察真实组合结构',
  description: '让我围着板上的处理器看清内部结构，与侧边的逻辑层级比较。',
};
const invalidIdPatches = () => [
  { op: 'replace', path: '/nodes/@CPU/id', value: 'hero' },
  { op: 'replace', path: '/tracks/0/target', value: 'hero' },
  ...[0, 1, 2, 3].flatMap((index) => [
    { op: 'replace', path: `/shots/${index}/frame/nodes/0`, value: 'hero' },
    { op: 'replace', path: `/chapters/${index}/focus/0`, value: 'hero' },
  ]),
  { op: 'replace', path: '/coverage/objects/0/nodes/0', value: 'hero' },
  { op: 'replace', path: '/coverage/interactions/0/targets/0', value: 'hero' },
  { op: 'replace', path: '/assembly/placements/1/node', value: 'hero' },
];

describe('bounded repair retains invalid SceneIR and the frozen request', () => {
  it('patches bad id, roughness zero and too-close camera without rebuilding the scene', async () => {
    const original = valid(),
      raw = JSON.parse(JSON.stringify(original).replaceAll('"hero"', '"CPU"'));
    raw.nodes[0].roughness = 0;
    raw.shots[0].position = [0, 0, 1];
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(raw))
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [
            { op: 'replace', path: '/nodes/@CPU/roughness', value: 0.3 },
            { op: 'replace', path: '/shots/0/position', value: original.shots[0].position },
            ...invalidIdPatches(),
          ],
        }),
      )
      .mockResolvedValueOnce(cleanReview);
    const artifact = await generateCinematicExplainer(input, 0, ai);
    expect(ai).toHaveBeenCalledTimes(4);
    const repair = JSON.parse(ai.mock.calls[2][1]);
    expect(repair.invalidScene).toEqual(raw);
    expect(repair.schemaErrors.some((error: { path: string }) => error.path.endsWith('id'))).toBe(
      true,
    );
    expect(
      repair.schemaErrors.some((error: { path: string }) => error.path.endsWith('roughness')),
    ).toBe(true);
    expect(ai.mock.calls[2][0]).toContain('即使协议无效也只输出定向patches');
    expect(artifact.content).toMatchObject({ cinematicScene: original });
    expect(raw.nodes[0].id).toBe('CPU');
  });
  it('keeps successful partial fixes when the next raw candidate is still invalid', async () => {
    const original = valid(),
      raw = JSON.parse(JSON.stringify(original).replaceAll('"hero"', '"CPU"'));
    raw.nodes[0].roughness = 0;
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(raw))
      .mockResolvedValueOnce(
        JSON.stringify({ patches: [{ op: 'replace', path: '/nodes/@CPU/roughness', value: 0.3 }] }),
      )
      .mockResolvedValueOnce(JSON.stringify({ patches: invalidIdPatches() }))
      .mockResolvedValueOnce(cleanReview);
    await generateCinematicExplainer(input, 0, ai);
    expect(ai).toHaveBeenCalledTimes(5);
    expect(JSON.parse(ai.mock.calls[3][1]).invalidScene.nodes[0]).toMatchObject({
      id: 'CPU',
      roughness: 0.3,
    });
  });
  it('preserves the invalid director and lists legal model names for its retry', async () => {
    const director = structuredClone(assemblyDirectorFixture);
    director.subjects[0].model = 'custom-chip';
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(director))
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(valid()))
      .mockResolvedValueOnce(cleanReview);
    await generateCinematicExplainer(input, 0, ai);
    const retry = JSON.parse(ai.mock.calls[1][1]);
    expect(retry.invalidDirector).toEqual(director);
    expect(retry.legalModels).toContain('processor');
    expect(retry.correction).toContain('subjects.0.model');
    expect(ai.mock.calls[1][0]).toContain('必须省略model');
  });
  it('does not accept a replacement scene when a directed patch was requested', async () => {
    const scene = valid(),
      raw = structuredClone(scene);
    raw.nodes[0].roughness = 0;
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(raw))
      .mockResolvedValue(JSON.stringify(scene));
    await expect(generateCinematicExplainer(input, 0, ai)).rejects.toBeInstanceOf(
      CinematicQualityError,
    );
    expect(ai).toHaveBeenCalledTimes(4);
    expect(JSON.parse(ai.mock.calls[3][1]).invalidScene.nodes[0].roughness).toBe(0);
  });
  it('supplies exact original object names and typed view requirements to every repair stage', async () => {
    const prompt = {
      ...input,
      description: JSON.stringify({
        plan: {
          visualIntent: {
            objects: ['PCB 基板'],
            interactions: ['单指拖动旋转视角'],
            interactionRequirements: [{ description: '单指拖动旋转视角', kind: 'view' }],
            visualPriorities: ['有支撑结构和近景'],
          },
        },
      }),
    };
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(valid()))
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [
            {
              op: 'add',
              path: '/coverage/objects/-',
              value: { name: 'PCB 基板', nodes: ['base'] },
            },
            {
              op: 'add',
              path: '/coverage/interactions/-',
              value: {
                description: '单指拖动旋转视角',
                chapter: 0,
                targets: ['hero'],
                properties: ['explore'],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(cleanReview);
    const result = await generateCinematicExplainer(prompt, 0, ai);
    expect(ai).toHaveBeenCalledTimes(4);
    for (const index of [1, 2, 3])
      expect(JSON.parse(ai.mock.calls[index][1]).frozenRequirements).toMatchObject({
        requiredObjects: ['PCB 基板'],
        requiredInteractions: ['单指拖动旋转视角'],
        interactionRequirements: [{ description: '单指拖动旋转视角', kind: 'view' }],
      });
    expect(result.content).toMatchObject({
      cinematicValidation: {
        geometricQuality: {
          interactionEvidence: expect.arrayContaining([
            expect.objectContaining({
              description: '单指拖动旋转视角',
              kind: 'view',
              status: 'PASS',
            }),
          ]),
        },
      },
    });
  });
  it('does not let approximate tiny-object warnings trigger teaching-track repair', async () => {
    const scene = valid();
    scene.assembly!.placements = scene.assembly!.placements.filter(
      (placement) => placement.node !== 'logic',
    );
    scene.nodes[2].position = [150, 0, 0];
    const ai = vi.fn();
    const result = await validateAndRepairCinematicScene(scene, {}, ai);
    expect(result.quality.status).toBe('PASS');
    expect(
      result.quality.issues.some(
        (issue) => issue.code === 'subject-too-small' && issue.severity === 'warning',
      ),
    ).toBe(true);
    expect(ai).not.toHaveBeenCalled();
    expect(result.scene.tracks).toEqual(scene.tracks);
  });
  it('returns a failed geometry patch path to the next repair instead of losing its evidence', async () => {
    const scene = valid();
    scene.nodes.push({ ...scene.nodes[0], id: 'duplicate' });
    const ai = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({ patches: [{ op: 'remove', path: '/nodes/@invented' }] }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({ patches: [{ op: 'remove', path: '/nodes/@duplicate' }] }),
      );
    const result = await validateAndRepairCinematicScene(scene, {}, ai);
    expect(result.quality.status).toBe('PASS');
    expect(JSON.parse(ai.mock.calls[1][1]).previousPatchError).toContain('/nodes/@invented');
  });
  it('cannot clear unsupported operation promises through a later empty review without implementation', async () => {
    const unsupported = '阀门连续开度和逐部件顺序拆卸没有真实轨道或控件，不能以旁白和发光代替';
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(valid()))
      .mockResolvedValueOnce(JSON.stringify({ issues: [unsupported], patches: [] }))
      .mockResolvedValue(cleanReview);
    await expect(generateCinematicExplainer(input, 0, ai)).rejects.toThrow(unsupported);
    expect(ai).toHaveBeenCalledTimes(5);
    for (const index of [3, 4]) {
      expect(JSON.parse(ai.mock.calls[index][1]).previousUnresolvedIssues).toEqual([unsupported]);
      expect(ai.mock.calls[index][0]).toContain('整体explode不等于按顺序逐部件拆卸');
    }
  });
});

describe('server-only deterministic teaching-group framing', () => {
  const grouped = () => {
    const scene = valid();
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'support-assembly',
      kind: 'group',
      model: undefined,
      assetRole: undefined,
      position: [0, 0, 0],
      params: {},
    });
    scene.nodes[0].parent = 'support-assembly';
    scene.nodes[2].parent = 'support-assembly';
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'floor',
      kind: 'plane',
      model: undefined,
      assetRole: undefined,
      role: 'decoration',
      params: { width: 50, height: 50 },
    });
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'ornament',
      kind: 'box',
      model: undefined,
      assetRole: undefined,
      role: 'decoration',
      params: { width: 1, height: 1, depth: 1 },
    });
    scene.shots.forEach((shot) => {
      shot.frame!.nodes = ['support-assembly'];
    });
    return scene;
  };
  it('expands group framing to real teaching descendants and excludes floor/decoration', () => {
    const scene = grouped(),
      before = structuredClone(scene);
    expect(() => parseCinematicScene(scene)).toThrow('取景主体');
    const converted = parseCinematicCandidate(scene);
    expect(converted.shots[0].frame!.nodes).toEqual(['hero', 'logic']);
    expect(converted.nodes).toEqual(before.nodes);
    expect(converted.tracks).toEqual(before.tracks);
    expect(scene).toEqual(before);
    expect(parseCinematicScene(converted)).toEqual(converted);
  });
  it('rejects groups consisting only of floors or decorations without broadening frame scope', () => {
    const scene = grouped();
    scene.nodes[0].parent = undefined;
    scene.nodes[2].parent = undefined;
    expect(() => parseCinematicCandidate(scene)).toThrow('没有可取景的实际教学实体');
  });
  it('does not silently truncate an oversized group to fit the node limit', () => {
    const scene = grouped();
    for (let index = 0; index < 13; index++)
      scene.nodes.push({
        ...scene.nodes[0],
        id: `part-${index}`,
        kind: 'box',
        model: undefined,
        assetRole: undefined,
        params: { width: 0.2, height: 0.2, depth: 0.2 },
      });
    expect(() => parseCinematicCandidate(scene)).toThrow('展开后超过12');
  });
});
