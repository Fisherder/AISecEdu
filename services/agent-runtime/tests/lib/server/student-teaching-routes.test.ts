import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postAgent } from '@/app/api/student/agent/route';
import { GET as getClassroom } from '@/app/api/classroom/route';
import { POST as postReview } from '@/app/api/student/review/route';
import { buildLearnerInsight } from '@/lib/security/learning-analytics';

const mocks = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  query: vi.fn(),
  loadStudentAgentLearningState: vi.fn(),
  saveStudentLearningProfile: vi.fn(),
  createStudentLearningPlan: vi.fn(),
  loadStudentLearningContext: vi.fn(),
  createHarnessTurn: vi.fn(),
  runTurn: vi.fn(),
  recordHarnessUsage: vi.fn(),
  publishLesson: vi.fn(),
  storeLesson: vi.fn(),
  readClassroom: vi.fn(),
}));

vi.mock('@/lib/server/auth/session', () => ({ resolvePrincipal: mocks.resolvePrincipal }));
vi.mock('@/lib/server/db', () => ({ getDb: async () => ({ query: mocks.query }) }));
vi.mock('@/lib/server/schema', () => ({ ensureAppSchema: async () => {} }));
vi.mock('@/lib/server/student-agent-context', () => ({
  loadStudentAgentLearningState: mocks.loadStudentAgentLearningState,
  saveStudentLearningProfile: mocks.saveStudentLearningProfile,
  createStudentLearningPlan: mocks.createStudentLearningPlan,
}));
vi.mock('@/lib/server/student-learning-context', () => ({
  loadStudentLearningContext: mocks.loadStudentLearningContext,
}));
vi.mock('@/lib/server/agent-harness/classroom-turn', () => ({
  createHarnessTurn: mocks.createHarnessTurn,
  recordHarnessUsage: mocks.recordHarnessUsage,
}));

vi.mock('@/lib/server/stores/pg-lesson-store', () => ({
  PgLessonStore: class {
    write = mocks.storeLesson;
  },
}));
vi.mock('@/lib/server/lesson-publish', () => ({ publishLesson: mocks.publishLesson }));
vi.mock('@/lib/server/classroom-storage', () => ({
  buildRequestOrigin: () => 'http://runtime.test',
  readClassroom: mocks.readClassroom,
  isValidClassroomId: () => true,
}));

const personalSentinel = 'NEVER_SEND_LEARNER_OR_INTERNAL_ID';
const usage = { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 };
const insight = buildLearnerInsight([
  {
    classroomId: personalSentinel,
    totalScenes: 1,
    scenes: [{ id: personalSentinel, title: '观察与归纳', type: 'quiz' }],
    completedSceneIds: [personalSentinel],
    quizScores: { [personalSentinel]: 75 },
  },
]);
const state = {
  profile: {
    learningGoal: '掌握归纳方法',
    level: 'beginner',
    preferences: { sessionMinutes: 30 },
    memory: [],
    userId: personalSentinel,
  },
  insight: {
    ...insight,
    nextAction: { ...insight.nextAction, classroomId: personalSentinel },
    capabilities: insight.capabilities.map((item) => ({
      ...item,
      evidenceLabels: [personalSentinel],
    })),
  },
  evidenceEventCount: 4,
  courses: [
    {
      id: personalSentinel,
      title: '科学学习方法',
      description: '练习归纳与证据判断',
      courseCode: personalSentinel,
      lessons: [
        { id: personalSentinel, title: '归纳练习', classroomId: personalSentinel, order: 1 },
      ],
    },
  ],
  tasks: [],
  packages: [],
  plans: [
    {
      id: personalSentinel,
      threadId: personalSentinel,
      title: '上一周复盘',
      objective: '建立记录习惯',
      status: 'active',
      steps: [],
    },
  ],
  activeContext: { courseId: personalSentinel },
};

