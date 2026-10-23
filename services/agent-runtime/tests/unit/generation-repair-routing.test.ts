import { describe, expect, it } from 'vitest';
import { diagnoseGenerationRepair, validateGenerationRepairRouting } from '@/lib/generation/repair-routing';

const context = {
  learningRequest: {teacherRequest: '必须让学习者实际操作范围控件。'},
  learningPlan: {goals: [{understanding: '理解安全区、临界区和破坏区。'}]},
  candidate: {chapters: [{explanation: '三台设备彼此传播故障。'}]},
  scene: {connections: [{from: 'drive', to: 'machine-a'}]},
  issues: ['学习目标缺少明确操作要求'],
  copyFields: [{path: 'chapters.0.explanation', text: '三台设备彼此传播故障。'}],
  planFields: [{path: 'goals.0.understanding', text: '理解安全区、临界区和破坏区。'}],
};

describe('generation repair routing', () => {
  it('normalizes a cited parent plan field to its concrete editable field', () => {
    const routing = validateGenerationRepairRouting(context, {
      version: 'generation-repair-routing-v1',
      findings: [{
        issueIndices: [0],
        target: 'learning-plan',
        fields: ['goals'],
        reason: '教师明确要求可操作目标，而计划只写了概念理解，需要补回明确目标。',
        evidence: [
          {source: 'learningRequest', path: 'teacherRequest', quote: '实际操作范围控件'},
          {source: 'learningPlan', path: 'goals.0.understanding', quote: '理解安全区'},
        ],
      }],
    });

    expect(routing.findings[0].fields).toEqual(['goals.0.understanding']);
  });

  it('still rejects an uncited or nonexistent parent field', () => {
    expect(() => validateGenerationRepairRouting(context, {
      version: 'generation-repair-routing-v1',
      findings: [{
        issueIndices: [0],
        target: 'learning-plan',
        fields: ['objectives'],
        reason: '教师明确要求可操作目标，而计划只写了概念理解，需要补回明确目标。',
        evidence: [
          {source: 'learningRequest', path: 'teacherRequest', quote: '实际操作范围控件'},
          {source: 'learningPlan', path: 'goals.0.understanding', quote: '理解安全区'},
        ],
      }],
    })).toThrow('Repair must name actual editable fields for its target');
  });

  it('uses the direct review model policy for repair diagnosis', async () => {
    const aiCall = async (
      _system: string,
      _input: string,
      _images?: Array<{id: string; src: string}>,
      options?: {stage?: 'cinematic-review'},
    ) => {
      expect(options).toEqual({stage: 'cinematic-review'});
      return JSON.stringify({
        version: 'generation-repair-routing-v1',
        findings: [{
          issueIndices: [0],
          target: 'copy',
          fields: ['chapters.0.explanation'],
          reason: '讲解文字没有说明传播条件，需要在原字段内补充准确限定。',
          evidence: [{
            source: 'candidate',
            path: 'chapters.0.explanation',
            quote: '彼此传播故障',
          }],
        }],
      });
    };

    await expect(diagnoseGenerationRepair(context, aiCall)).resolves.toMatchObject({
      version: 'generation-repair-routing-v1',
      findings: [{target: 'copy'}],
    });
  });

  it('grounds scene routing in canonical request and scene evidence when the model omits citations', () => {
    const routing = validateGenerationRepairRouting(context, {
      version: 'generation-repair-routing-v1',
      findings: [{
        issueIndices: [0],
        target: 'scene',
        fields: ['chapters.0.explanation'],
        reason: '操作目标需要真实场景控件和状态变化，不能只修改讲解文字。',
        evidence: [{
          source: 'candidate',
          path: 'chapters.0.explanation',
          quote: '彼此传播故障',
        }],
      }],
    });

    expect(routing.findings[0]).toMatchObject({target: 'scene', fields: []});
    expect(routing.findings[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({source: 'learningRequest', path: 'teacherRequest'}),
      expect.objectContaining({source: 'scene'}),
    ]));
  });

  it('replaces stale scene indices with evidence from the current repaired scene', () => {
    const routing = validateGenerationRepairRouting(context, {
      version: 'generation-repair-routing-v1',
      findings: [{
        issueIndices: [0], target: 'review', fields: [],
        reason: '审校要求与修复后的真实场景不一致，需要用当前场景重新核对。',
        evidence: [{source: 'scene', path: 'nodes.32.kind', quote: 'box'}],
      }],
    });

    expect(routing.findings[0].evidence.some(reference=>reference.path==='nodes.32.kind')).toBe(false);
    expect(routing.findings[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({source: 'learningRequest'}),
      expect.objectContaining({source: 'scene'}),
    ]));
  });

  it('conservatively sends every omitted review issue back to scene repair', () => {
    const expanded={...context,issues:[...context.issues,'场景缺少第二项可见证据']};
    const routing=validateGenerationRepairRouting(expanded,{
      version:'generation-repair-routing-v1',
      findings:[{
        issueIndices:[0],target:'copy',fields:['chapters.0.explanation'],
        reason:'第一项只是讲解遗漏传播条件，可在原说明字段内准确修复。',
        evidence:[{source:'candidate',path:'chapters.0.explanation',quote:'彼此传播故障'}],
      }],
    });

    expect(routing.findings).toHaveLength(2);
    expect(routing.findings[1]).toMatchObject({issueIndices:[1],target:'scene',fields:[]});
    expect(routing.findings[1].evidence.map(reference=>reference.source).sort()).toEqual(['learningRequest','scene']);
  });

  it('drops an undefined optional scene citation while retaining the required editable evidence', () => {
    const routing = validateGenerationRepairRouting({
      ...context, scene: {nodes: [{modelSemantics: undefined}]},
    }, {
      version: 'generation-repair-routing-v1',
      findings: [{
        issueIndices: [0], target: 'copy', fields: ['chapters.0.explanation'],
        reason: '原文说明遗漏了传播条件，修改讲解即可补上准确限定。',
        evidence: [
          {source: 'candidate', path: 'chapters.0.explanation', quote: '彼此传播故障'},
          {source: 'scene', path: 'nodes.0.modelSemantics', quote: '未定义'},
        ],
      }],
    });
    expect(routing.findings[0].evidence).toEqual([
      {source: 'candidate', path: 'chapters.0.explanation', quote: '彼此传播故障'},
    ]);
  });
});
