import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as postAgent } from '@/app/api/student/agent/route';
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

const personalSentinel = 'NEVER_SEND_LEARNER_OR_INTERNAL_ID';
const usage = { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 };
const insight = buildLearnerInsight([{
  classroomId: personalSentinel,
  totalScenes: 1,
  scenes: [{ id: personalSentinel, title: '观察与归纳', type: 'quiz' }],
  completedSceneIds: [personalSentinel],
  quizScores: { [personalSentinel]: 75 },
}]);
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
    capabilities: insight.capabilities.map((item) => ({ ...item, evidenceLabels: [personalSentinel] })),
  },
  evidenceEventCount: 4,
  courses: [{
    id: personalSentinel,
    title: '科学学习方法',
    description: '练习归纳与证据判断',
    courseCode: personalSentinel,
    lessons: [{ id: personalSentinel, title: '归纳练习', classroomId: personalSentinel, order: 1 }],
  }],
  tasks: [],
  packages: [],
  plans: [{ id: personalSentinel, threadId: personalSentinel, title: '上一周复盘', objective: '建立记录习惯', status: 'active', steps: [] }],
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
    const plan = { title: '今日复习', objective: '用一条证据支持结论', steps: [{ title: '复盘笔记', detail: '写一句观察' }] };
    mocks.runTurn.mockResolvedValue({
      model: 'actual-model',
      text: JSON.stringify({ action: 'plan', reply: '先对照你的笔记。', plan }),
      usage,
    });
    mocks.createStudentLearningPlan.mockResolvedValue({ id: 'stored-plan' });
    const result = await postAgent(request('agent', {
      threadId: 'own-thread', learnerKey: 'acct:foreign', message: '制定一份归纳复习计划',
    }));
    expect(result.status).toBe(201);
    const response = await result.json();
    expect(response.assistantMessage).toMatchObject({
      content: '先对照你的笔记。',
      metadata: { action: 'plan', source: 'model', modelUsage: { model: 'actual-model', usage }, plan: { id: 'stored-plan' } },
    });
    expect(mocks.query.mock.calls[0][1]).toEqual(['own-thread', 'acct:own-learner']);
    expect(mocks.query.mock.calls[1][1]).toEqual(['own-thread', 'acct:own-learner']);
    expect(mocks.createStudentLearningPlan).toHaveBeenCalledWith(
      'acct:own-learner', 'own-thread', expect.objectContaining({ objective: plan.objective }), expect.anything(),
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
    expect(mocks.recordHarnessUsage).toHaveBeenCalledWith(expect.objectContaining({ usage }), 'student-agent');
  });

  it('denies another learner’s thread before loading state or invoking the model', async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    const response = await postAgent(request('agent', { threadId: 'foreign-thread', message: '总结我的学习' }));
    expect(response.status).toBe(404);
    expect(mocks.query.mock.calls[0][1]).toEqual(['foreign-thread', 'acct:own-learner']);
    expect(mocks.loadStudentAgentLearningState).not.toHaveBeenCalled();
    expect(mocks.runTurn).not.toHaveBeenCalled();
  });

  it('preserves the deterministic offline response without any usage or plan mutation', async () => {
    mocks.createHarnessTurn.mockReturnValue(undefined);
    const result = await postAgent(request('agent', { threadId: 'own-thread', message: '制定复习计划' }));
    expect(result.status).toBe(201);
    expect((await result.json()).assistantMessage.metadata.source).toBe('fallback');
    expect(mocks.recordHarnessUsage).not.toHaveBeenCalled();
    expect(mocks.createStudentLearningPlan).not.toHaveBeenCalled();
  });

  it('ignores a model-supplied content-generation action', async () => {
    mocks.runTurn.mockResolvedValue({
      model: 'actual-model',
      text: JSON.stringify({ action: 'generate_package', reply: '已启动一个实验', packageRequest: { goal: '合成数据' } }),
      usage,
    });
    const result = await postAgent(request('agent', { threadId: 'own-thread', message: '请解释归纳' }));
    const { assistantMessage } = await result.json();
    expect(assistantMessage.metadata.action).toBe('answer');
    expect(assistantMessage.content).not.toContain('已启动一个实验');
    expect(assistantMessage.metadata.generatedPackage).toBeUndefined();
    expect(mocks.createStudentLearningPlan).not.toHaveBeenCalled();
  });

  it('generates a formative review from only the learner’s aggregated evidence', async () => {
    mocks.runTurn.mockResolvedValue({
      model: 'actual-model',
      text: JSON.stringify({ summary: '完成了归纳练习。', strengths: ['归纳观察'], focusAreas: ['解释理由'], nextSteps: ['写下证据'] }),
      usage,
    });
    const result = await postReview(request('review'));
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({ source: 'ai', review: { summary: '完成了归纳练习。' } });
    expect(mocks.loadStudentLearningContext).toHaveBeenCalledWith('acct:own-learner', expect.anything());
    const [messages] = mocks.runTurn.mock.calls[0];
    expect(JSON.stringify(messages)).toContain('evidenceEventCount');
    expect(JSON.stringify(messages)).not.toContain(personalSentinel);
    expect(mocks.recordHarnessUsage).toHaveBeenCalledWith(expect.objectContaining({ usage }), 'student-learning-review');
    expect(mocks.query.mock.calls[0][1][1]).toBe('acct:own-learner');
  });

  it('builds the review offline when no evidence exists without constructing a model client', async () => {
    mocks.loadStudentLearningContext.mockResolvedValue({ ...state, insight: buildLearnerInsight([]) });
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
