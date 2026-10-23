import { describe, expect, it, vi } from 'vitest';
import {
  CINEMATIC_SCENE_PROMPT,
  validateAndRepairCinematicScene,
} from '@/lib/server/cinematic-generation';
import { resolveCinematicAssembly } from '@/lib/cinematic/assembly';
import { CINEMATIC_INTERACTION_BRIEF } from '@/lib/cinematic/capabilities';
import { assemblySceneFixture } from '../../fixtures/cinematic-assembly';

describe('repair receives measured scene evidence instead of only a generic error', () => {
  it('passes the failing relation counts and preserves the actual scene and frozen requirements', async () => {
    const valid = resolveCinematicAssembly(assemblySceneFixture()).scene;
    const input = structuredClone(valid);
    delete input.assembly;
    const before = structuredClone(input);
    const options = { requireComposition: true, requiredObjects: ['处理器结构'] };
    const context = { request: { originalRequest: '按原要求装配好部件并观察内部' } };
    const ai = vi.fn().mockResolvedValue(
      JSON.stringify({
        patches: [{ op: 'add', path: '/assembly', value: valid.assembly }],
      }),
    );
    const result = await validateAndRepairCinematicScene(input, context, ai, options);
    expect(ai).toHaveBeenCalledTimes(1);
    const repair = JSON.parse(ai.mock.calls[0][1]);
    expect(repair.scene).toEqual(before);
    expect(repair.request).toEqual(context.request);
    expect(repair.frozenRequirements).toEqual(options);
    expect(repair.qualityReport.status).toBe('FAIL');
    expect(repair.qualityReport.metrics).toMatchObject({
      teachingNodes: 3,
      detailedModels: 3,
      relations: 0,
    });
    expect(repair.qualityReport.issues).toContainEqual(
      expect.objectContaining({
        code: 'composition-assembly',
        severity: 'error',
      }),
    );
    expect(result.quality.status).toBe('PASS');
    expect(result.scene.tracks).toEqual(valid.tracks);
    expect(input).toEqual(before);
  });

  it('explains actual chapter timing, drawable actors and explicit assembly without a domain template', () => {
    expect(CINEMATIC_SCENE_PROMPT).toContain('chapter是从0开始的chapters数组索引，不是秒数');
    expect(CINEMATIC_SCENE_PROMPT).toContain('仅有其他章节的轨道不能证明本章动作');
    expect(CINEMATIC_SCENE_PROMPT).toContain('plane和points不作为教学取景主体或交互执行实体');
    expect(CINEMATIC_SCENE_PROMPT).toContain('已有足够的真实parent关系或唯一教学实体为合格完整精细资产时可省略assembly');
    expect(CINEMATIC_SCENE_PROMPT).toContain('不为过检查添加无关部件');
    expect(CINEMATIC_SCENE_PROMPT).not.toContain('为可选装配');
    expect(CINEMATIC_INTERACTION_BRIEF).toContain('静态初始结构与运行时动作要区分');
    expect(CINEMATIC_INTERACTION_BRIEF).toContain(
      '完整保留在objects/visualPriorities和后续装配合同中',
    );
    expect(CINEMATIC_INTERACTION_BRIEF).toContain('就必须作为structural-change交互逐项保留');
  });
});
