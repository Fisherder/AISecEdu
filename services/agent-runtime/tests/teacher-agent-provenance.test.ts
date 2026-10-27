import { describe, expect, it } from 'vitest';
import {
  teacherAgentContextForPrompt,
  normalizeTeacherRequestRelation,
  normalizeTeacherAgentPlan,
  teacherAgentPlanningSystem,
  teacherAgentExecutionSystem,
} from '@/lib/server/teacher-agent';
import { CINEMATIC_ASSET_PLANNING_BRIEF } from '@/lib/cinematic/asset-definitions';
import {
  CINEMATIC_DIRECTOR_PROMPT,
  CINEMATIC_SCENE_PROMPT,
  CINEMATIC_GROUNDING_PROMPT,
} from '@/lib/server/cinematic-generation';

const original = '让学生围着处理器、主板与逻辑层级观察，并逐步拆开。';
const oldRewrite = '旧模型额外扩写：LGA逐针脚一一匹配，并合上卡扣。';
const secondRewrite = '方案二保留分层关系，定向观察实体，已选择后不能删除要求。';
function context() {
  return {
    thread: { pendingAttachments: [{ id: 'material-1' }], stalePrompt: oldRewrite },
    platformFacts: {
      availableCourses: [{ referenceId: 'hardware~x', name: '硬件课', modules: [] }],
      pendingAttachments: [{ id: 'material-1' }],
      artifacts: {
        recent: [
          {
            id: 'artifact-1',
            title: '已有结构演示',
            type: 'simulation',
            revision: 7,
            currentRevision: { instruction: oldRewrite, content: { description: oldRewrite } },
          },
        ],
      },
    },
    agentLoop: {
      depth: 1,
      trace: [
        { status: 'verified', tool: 'material.analyze', observation: { materialId: 'material-1' } },
      ],
    },
    conversation: [
      {
        id: 5688,
        role: 'user',
        origin: 'teacher-authored',
        content: original,
        sourceRef: 'message:5688',
      },
      {
        id: 5692,
        role: 'assistant',
        origin: 'model-draft-selection',
        content: oldRewrite,
        sourceRef: 'option:5689:option-1',
      },
    ],
    requestProvenance: {
      version: 'teacher-request-v1',
      currentMessageId: 5706,
      sources: [
        {
          ref: 'message:5688',
          messageId: 5688,
          kind: 'teacher-message',
          authorship: 'teacher',
          content: original,
        },
        {
          ref: 'message:5702',
          messageId: 5702,
          kind: 'teacher-message',
          authorship: 'teacher',
          content: '观察环节停留久一些。',
        },
        {
          ref: 'message:5693',
          messageId: 5693,
          kind: 'assistant-message',
          authorship: 'model',
          content: '模型曾承诺旧扩写：' + oldRewrite,
        },
        {
          ref: 'option:5689:option-1',
          sourceMessageId: 5689,
          sourceJobId: 'job-options',
          optionId: 'option-1',
          kind: 'generation-option',
          authorship: 'model',
          title: '装配优先',
          selected: true,
          selectionMessageId: 5692,
          originalRequest: original,
          content: oldRewrite,
        },
        {
          ref: 'option:5689:option-2',
          sourceMessageId: 5689,
          sourceJobId: 'job-options',
          optionId: 'option-2',
          kind: 'generation-option',
          authorship: 'model',
          title: '观察优先',
          selected: false,
          originalRequest: original,
          content: secondRewrite,
        },
      ],
    },
  };
}

