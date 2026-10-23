import { describe, expect, it, vi } from 'vitest';
import {
  generateCinematicExplainer,
  validateAndRepairCinematicScene,
} from '@/lib/server/cinematic-generation';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { assemblySceneFixture, assemblyDirectorFixture } from '../../fixtures/cinematic-assembly';

const input = { type: 'visualization3d' as const, title: '观察真实组合结构' };
const valid = () => resolveCinematicAssembly(assemblySceneFixture()).scene;
const cleanReview = '{"issues":[],"patches":[]}';

describe('cinematic conservative JSON integration', () => {
  it('records punctuation-only repairs in director, scene and semantic review without extra model calls', async () => {
    const scene = valid();
    const ai = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify(assemblyDirectorFixture).replace(',"visualThesis":', ' "visualThesis":'),
      )
      .mockResolvedValueOnce(JSON.stringify(scene).replace(',"title":', ' "title":'))
      .mockResolvedValueOnce('{"issues":[],"patches":[],}');
    const artifact = await generateCinematicExplainer(input, 0, ai);
    expect(ai).toHaveBeenCalledTimes(3);
    expect(artifact.content).toMatchObject({ cinematicScene: scene });
    const attempts = (
      artifact.content as {
        cinematicValidation: {
          repair: { attempts: Array<{ status: string; issues: Array<{ stage?: string }> }> };
        };
      }
    ).cinematicValidation.repair.attempts;
    expect(
      attempts
        .filter((attempt) => attempt.status === 'JSON_SYNTAX_REPAIRED')
        .map((attempt) => attempt.issues[0].stage),
    ).toEqual(['director', 'scene', 'grounding-review']);
  });
  it('keeps schema rejection after punctuation repair and repairs the retained raw value explicitly', async () => {
    const scene = valid();
    const raw = structuredClone(scene);
    raw.nodes[0].roughness = 0;
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValueOnce(JSON.stringify(raw).replace(',"title":', ' "title":'))
      .mockResolvedValueOnce(
        '{"patches":[{"op":"replace" "path":"/nodes/@hero/roughness","value":0.3,}],}',
      )
      .mockResolvedValueOnce(cleanReview);
    const artifact = await generateCinematicExplainer(input, 0, ai);
    expect(ai).toHaveBeenCalledTimes(4);
    const correction = JSON.parse(ai.mock.calls[2][1]);
    expect(correction.invalidScene.nodes[0].roughness).toBe(0);
    expect(
      correction.schemaErrors.some((error: { path: string }) => error.path.endsWith('roughness')),
    ).toBe(true);
    expect(artifact.content).toMatchObject({ cinematicScene: scene });
  });
  it('does not salvage a truncated scene or accept duplicate fields, and preserves the bounded retry count', async () => {
    const scene = valid();
    const raw = JSON.stringify(scene).slice(0, -1);
    const ai = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(assemblyDirectorFixture))
      .mockResolvedValue(raw);
    await expect(generateCinematicExplainer(input, 0, ai)).rejects.toThrow('三维场景合同');
    expect(ai).toHaveBeenCalledTimes(4);
    expect(JSON.parse(ai.mock.calls[2][1]).invalidResponse).toBe(raw);
    const duplicate = vi.fn().mockResolvedValue('{"title":"a","title":"b"}');
    await expect(generateCinematicExplainer(input, 0, duplicate)).rejects.toThrow('DUPLICATE_KEY');
    expect(duplicate).toHaveBeenCalledTimes(3);
  });
  it('uses the same conservative parser for geometry patches and still rechecks actual geometry', async () => {
    const scene = valid();
    scene.nodes.push({ ...scene.nodes[0], id: 'duplicate' });
    const ai = vi
      .fn()
      .mockResolvedValue('{"patches":[{"op":"remove" "path":"/nodes/@duplicate",}],}');
    const result = await validateAndRepairCinematicScene(scene, {}, ai);
    expect(result.quality.status).toBe('PASS');
    expect(result.repairs).toBe(1);
    expect(result.attempts).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'JSON_SYNTAX_REPAIRED' })]),
    );
  });
});