function request(path: string, body?: object) {
  return new NextRequest(`http://runtime.test/api/student/${path}`, {
    method: 'POST',
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe('student teaching model routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolvePrincipal.mockResolvedValue({ role: 'student', learnerKey: 'acct:own-learner' });
    mocks.createHarnessTurn.mockReturnValue(mocks.runTurn);
    mocks.loadStudentAgentLearningState.mockResolvedValue(state);
    mocks.loadStudentLearningContext.mockResolvedValue(state);
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('SELECT * FROM student_agent_threads')
        ? [{ id: 'own-thread', title: '新学习对话', active_context: {} }]
        : sql.includes('SELECT role, content')
          ? [{ role: 'user', content: '我已经练过一次。', userId: personalSentinel }]
          : [],
    }));
  });

  it('creates a trackable plan for the authenticated learner with scoped history and real usage', async () => {
    const plan = {
      title: '今日复习',
      objective: '用一条证据支持结论',
      steps: [{ title: '复盘笔记', detail: '写一句观察' }],
    };
    mocks.runTurn.mockResolvedValue({
      model: 'actual-model',
      text: JSON.stringify({ action: 'plan', reply: '先对照你的笔记。', plan }),
      usage,
    });
    mocks.createStudentLearningPlan.mockResolvedValue({ id: 'stored-plan' });
    const result = await postAgent(
      request('agent', {
        threadId: 'own-thread',
        learnerKey: 'acct:foreign',
        message: '制定一份归纳复习计划',
      }),
    );
    expect(result.status).toBe(201);
    const response = await result.json();
    expect(response.assistantMessage).toMatchObject({
      content: '先对照你的笔记。',
      metadata: {
        action: 'plan',
        source: 'model',
        modelUsage: { model: 'actual-model', usage },
        plan: { id: 'stored-plan' },
      },
    });
    expect(mocks.query.mock.calls[0][1]).toEqual(['own-thread', 'acct:own-learner']);
    expect(mocks.query.mock.calls[1][1]).toEqual(['own-thread', 'acct:own-learner']);
    expect(mocks.createStudentLearningPlan).toHaveBeenCalledWith(
      'acct:own-learner',
      'own-thread',
      expect.objectContaining({ objective: plan.objective }),
      expect.anything(),
    );
    const [messages, signal] = mocks.runTurn.mock.calls[0];
    const prompt = JSON.stringify(messages);
    expect(prompt).toContain('制定一份归纳复习计划');
    expect(prompt).toContain('我已经练过一次。');
    expect(prompt).toContain('科学学习方法');
    expect(prompt).not.toContain(personalSentinel);
    expect(prompt).not.toContain('acct:foreign');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(mocks.recordHarnessUsage).toHaveBeenCalledOnce();
    expect(mocks.recordHarnessUsage).toHaveBeenCalledWith(
      expect.objectContaining({ usage }),
      'student-agent',
    );
  });

  it('denies another learner’s thread before loading state or invoking the model', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const response = await postAgent(
      request('agent', { threadId: 'foreign-thread', message: '总结我的学习' }),
    );
    expect(response.status).toBe(404);
    expect(mocks.query.mock.calls[0][1]).toEqual(['foreign-thread', 'acct:own-learner']);
    expect(mocks.loadStudentAgentLearningState).not.toHaveBeenCalled();
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it('preserves the deterministic offline response without any usage or plan mutation', async () => {
    mocks.createHarnessTurn.mockReturnValue(undefined);
    const result = await postAgent(
      request('agent', { threadId: 'own-thread', message: '制定复习计划' }),
    );
    expect(result.status).toBe(201);
    expect((await result.json()).assistantMessage.metadata.source).toBe('fallback');
    expect(mocks.recordHarnessUsage).not.toHaveBeenCalled();
    expect(mocks.createStudentLearningPlan).not.toHaveBeenCalled();
  });

  it.each([
    '请解释归纳',
    '请给我解释如何生成学习包。',
    'How do I generate a learning package?',
    '不需要生成学习包。请解释归纳。',
    '别给我生成学习包。',
    '请不要替我自动生成学习包，只解释术语。',
    '请解释为什么要生成学习包。',
    '老师昨天说会生成学习包。',
    '请生成一个学习包。后来我改主意了，不要替我自动生成学习包。',
    '生成学习包有什么用？',
    'Why should I create a study package?',
    'My teacher said they would create a study package.',
    "I don't want to generate a learning package. Just explain induction.",
    'No need to generate a study package.',
    '请生成一份复习计划。不要学习包。',
    '请生成学习包。不要给我学习包。',
  ])('ignores a model-supplied content-generation action for %s', async (message) => {
    mocks.runTurn.mockResolvedValue({
      model: 'actual-model',
      text: JSON.stringify({
        action: 'generate_package',
        reply: '已启动一个实验',
        packageRequest: { goal: '合成数据' },
      }),
      usage,
    });
    const result = await postAgent(request('agent', { threadId: 'own-thread', message }));
    const { assistantMessage } = await result.json();
    expect(assistantMessage.metadata.action).toBe('answer');
    expect(assistantMessage.content).not.toContain('已启动一个实验');
    expect(assistantMessage.metadata.generatedPackage).toBeUndefined();
    expect(mocks.createStudentLearningPlan).not.toHaveBeenCalled();
    expect(mocks.runTurn).toHaveBeenCalledOnce();
    expect(mocks.storeLesson).not.toHaveBeenCalled();
    expect(mocks.publishLesson).not.toHaveBeenCalled();
  });

  it.each([
    '请生成一个学习包，学习植物观察。',
    '帮我生成一个 30 分钟、可直接进入学习的个人学习包，并结合我的薄弱点安排内容。',
    '请制作一个关于同时观察两种植物的学习包。',
    '请根据上节课内容帮我创建一份学习包。',
    '请自动生成一个概率论学习包。',
    '请设计概率论的学习包。',
    'Can you create a study package for me?',
    '我要一份概率论学习包。',
    'Help me create a study package.',
    '别忘了根据上节课内容帮我生成学习包。',
    '请解释盆栽观察。再生成一份学习包。',
    '不需要生成幻灯片。请生成一个学习包。',
    '请生成一个学习包。别生成幻灯片。',
    '请生成一个学习包。不要概念自检。',
    "Don't make a slide deck. Please generate a learning package.",
    'Create a 30-minute, beginner-friendly learning package.',
    '不要生成学习包。改主意了，请生成一个学习包。',
  ])('publishes a classroom for %s', async (message) => {
    mocks.publishLesson.mockResolvedValue({
      classroomId: 'personal_study_fixture',
      url: 'http://runtime.test/classroom/personal_study_fixture',
    });
    mocks.runTurn
      .mockResolvedValueOnce({
        model: 'router-model',
        text: JSON.stringify({
          action: 'generate_package',
          reply: '准备学习包',
          packageRequest: { goal: '学习植物观察', preference: 'practice' },
        }),
        usage,
      })
      .mockResolvedValueOnce({
        model: 'package-model',
        text: JSON.stringify({
          status: 'ready',
          title: '植物观察',
          summary: '学习如何记录叶片变化。',
          objectives: ['持续记录'],
          sections: [
            {
              title: '观察法',
              explanation: '在每天同一时间观察。',
              points: ['记录时间', '比较变化'],
            },
          ],
          concepts: [
            {
              question: '什么时候观察？',
              options: ['固定时间', '任何时候', '不需要观察'],
              correctIndex: 0,
              explanation: '同一时间便于比较。',
            },
          ],
        }),
        usage,
      });
    const result = await postAgent(
      request('agent', {
        threadId: 'own-thread',
        message,
      }),
    );
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({
      assistantMessage: {
        metadata: {
          generatedPackage: { title: '植物观察', classroomId: 'personal_study_fixture' },
          links: expect.arrayContaining([
            expect.objectContaining({ href: '/classroom/personal_study_fixture' }),
          ]),
        },
      },
    });
    const [lesson, , owner, options] = mocks.publishLesson.mock.calls[0];
    expect(lesson.artifacts.map((artifact: { type: string }) => artifact.type)).toEqual([
      'slide',
      'quiz',
    ]);
    expect(lesson.artifacts[1].content.questions[0]).toMatchObject({
      answer: ['0'],
      type: 'single',
    });
    expect(owner).toBe('acct:own-learner');
    expect(options).toEqual({ personalStudy: true });
    expect(mocks.storeLesson).toHaveBeenCalledTimes(2);
    expect(
      mocks.query.mock.calls.some(
        ([sql, values]) =>
          sql.includes('classroom_enrollments') && values[1] === 'acct:own-learner',
      ),
    ).toBe(true);
    expect(JSON.stringify(mocks.runTurn.mock.calls[1][0])).not.toContain(personalSentinel);
    expect(mocks.recordHarnessUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'package-model', usage }),
      'student-self-study',
    );
  });

  it('does not return a native personal classroom for another learner', async () => {
    const target = new NextRequest('http://runtime.test/api/classroom?id=personal_study_fixture');
    mocks.query.mockResolvedValue({ rows: [] });
    const denied = await getClassroom(target);
    expect(denied.status).toBe(404);
    expect(mocks.readClassroom).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][1]).toEqual(['personal_study_fixture', 'acct:own-learner']);
    mocks.query.mockResolvedValue({ rows: [{ allowed: 1 }] });
    mocks.readClassroom.mockResolvedValue({
      id: 'personal_study_fixture',
      scenes: [{ type: 'quiz' }],
    });
    expect((await getClassroom(target)).status).toBe(200);
  });

  it('generates a formative review from only the learner’s aggregated evidence', async () => {
    mocks.runTurn.mockResolvedValue({
      model: 'actual-model',
      text: JSON.stringify({
        summary: '完成了归纳练习。',
        strengths: ['归纳观察'],
        focusAreas: ['解释理由'],
        nextSteps: ['写下证据'],
      }),
      usage,
    });
    const result = await postReview(request('review'));
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({
      source: 'ai',
      review: { summary: '完成了归纳练习。' },
    });
    expect(mocks.loadStudentLearningContext).toHaveBeenCalledWith(
      'acct:own-learner',
      expect.anything(),
    );
    const [messages] = mocks.runTurn.mock.calls[0];
    expect(JSON.stringify(messages)).toContain('evidenceEventCount');
    expect(JSON.stringify(messages)).not.toContain(personalSentinel);
    expect(mocks.recordHarnessUsage).toHaveBeenCalledWith(
      expect.objectContaining({ usage }),
      'student-learning-review',
    );
    expect(mocks.query.mock.calls[0][1][1]).toBe('acct:own-learner');
  });

  it('builds the review offline when no evidence exists without constructing a model client', async () => {
    mocks.loadStudentLearningContext.mockResolvedValue({
      ...state,
      insight: buildLearnerInsight([]),
    });
    const result = await postReview(request('review'));
    expect(result.status).toBe(201);
    expect((await result.json()).source).toBe('fallback');
    expect(mocks.createHarnessTurn).not.toHaveBeenCalled();
  });

  it('keeps both endpoints restricted to student principals', async () => {
    mocks.resolvePrincipal.mockResolvedValue(null);
    expect((await postAgent(request('agent', { message: '总结' }))).status).toBe(401);
    mocks.resolvePrincipal.mockResolvedValue({ role: 'teacher' });
    expect((await postReview(request('review'))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });
});
