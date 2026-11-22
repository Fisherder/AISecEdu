import { describe, expect, it } from 'vitest';
import { buildLearnerInsight } from '@/lib/security/learning-analytics';
import {
  buildStudentAgentUserPrompt,
  decideStudentAgentMessage,
  normalizeStudentAgentDecision,
  STUDENT_AGENT_SYSTEM_PROMPT,
} from '@/lib/server/student-agent';
import {
  validateStudentAgentContext,
  type StudentAgentLearningState,
} from '@/lib/server/student-agent-context';

const profile = {
  learningGoal: '能够独立解释漏洞原理',
  level: 'intermediate' as const,
  preferences: { explanationStyle: 'guided', sessionMinutes: 30 },
  memory: ['我更喜欢先看一个具体例子'],
  updatedAt: 1,
};

const state: StudentAgentLearningState = {
  profile,
  insight: buildLearnerInsight([]),
  evidenceEventCount: 0,
  courses: [
    {
      id: 'course-owned',
      title: '软件安全',
      description: '安全课程',
      courseCode: 'SEC-01',
      lessons: [{ id: 'lesson-owned', title: '缓冲区溢出', classroomId: 'room-owned', order: 1 }],
    },
  ],
  tasks: [
    {
      id: 'task-owned',
      title: '完成漏洞分析',
      instructions: '说明原因',
      courseId: 'course-owned',
      courseTitle: '软件安全',
      lessonId: 'lesson-owned',
      classroomId: 'room-owned',
      dueAt: null,
      progress: 0,
    },
  ],
  packages: [],
  plans: [],
  activeContext: { courseId: 'course-owned' },
};

