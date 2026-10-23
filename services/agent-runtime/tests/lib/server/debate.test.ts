import { describe, expect, it, vi } from 'vitest';
import { debateSpecSchema, debateFromLesson, type DebateSpec } from '@/lib/debate/schema';
import { debateLesson, generateDebate, reviseDebate } from '@/lib/server/debate-generation';
import { debateDialogue } from '@/lib/server/debate-dialogue';
import { lessonToScenes } from '@/lib/server/lesson-publish';

export const spec: DebateSpec = {
  schema: 'debate-v1', title: '校园AI工具听证会', motion: '是否允许学生使用AI完成课后作业？',
  scenario: '学校正在修订学习工具规则，需要兼顾学习过程、可及性与独立思考。', studentRole: '学生代表',
  positions: {pro: '允许使用，但要披露使用过程并解释自己的推理。', con: '应限制用于作业答案，优先保护独立练习。'},
  objectives: ['区分辅助学习与代替思考', '根据证据提出有条件结论'],
  rounds: [{id: 'opening', title: '立论', task: '明确主张并说明依据'},
    {id: 'rebuttal', title: '反驳', task: '回应对方最强的反例'},
    {id: 'conclusion', title: '总结', task: '说明结论与适用边界'}],
  evidence: [{id: 'e1', title: '学习日志案例', content: '假设学生能够提交工具使用过程与自己的修订。', source: '教学假设，非真实统计', kind: 'hypothetical'},
    {id: 'e2', title: '独立解释案例', content: '假设部分学生能交作业但不能解释解题依据。', source: '教学假设，非真实统计', kind: 'hypothetical'}],
  rubric: [{id: 'knowledge', title: '概念理解', description: '准确区分辅助与代写'},
    {id: 'evidence', title: '证据推理', description: '说明证据与结论的关系'},
    {id: 'response', title: '回应与边界', description: '回应反例并指出条件'}],
  reflectionPrompts: ['什么证据改变了你的判断？', '哪些问题还需要查证？'],
};
const reply = {acknowledgement: '你提出有条件开放的主张。', argument: '过程披露是否能确保独立理解？',
  question: '如何核验学生自己的推理？', evidenceIds: ['e2'], coaching: {quote: '应当允许', feedback: '补充一项可核验条件。'}};
const message = '我认为应当允许使用AI，但必须提交自己的解释。';
const turns = spec.rounds.map((_, i) => ({id: `turn-${i + 1}`, round: i, student: message, reply}));

describe('structured AI debate', () => {
  it('preserves an interactive student activity through classroom conversion', () => {
    const lesson = debateLesson(spec, 'artifact_debate');
    expect(debateFromLesson(lesson)).toEqual(spec);
    const {scenes, stage} = lessonToScenes(lesson);
    expect(scenes[0].content).toMatchObject({debate: spec, debateArtifactId: 'artifact_debate'});
    expect(scenes[0].multiAgent).toBeUndefined();
    expect(stage.generatedAgentConfigs).toBeUndefined();
  });
  it('repairs invalid generated contracts with concrete feedback', async () => {
    const call = vi.fn().mockResolvedValueOnce(JSON.stringify({...spec, rounds: []})).mockResolvedValueOnce(JSON.stringify(spec));
    expect(await generateDebate({request: '学生与AI对练'}, call)).toEqual(spec);
    expect(call).toHaveBeenCalledTimes(2);
    expect(JSON.parse(call.mock.calls[1][1]).repair.failures[0].issues.length).toBeGreaterThan(0);
  });
  it('rejects duplicate evidence IDs and identical opposing positions', () => {
    expect(debateSpecSchema.safeParse({...spec, evidence: [spec.evidence[0], spec.evidence[0]]}).success).toBe(false);
    expect(debateSpecSchema.safeParse({...spec, positions: {pro: '一样', con: '一样'}}).success).toBe(false);
  });
  it('changes only the requested field while preserving the rest exactly', async () => {
    const result = await reviseDebate(spec, '只把学生身份改成家长代表', async () => JSON.stringify({changes: [{field: 'studentRole', value: '家长代表'}]}));
    expect(result.changedFields).toEqual(['studentRole']);
    expect(result.spec).toEqual({...spec, studentRole: '家长代表'});
    expect(spec.studentRole).toBe('学生代表');
  });
  it('rejects unknown patch fields rather than replacing the activity', async () => {
    await expect(reviseDebate(spec, '修改细节', async () => JSON.stringify({changes: [{field: '__proto__', value: {}}]}))).rejects.toThrow();
  });
  it('passes the student argument, entire history and opposite side to the model', async () => {
    const call = vi.fn().mockResolvedValue(JSON.stringify(reply));
    await debateDialogue({spec, side: 'pro', turns: turns.slice(0, 1), action: 'turn', message}, call);
    const input = JSON.parse(call.mock.calls[0][1]);
    expect(input).toMatchObject({aiSide: 'con', currentRound: spec.rounds[1], turns: turns.slice(0, 1), message});
  });
  it('continues after a long student argument within the advertised 3000-character limit', async () => {
    const longTurn = {...turns[0], student: '有效论证'.repeat(500)};
    expect(await debateDialogue({spec, side: 'pro', turns: [longTurn], action: 'turn', message}, async () => JSON.stringify(reply))).toEqual(reply);
  });
  it('does not accept fabricated evidence IDs', async () => {
    const call = vi.fn().mockResolvedValue(JSON.stringify({...reply, evidenceIds: ['invented-source']}));
    await expect(debateDialogue({spec, side: 'con', turns: [], action: 'turn', message}, call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('does not accept invented student quotes', async () => {
    await expect(debateDialogue({spec, side: 'pro', turns: [], action: 'turn', message}, async () =>
      JSON.stringify({...reply, coaching: {quote: '这句话没有说过', feedback: '建议'}}))).rejects.toThrow();
  });
  it('rejects premature reflection and extra rounds without calling the model', async () => {
    const call = vi.fn();
    await expect(debateDialogue({spec, side: 'pro', turns: [], action: 'reflect', message}, call)).rejects.toThrow('阶段');
    await expect(debateDialogue({spec, side: 'pro', turns, action: 'turn', message}, call)).rejects.toThrow('阶段');
    expect(call).not.toHaveBeenCalled();
  });
  it('requires exactly the teacher rubric and real turn citations in feedback', async () => {
    const report = {summary: '提出了条件但还需核验', criteria: spec.rubric.map(item => ({rubricId: item.id, level: 3,
      evidenceTurnIds: ['turn-1'], feedback: '能提出条件，还需说明如何实施。'})), nextSteps: ['查证学习效果资料', '尝试反方论证']};
    expect(await debateDialogue({spec, side: 'con', turns, action: 'reflect', message}, async () => JSON.stringify(report))).toEqual(report);
    const invented = {...report, criteria: report.criteria.map(item => ({...item, evidenceTurnIds: ['turn-99']}))};
    await expect(debateDialogue({spec, side: 'con', turns, action: 'reflect', message}, async () => JSON.stringify(invented))).rejects.toThrow();
    const duplicate = {...report, criteria: [report.criteria[0], report.criteria[0], report.criteria[2]]};
    await expect(debateDialogue({spec, side: 'con', turns, action: 'reflect', message}, async () => JSON.stringify(duplicate))).rejects.toThrow();
  });
});