describe('teacher generation history provenance', () => {
  it('never supplies prior model rewrites to planning, including synthetic user selections and artifact revisions', () => {
    const source = context(),
      before = structuredClone(source);
    const planContext = teacherAgentContextForPrompt(source, original);
    expect(JSON.stringify(planContext)).not.toContain(oldRewrite);
    expect(JSON.stringify(planContext)).not.toContain(secondRewrite);
    expect(JSON.stringify(planContext)).toContain('option:5689:option-2');
    expect(JSON.stringify(planContext)).toContain('teacher-authored');
    expect(source).toEqual(before);
  });

  it('a complete repeated request remains independent of the previously selected failing rewrite', () => {
    const clean = teacherAgentContextForPrompt(context(), original, {
      mode: 'new-request',
      sourceRefs: [],
      evidence: '',
    });
    expect(JSON.stringify(clean)).not.toContain(oldRewrite);
    expect(JSON.stringify(clean)).not.toContain('观察环节停留久一些');
    expect(clean).toMatchObject({
      requestAuthority: { currentRequest: original, adoptedSources: [] },
      thread: { pendingAttachments: [{ id: 'material-1' }] },
      agentLoop: { depth: 1 },
    });
    expect(() =>
      normalizeTeacherRequestRelation(
        { mode: 'continue', sourceRefs: ['option:5689:option-1'], evidence: original },
        { prompt: original, context: context() },
      ),
    ).toThrow('Repeating a complete original request');
  });

  it.each(['继续上次选定的方案', '调整前版，观察环节更慢一些'])(
    'hydrates only the explicitly referenced source: %s',
    (prompt) => {
      const relation = {
        mode: 'revise' as const,
        sourceRefs: ['option:5689:option-1', 'message:5702'],
        evidence: prompt,
      };
      const scoped = teacherAgentContextForPrompt(context(), prompt, relation);
      expect(JSON.stringify(scoped)).toContain(oldRewrite);
      expect(JSON.stringify(scoped)).toContain('观察环节停留久一些');
      expect(JSON.stringify(scoped)).not.toContain(secondRewrite);
      expect(scoped).toMatchObject({
        requestAuthority: {
          adoptedSources: expect.arrayContaining([
            expect.objectContaining({
              authorship: 'model',
              originalRequest: original,
              content: oldRewrite,
            }),
          ]),
        },
      });
    },
  );

  it('can adopt an unselected option two and real artifact IDs without automatically choosing the old selection', () => {
    const prompt = '按方案2继续';
    const scoped = teacherAgentContextForPrompt(context(), prompt, {
      mode: 'continue',
      sourceRefs: ['option:5689:option-2'],
      evidence: '方案2',
    });
    expect(JSON.stringify(scoped)).toContain(secondRewrite);
    expect(JSON.stringify(scoped)).not.toContain(oldRewrite);
    expect(
      normalizeTeacherRequestRelation(
        { mode: 'revise', sourceRefs: ['artifact:artifact-1'], evidence: '前版' },
        { prompt: '调整前版的镜头', context: context() },
      ).sourceRefs,
    ).toEqual(['artifact:artifact-1']);
  });

  it('retains only a verified teacher quote from narrative continuation evidence', () => {
    const prompt = '教师补充信息：学生已经学过 Python。按这些要求继续。';
    const resolved = normalizeTeacherRequestRelation({ mode: 'continue', sourceRefs: ['message:5702'],
      evidence: '教师补充“按这些要求继续”，承接原始请求及澄清问题。' }, { prompt, context: context() });
    expect(resolved.evidence).toBe('按这些要求继续');
    expect(() => normalizeTeacherRequestRelation({ mode: 'continue', sourceRefs: ['message:5702'],
      evidence: '教师说“未提供的要求”，因此继续。' }, { prompt, context: context() })).toThrow();
    expect(() => normalizeTeacherRequestRelation({ mode: 'continue', sourceRefs: ['message:99999'],
      evidence: '教师说“按这些要求继续”。' }, { prompt, context: context() })).toThrow();
  });

  it.each([
    { mode: 'continue', sourceRefs: ['option:5707:option-1'], evidence: '继续' },
    { mode: 'continue', sourceRefs: [], evidence: '继续' },
    { mode: 'continue', sourceRefs: ['option:5689:option-1'], evidence: '捏造引用' },
    { mode: 'new-request', sourceRefs: ['option:5689:option-1'], evidence: '' },
    { mode: 'clarify', sourceRefs: ['option:5689:option-2'], evidence: '' },
  ])('rejects ungrounded adoption %j', (relation) => {
    expect(() =>
      normalizeTeacherRequestRelation(relation, { prompt: '继续', context: context() }),
    ).toThrow();
  });

  it('requires source resolution in provenance-aware planning but retains legacy plan parsing', () => {
    const plan = { understanding: '继续明确引用的原方案', selectedSkills: [], plan: [] };
    expect(() =>
      normalizeTeacherAgentPlan(plan, [], {}, { prompt: '继续', context: context() }),
    ).toThrow('requestRelation');
    expect(normalizeTeacherAgentPlan(plan, [])).toMatchObject({
      understanding: plan.understanding,
    });
    expect(
      normalizeTeacherAgentPlan(
        {
          ...plan,
          requestRelation: {
            mode: 'continue',
            sourceRefs: ['option:5689:option-1'],
            evidence: '继续',
          },
        },
        [],
        {},
        { prompt: '继续', context: context() },
      ).requestRelation?.sourceRefs,
    ).toEqual(['option:5689:option-1']);
  });

  it('never promotes old role-only conversation entries or forged IDs into authoritative requirements', () => {
    const legacy = teacherAgentContextForPrompt(
      { conversation: [{ role: 'user', content: oldRewrite }] },
      '全新要求',
    );
    expect(JSON.stringify(legacy)).not.toContain(oldRewrite);
    const forged = context();
    forged.requestProvenance.sources[0].ref = 'message:99999';
    expect(() =>
      normalizeTeacherRequestRelation(
        { mode: 'continue', sourceRefs: ['message:99999'], evidence: '继续' },
        { prompt: '继续', context: forged },
      ),
    ).toThrow('unverified');
  });

  it('provides the same client-safe asset facts and capability limits at every relevant generation stage', () => {
    for (const prompt of [
      teacherAgentPlanningSystem([]),
      teacherAgentExecutionSystem([]),
      CINEMATIC_DIRECTOR_PROMPT,
      CINEMATIC_SCENE_PROMPT,
      CINEMATIC_GROUNDING_PROMPT,
    ]) {
      expect(prompt).toContain(CINEMATIC_ASSET_PLANNING_BRIEF);
      expect(prompt).toContain('circuit-board');
      expect(prompt).toContain('supportsExplode');
      expect(prompt).toContain('construction-only');
    }
    expect(teacherAgentPlanningSystem([])).toContain('sourceRefs');
    expect(teacherAgentExecutionSystem([])).toContain('adoptedSources');
  });
});