describe('student learning agent', () => {
  it('passes the original natural-language request verbatim and does not coerce analysis into generation', async () => {
    const request = '分析缓冲区溢出的根因，并比较栈保护前后的差异。';
    let capturedSystem = '';
    let capturedUser = '';
    const decision = await decideStudentAgentMessage(
      { message: request, history: [], state, context: state.activeContext },
      {
        aiCall: async (systemPrompt, userPrompt) => {
          capturedSystem = systemPrompt;
          capturedUser = userPrompt;
          return JSON.stringify({
            action: 'answer',
            title: '栈溢出根因分析',
            reply: '根因是越界写破坏相邻控制数据。',
            trace: [{ label: '分析课程上下文', detail: '结合已选章节', status: 'completed' }],
            memoryFacts: [],
            profileUpdates: {},
          });
        },
      },
    );

    expect(capturedSystem).toContain('不得擅自改成课件或学习包生成');
    expect(capturedUser).toContain(
      `<original_student_request>\n${request}\n</original_student_request>`,
    );
    expect(decision.action).toBe('answer');
    expect(decision.packageRequest).toBeUndefined();
    expect(decision.reply).toContain('越界写');
  });

  it('only prepares a personal package for an explicit generation action and enforces safe bounds', () => {
    const decision = normalizeStudentAgentDecision(
      {
        action: 'generate_package',
        title: '个人练习包',
        reply: '将创建一个可进入的个人学习包。',
        packageRequest: {
          goal: '通过三个情境理解 XSS 输出编码',
          level: 'advanced',
          durationMinutes: 500,
          preference: 'challenge',
        },
      },
      '帮我生成一个可进入的 XSS 个人学习包。',
      profile,
    );

    expect(decision?.action).toBe('generate_package');
    expect(decision?.packageRequest).toEqual({
      goal: '通过三个情境理解 XSS 输出编码',
      level: 'advanced',
      durationMinutes: 90,
      preference: 'challenge',
    });
  });

  it.each([
    ['请根据上节课内容生成一份学习包。', true],
    ['请根据之前的课堂笔记生成学习包。', true],
    ['请根据上节课的学习包资料生成学习讲义。', true],
    ['请解释学习包。再生成一份学习讲义。', true],
    ['请不要忘了生成一份学习包。', true],
    ['请生成一个“学习包”。', true],
    ['我要学习包。', true],
    ['我需要学习包。', true],
    ['可以帮我生成学习包吗？', true],
    ['请问可以帮我生成学习包吗？', true],
    ['帮我生成学习包吗？', true],
    ['麻烦生成学习包吗？', true],
    ['给我生成学习包吗？', true],
    ['生成学习包不需要解释。', true],
    ['生成学习包不需要实验。', true],
    ['帮我生成“个人学习包”。', true],
    ['Please create a "personal study pack".', true],
    ['请生成学习包。不要概念自检。', true],
    ['请参考“不要生成学习包”这段课堂资料生成概念自检。', true],
    ['Please create a study package from my notes.', true],
    ['生成学习包了吗？', false],
    ['请问生成学习包了吗？', false],
    ['你能帮我生成学习包了吗？', false],
    ['我想知道可以生成学习包吗？', false],
    ['麻烦问一下生成学习包了吗？', false],
    ['请生成学习包。学习包不用再生成了，谢谢。', false],
    ['请生成学习包。后来我不想要学习包。', false],
    ['请参考“个人学习包”的定义，说明它有什么用。', false],
    ['不要概念自检。', false],
    ['请生成学习包，只要概念自检，不要概念自检。', false],
    ['生成学习包已完成。', false],
    ['请生成学习包之前先讲讲概念。', false],
    ['请生成学习包。请取消刚才的请求。', false],
    ['请生成自学包。不要学习包。', false],
    ['请生成自学包。不要“学习包”。', false],
    ['请制作学习讲义。不要学习讲义。', false],
    ['请制作学习讲义。不要学习包和学习讲义。', false],
    ['“请生成学习包”是课堂记录。', false],
    ['继续。', false],
  ])('gates package suggestions on explicit current-turn authorization in %s', async (message, allowed) => {
    const decision = await decideStudentAgentMessage(
      {
        message,
        history: [{role: 'user', content: '请生成一个植物观察学习包。'}],
        state,
        context: state.activeContext,
      },
      {
        aiCall: async () => JSON.stringify({
          action: 'generate_package',
          title: '植物观察学习包',
          reply: '准备植物观察的文字学习材料。',
          packageRequest: {goal: '观察叶片生长', level: 'beginner', preference: 'explain', durationMinutes: 20},
        }),
      },
    );
    expect(decision.action).toBe(allowed ? 'generate_package' : 'answer');
    expect(Boolean(decision.packageRequest)).toBe(allowed);
  });

  it.each([
    ['请参考“不要生成学习包”这段课堂资料生成概念自检。', 'self_check'],
    ['请生成学习包，只要“概念自检”。', 'self_check'],
    ['请只生成概念自检。', 'self_check'],
    ['请生成学习包，但只生成概念自检。', 'self_check'],
    ['请生成学习包，但不要概念自检。', 'handout'],
    ['请生成学习讲义。不要概念自检。', 'handout'],
    ['请生成学习包，不要概念自检。', 'handout'],
    ['请生成学习讲义和概念自检。', undefined],
  ] as const)('pins the requested output scope for %s', async (message, product) => {
    const decision = await decideStudentAgentMessage(
      { message, history: [], state, context: state.activeContext },
      { aiCall: async () => JSON.stringify({
        action: 'generate_package',
        reply: '准备文字学习内容。',
        packageRequest: { goal: '观察分数', product: 'package' },
      }) },
    );
    expect(decision.action).toBe('generate_package');
    expect(decision.packageRequest?.product).toBe(product);
  });

  it('normalizes a trackable plan while ignoring malformed steps', () => {
    const decision = normalizeStudentAgentDecision(
      {
        action: 'plan',
        title: '今日计划',
        reply: '按三个短步骤推进。',
        plan: {
          title: '30 分钟复习',
          objective: '解释漏洞根因并完成自检',
          steps: [
            { title: '回忆原理', detail: '写出两条因果关系', estimatedMinutes: 8 },
            { title: '', detail: '无效步骤' },
            { title: '情境自检', detail: '完成三题并说明理由', estimatedMinutes: 999 },
          ],
        },
      },
      '制定今天的学习计划',
      profile,
    );

    expect(decision?.plan?.steps).toHaveLength(2);
    expect(decision?.plan?.steps[0]).toMatchObject({ id: 'step-1', status: 'pending' });
    expect(decision?.plan?.steps[1].estimatedMinutes).toBe(240);
  });

  it('rejects contexts outside the learner scope and resolves tasks to their owned course', () => {
    expect(
      validateStudentAgentContext(
        { courseId: 'course-forbidden', lessonId: 'lesson-forbidden' },
        state.courses,
        state.tasks,
        state.packages,
      ),
    ).toEqual({});
    expect(
      validateStudentAgentContext(
        { taskId: 'task-owned' },
        state.courses,
        state.tasks,
        state.packages,
      ),
    ).toEqual({ taskId: 'task-owned', courseId: 'course-owned', lessonId: 'lesson-owned' });
  });

  it('keeps private-answer and cross-user restrictions in the active system policy', () => {
    expect(STUDENT_AGENT_SYSTEM_PROMPT).toContain('不得泄露教师私有答案');
    expect(STUDENT_AGENT_SYSTEM_PROMPT).toContain('其他学生数据');
    expect(buildStudentAgentUserPrompt('解释这个概念', [], state)).toContain('软件安全');
  });
});
