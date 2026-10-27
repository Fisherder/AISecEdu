import { describe, expect, it } from 'vitest';
import { applyTeacherIntent, normalizeTeacherIntent } from '@/lib/server/agent-harness/teacher-intent';

const task = (kind: string, extra = {}) => ({ kind, summary: '为初学者设计三十分钟的安全编码课程', needsClarification: false, questions: [], ...extra });
const authority = (context = {}) => ({ prompt: '为初学者设计三十分钟的安全编码课程', context });

describe('semantic teaching intent and requirement clarification', () => {
  it('answers ordinary questions without creating content or asking a design question', () => {
    const decision = normalizeTeacherIntent(task('answer'), authority());
    expect(decision.executionMode).toBe('ask');
    expect(decision.clarification.state).toBe('not-required');
    expect(applyTeacherIntent({ answer: '解释', deliverables: [{ title: 'unexpected' }], toolProposals: [{}] }, decision).toolProposals).toEqual([]);
  });
  it.each(['plan', 'create'])('pauses a first %s request before finalizing anything', kind => {
    const decision = normalizeTeacherIntent(task(kind), authority());
    expect(decision.clarification.questions).toHaveLength(1);
    const result = applyTeacherIntent({ answer: '已生成', plan: ['最终方案'], deliverables: [{}], generationOptions: {} }, decision);
    expect(result.interaction.state).toBe('awaiting-input');
    expect(result.plan).toEqual([]);
    expect(result.deliverables).toEqual([]);
    expect(result.generationOptions).toBeNull();
  });
  it('uses project-specific questions and never preselects an answer', () => {
    const decision = normalizeTeacherIntent(task('create', { needsClarification: true, questions: [{ id: 'audience', text: '学生是否已经学过 C 指针？', choices: ['已经学过', '尚未学过'] }] }), authority());
    expect(decision.clarification.questions[0]).toEqual({ id: 'audience', text: '学生是否已经学过 C 指针？', choices: ['已经学过', '尚未学过'], allowFreeText: true });
  });
  it('continues a verified question reply without asking the same thing again', () => {
    const context = { questionReply: { round: 1, originalRequest: '生成课件', answers: [{ question: '学生是否已经学过 C 指针？', answer: '已经学过' }] } };
    const decision = normalizeTeacherIntent(task('create'), authority(context));
    expect(decision.clarification.state).toBe('confirmed');
    expect(decision.clarification.questions).toEqual([]);
  });
  it('preserves confirmed requirements when naturally revising a previous result', () => {
    const previous = normalizeTeacherIntent(task('create'), authority({ questionReply: { answers: [{ question: '范围？', answer: '安全编码' }] } }));
    const context = { requestProvenance: { sources: [{ ref: 'message:4', intentDecision: previous }] } };
    const decision = normalizeTeacherIntent(task('revise'), { prompt: '改成十五分钟，保留全部示例。', context }, { mode: 'revise', sourceRefs: ['message:4'] });
    expect(decision.request).toContain(previous.request);
    expect(decision.request).toContain('保留全部示例');
    expect(decision.clarification.state).toBe('confirmed');
    expect(decision.executionMode).toBe('execute');
  });
  it('does not inherit unrelated previous confirmation into a new creation', () => {
    const context = { requestProvenance: { sources: [{ ref: 'message:4', intentDecision: { version: 'teacher-intent-v1', clarification: { state: 'confirmed' } } }] } };
    expect(normalizeTeacherIntent(task('create'), authority(context), { mode: 'new-request', sourceRefs: [] }).clarification.state).toBe('awaiting-input');
  });
  it('asks for the adjustment once and accepts the subsequent freeform answer', () => {
    const reply = { round: 1, answers: [{ question: '是否继续？', answer: '我还要补充或调整' }] };
    const waiting = normalizeTeacherIntent(task('plan'), authority({ questionReply: reply }));
    expect(waiting.clarification.questions[0].id).toBe('requirement_changes');
    const answers = [...reply.answers, { question: '你希望补充或调整哪些要求？', answer: '改成十五分钟，保留示例。' }];
    const confirmed = normalizeTeacherIntent(task('plan'), authority({ questionReply: { round: 2, answers } }));
    expect(confirmed.clarification.state).toBe('confirmed');
    expect(confirmed.clarification.questions).toEqual([]);
  });
  it('keeps natural edits to an unexecuted plan read only', () => {
    const prior = normalizeTeacherIntent(task('plan'), authority({ questionReply: { answers: [{ answer: '按这些要求继续' }] } }));
    const decision = normalizeTeacherIntent(task('plan'), authority({ requestProvenance: { sources: [{ ref: 'message:8', intentDecision: prior }] } }), { mode: 'revise', sourceRefs: ['message:8'] });
    const output = applyTeacherIntent({ toolProposals: [{ tool: 'candidate.generate' }], deliverables: [{}] }, decision);
    expect(output.executionMode).toBe('plan');
    expect(output.toolProposals).toEqual([]);
    expect(output.deliverables).toEqual([]);
  });
  it('fails closed rather than guessing an invalid or missing intent', () => {
    expect(() => normalizeTeacherIntent(null, authority())).toThrow();
    expect(() => normalizeTeacherIntent(task('generate-everything'), authority())).toThrow();
  });
});
