import { describe, it, expect, vi } from 'vitest';
import {
  generateCinematicExplainer,
  validateAndRepairCinematicScene,
  CinematicQualityError,
  CINEMATIC_DIRECTOR_PROMPT,
  CINEMATIC_SCENE_PROMPT,
} from '@/lib/server/cinematic-generation';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { extractCinematicScene } from '@/lib/cinematic/schema';
import { assemblySceneFixture, assemblyDirectorFixture } from '../../fixtures/cinematic-assembly';

describe('ordinary model cinematic assembly and bounded repair pipeline', () => {
  const valid = () => resolveCinematicAssembly(assemblySceneFixture()).scene;
  it('passes ordinary Chinese intent intact through director, geometry generation and semantic review', async () => {
    const visualIntent = {
      mode: 'cinematic-v1',
      reason: '让学生围着结构观察内部层次',
      objects: ['处理器结构', '承载电路板', '逻辑层级'],
      interactions: ['逐步拆开观察内部'],
      visualPriorities: ['支持结构和逻辑层分区', '有机构特写'],
    };
    const input = {
      type: 'visualization3d' as const,
      title: '观察处理器内部与逻辑层级',
      description: JSON.stringify({
        request: '想让学生围着看清处理器和承载板，逐步拆开，旁边对比逻辑层级。',
        plan: { visualIntent },
      }),
    };
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(assemblySceneFixture()))
      .mockResolvedValueOnce(JSON.stringify({ issues: [], patches: [] }));
    const artifact = await generateCinematicExplainer(input, 0, ai);
    expect(ai).toHaveBeenCalledTimes(3);
    for (const call of ai.mock.calls)
      expect(
        JSON.parse(call[1]).request?.visualIntent ?? JSON.parse(call[1]).visualIntent,
      ).toMatchObject({ objects: visualIntent.objects, interactions: visualIntent.interactions });
    const sceneRequest = JSON.parse(ai.mock.calls[1][1]);
    expect(
      sceneRequest.assetGeometry.some(
        (asset: { kind: string; ports: unknown }) => asset.kind === 'circuit-board' && asset.ports,
      ),
    ).toBe(true);
    expect(
      sceneRequest.assetGeometry.find((asset: { kind: string }) => asset.kind === 'circuit-board')
        .ports['cpu-socket'],
    ).toMatchObject({ dynamic: false });
    expect(artifact.content).toMatchObject({
      renderingMode: 'cinematic-v1',
      cinematicValidation: {
        rendererVersion: '2026-09-13.5',
        geometricQuality: { status: 'PASS', visualReview: 'NOT_PERFORMED' },
        repair: { geometryRepairs: 0 },
        visualReview: 'REQUIRED',
        humanReview: 'NOT_PERFORMED',
        runtimeRender: 'NOT_PERFORMED',
      },
    });
    expect(
      extractCinematicScene((artifact.content as { html: string }).html)?.shots.every(
        (shot) => shot.frame,
      ),
    ).toBe(true);
  });
  it('repairs geometry rather than substituting captions when a collision is found', async () => {
    const scene = valid();
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'duplicate',
      position: [...scene.nodes[0].position],
    });
    const ai = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({ patches: [{ op: 'remove', path: '/nodes/@duplicate' }] }),
      );
    const result = await validateAndRepairCinematicScene(
      scene,
      { request: { description: '观察承载与处理器结构' } },
      ai,
    );
    expect(result.repairs).toBe(1);
    expect(result.quality.status).toBe('PASS');
    expect(result.attempts[0].issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'geometry-overlap' })]),
    );
    expect(ai.mock.calls[0][1]).toContain('geometry-overlap');
    expect(result.scene.chapters).toEqual(scene.chapters);
    expect(scene.nodes).toHaveLength(4);
  });
  it('never accepts subtitle-only repair of a structural collision, and caps AI attempts', async () => {
    const scene = valid();
    scene.nodes.push({
      ...scene.nodes[0],
      id: 'duplicate',
      position: [...scene.nodes[0].position],
    });
    let index = 0;
    const ai = vi.fn(async () =>
      JSON.stringify({
        patches: [{ op: 'replace', path: '/subtitle', value: `只是概念模型${++index}` }],
      }),
    );
    await expect(validateAndRepairCinematicScene(scene, {}, ai)).rejects.toThrow(
      '2次有界SceneIR修复',
    );
    expect(ai).toHaveBeenCalledTimes(2);
    expect(scene.subtitle).not.toContain('只是概念模型');
  });
  it('records invalid repair patches and fails explicitly without a flat fallback', async () => {
    const scene = valid();
    scene.shots.forEach((shot) => {
      delete shot.frame;
    });
    const ai = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({
          patches: [{ op: 'replace', path: '/nodes/@invented/position', value: [0, 0, 0] }],
        }),
      );
    try {
      await validateAndRepairCinematicScene(scene, {}, ai);
      throw Error('expected quality failure');
    } catch (error) {
      expect(error).toBeInstanceOf(CinematicQualityError);
      expect((error as CinematicQualityError).attempts).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: 'PATCH_FAILED' })]),
      );
    }
    expect(ai).toHaveBeenCalledTimes(2);
  });
  it('repairs a real assembly error with exact catalog ports in the model context', async () => {
    const scene = valid();
    scene.assembly!.placements[1] = {
      mode: 'port',
      node: 'hero',
      reference: 'base',
      port: 'invented',
      referencePort: 'cpu-socket',
      gap: 0,
      offset: [0, 0, 0],
    };
    const ai = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({
          patches: [
            {
              op: 'replace',
              path: '/assembly/placements/1',
              value: {
                mode: 'relative',
                node: 'hero',
                reference: 'base',
                side: 'above',
                gap: 0.2,
                offset: [0, 0, 0],
              },
            },
          ],
        }),
      );
    const result = await validateAndRepairCinematicScene(scene, {}, ai);
    expect(result.repairs).toBe(1);
    expect(ai.mock.calls[0][1]).toContain('真实端口');
    expect(result.quality.status).toBe('PASS');
  });
  it('semantic reviewer may repair real entity representation and must review the resulting scene again', async () => {
    const scene = valid();
    scene.nodes[0].represents = '阀门';
    scene.nodes[0].label = '阀门';
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(scene))
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: ['processor不能冒充阀门，原需求是观察处理器，恢复正确语义'],
          patches: [
            { op: 'replace', path: '/nodes/@hero/represents', value: '处理器结构' },
            { op: 'replace', path: '/nodes/@hero/label', value: '处理器' },
          ],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ issues: [], patches: [] }));
    const artifact = await generateCinematicExplainer(
      { type: 'visualization3d', title: '处理器' },
      0,
      ai,
    );
    expect(ai).toHaveBeenCalledTimes(4);
    expect(JSON.parse(ai.mock.calls[3][1]).scene.nodes[0].represents).toBe('处理器结构');
    expect(artifact.content).toMatchObject({
      cinematicDirection: { groundingReview: { patchCount: 2, finalIssues: [] } },
      cinematicValidation: { repair: { semanticRepairs: 1 } },
    });
  });
  it('semantic changes that introduce broken geometry still enter geometric repair', async () => {
    const scene = valid();
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(scene))
      .mockResolvedValueOnce(
        JSON.stringify({
          issues: ['新增重复件需独立摆放'],
          patches: [{ op: 'add', path: '/nodes/-', value: { ...scene.nodes[0], id: 'extra' } }],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          patches: [
            {
              op: 'add',
              path: '/assembly/placements/-',
              value: {
                mode: 'relative',
                node: 'extra',
                reference: 'hero',
                side: 'left',
                gap: 2,
                offset: [0, 0, 0],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(JSON.stringify({ issues: [], patches: [] }));
    const artifact = await generateCinematicExplainer(
      { type: 'visualization3d', title: '处理器对比' },
      0,
      ai,
    );
    expect(ai).toHaveBeenCalledTimes(5);
    expect(artifact.content).toMatchObject({
      cinematicValidation: { repair: { geometryRepairs: 1, semanticRepairs: 1 } },
    });
  });
  it('does not promote protocol-valid malformed role declarations into visual approval', () => {
    expect(CINEMATIC_DIRECTOR_PROMPT).toContain('禁止同一model');
    expect(CINEMATIC_SCENE_PROMPT).toContain('dynamic:true');
    expect(CINEMATIC_SCENE_PROMPT).toContain('frame:{nodes:');
    expect(CINEMATIC_SCENE_PROMPT).not.toContain('半径约2.15');
    expect(CINEMATIC_SCENE_PROMPT).toContain('assetRole');
  });
});
