import { NextRequest } from 'next/server';
import { POST } from '@/app/api/student/self-study/route';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@/lib/server/auth/session';
import {
  createStudentSelfStudyPackage,
  normalizeSelfStudyRequest,
} from '@/lib/server/self-study-generation';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  principal: vi.fn(),
  learningContext: vi.fn(),
  query: vi.fn(),
  turn: vi.fn(),
  usage: vi.fn(),
  write: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('@/lib/server/auth/session', () => ({ resolvePrincipal: mocks.principal }));
vi.mock('@/lib/server/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/server/schema', () => ({ ensureAppSchema: vi.fn() }));
vi.mock('@/lib/server/aisecedu-integration', () => ({ isAISecEduIntegrated: () => false }));
vi.mock('@/lib/server/classroom-storage', () => ({ buildRequestOrigin: () => 'http://classroom.invalid' }));
vi.mock('@/lib/server/lesson-publish', () => ({ publishLesson: mocks.publish }));
vi.mock('@/lib/server/stores/pg-lesson-store', () => ({
  PgLessonStore: class {
    write = mocks.write;
  },
}));
vi.mock('@/lib/server/student-learning-context', () => ({
  loadStudentLearningContext: mocks.learningContext,
}));
vi.mock('@/lib/server/agent-harness/classroom-turn', () => ({
  createHarnessTurn: () => mocks.turn,
  recordHarnessUsage: mocks.usage,
}));

const request = { signal: new AbortController().signal } as NextRequest;
const principal = { learnerKey: 'fixture-learner' } as Principal;
const insight = { completionRate: 0, averageQuizScore: null, weakestCapability: null };
const httpRequest = (fields: Record<string, unknown> = {}) => new NextRequest(
  'http://classroom.invalid/api/student/self-study',
  { method: 'POST', body: JSON.stringify({ goal: '学习分数比较', ...fields }) },
);
const study = normalizeSelfStudyRequest({ goal: '学习分数比较' });
const content = {
  status: 'ready',
  title: '分数比较',
  summary: '借助相同大小的纸片比较分数。',
  objectives: ['比较同分母分数'],
  sections: [{ title: '观察', explanation: '记录 1 < 2 的例子。', points: ['看分母', '比分子'] }],
  concepts: [{ question: '哪个分数大？', options: ['1/8', '2/8', '3/8'], correctIndex: 2, explanation: '分母相同时比分子。' }],
};

describe('standalone ordinary self-study generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ ...principal, role: 'student' });
    mocks.learningContext.mockResolvedValue({ insight });
    mocks.getDb.mockResolvedValue({ query: mocks.query });
    mocks.publish.mockResolvedValue({ classroomId: 'fixture-classroom', url: '/classroom/fixture-classroom' });
  });


  it.each([
    [undefined, ['slide', 'quiz']],
    ['package', ['slide', 'quiz']],
    ['handout', ['slide']],
    ['self_check', ['quiz']],
  ] as const)('honors the %s product through the student HTTP handler', async (product, artifacts) => {
    mocks.turn.mockResolvedValue({ model: 'fixture', text: JSON.stringify({
      ...content,
      sections: product === 'self_check' ? [] : content.sections,
      concepts: product === 'handout' ? [] : content.concepts,
    }) });
    const response = await POST(httpRequest({ product }));
    expect(response.status).toBe(201);
    expect(mocks.turn.mock.calls[0][0][0].content).toContain(
      product === 'handout' ? 'concepts 必须为空数组'
        : product === 'self_check' ? 'sections 必须为空数组'
        : '个人学习包须包含',
    );
    expect(mocks.publish.mock.calls[0][0].artifacts.map((artifact: { type: string }) => artifact.type))
      .toEqual(artifacts);
  });

  it('rejects an unknown product through HTTP before provider or storage', async () => {
    const response = await POST(httpRequest({ product: 'other' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, errorCode: 'GENERATION_FAILED' });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.turn).not.toHaveBeenCalled();
  });

  it('keeps product selection behind the existing student role gate', async () => {
    mocks.principal.mockResolvedValue({ ...principal, role: 'teacher' });
    expect((await POST(httpRequest({ product: 'handout' }))).status).toBe(403);
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.turn).not.toHaveBeenCalled();
  });

  it('omits an unsuitable optional capability label without losing a safe learning request', async () => {
    const label = '> 标记一项观察';
    mocks.learningContext.mockResolvedValue({
      insight: { ...insight, weakestCapability: { label, score: 10 } },
    });
    mocks.turn.mockResolvedValue({ model: 'fixture', text: JSON.stringify(content) });
    const response = await POST(httpRequest());
    expect(response.status).toBe(201);
    const packet = mocks.turn.mock.calls[0][0];
    expect(packet[1].content).toContain('学习分数比较');
    expect(packet[1].content).not.toContain(label);
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain(label);
  });

  it('rejects restricted goals and the separate original request before storage or Harness', async () => {
    const restricted = 'flag{FIXTURE_ONLY}';
    const longGoal = '学习分数'.repeat(130) + restricted;
    expect(() => normalizeSelfStudyRequest({ goal: longGoal })).toThrow('Unsupported learning package text');
    await expect(createStudentSelfStudyPackage(request, principal, { ...study, goal: restricted }))
      .rejects.toThrow('Unsupported learning package text');
    await expect(createStudentSelfStudyPackage(request, principal, study, restricted))
      .rejects.toThrow('Unsupported learning package text');
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.turn).not.toHaveBeenCalled();
  });

  it.each(['flag{FIXTURE_ONLY}', '<b>FIXTURE_ONLY</b>', 'https://fixture.invalid/FIXTURE_ONLY'])(
    'rejects restricted text in nested model output before publishing',
    async (reply) => {
      const result = structuredClone(content);
      result.concepts[0].options[1] = reply;
      mocks.turn.mockResolvedValue({ text: JSON.stringify(result) });
      await expect(createStudentSelfStudyPackage(request, principal, study)).rejects.toMatchObject({
        publicMessage: '内容生成暂时失败，请稍后重试',
      });
      expect(mocks.usage).toHaveBeenCalledOnce();
      expect(mocks.write).not.toHaveBeenCalled();
      expect(mocks.publish).not.toHaveBeenCalled();
      expect(mocks.query).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(mocks.query.mock.calls)).not.toContain('FIXTURE_ONLY');
    },
  );

  it('bounds the raw goal before validating its contents', () => {
    expect(() => normalizeSelfStudyRequest({ goal: '学'.repeat(2001) }))
      .toThrow('Learning goal is too long');
  });

  it('does not send or save an explicitly cancelled package request', async () => {
    await expect(createStudentSelfStudyPackage(
      request, principal, study, '请生成学习包，不用生成任何东西。',
    )).rejects.toThrow('Cancelled learning package request');
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.turn).not.toHaveBeenCalled();
  });

  it('does not save a failed package or publish anything when the provider aborts', async () => {
    const abort = new DOMException('Cancelled', 'AbortError');
    mocks.turn.mockRejectedValueOnce(abort);
    await expect(createStudentSelfStudyPackage(request, principal, study)).rejects.toBe(abort);
    expect(mocks.turn).toHaveBeenCalledOnce();
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('keeps malformed model text out of persisted and thrown errors', async () => {
    mocks.turn.mockResolvedValue({ text: 'flag{FIXTURE_ONLY}' });
    await expect(createStudentSelfStudyPackage(request, principal, study))
      .rejects.toThrow('Unreadable self-study package response');
    expect(mocks.usage).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.query.mock.calls)).not.toContain('FIXTURE_ONLY');
  });

  it('publishes an ordinary math package as a slide and quiz', async () => {
    mocks.turn.mockResolvedValue({ text: JSON.stringify(content), model: 'fixture', usage: {} });
    await expect(createStudentSelfStudyPackage(request, principal, study)).resolves.toMatchObject({ status: 'ready' });
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.write.mock.calls[0][1].artifacts.map((artifact: { type: string }) => artifact.type)).toEqual(['slide', 'quiz']);
  });
  it.each([
    ['self_check', ['quiz']],
    ['handout', ['slide']],
  ] as const)('publishes only the requested %s artifacts', async (product, expected) => {
    const limited = { ...content,
      sections: product === 'self_check' ? [] : content.sections,
      concepts: product === 'handout' ? [] : content.concepts,
    };
    mocks.turn.mockResolvedValue({ text: JSON.stringify(limited), model: 'fixture', usage: {} });
    await expect(createStudentSelfStudyPackage(request, principal, { ...study, product }))
      .resolves.toMatchObject({ status: 'ready' });
    expect(mocks.write.mock.calls[0][1].artifacts.map((artifact: { type: string }) => artifact.type)).toEqual(expected);
    expect(mocks.publish.mock.calls[0][0].artifacts.map((artifact: { type: string }) => artifact.type)).toEqual(expected);
    expect(mocks.turn.mock.calls[0][0][0].content).toContain(product === 'self_check'
      ? 'sections 必须为空数组' : 'concepts 必须为空数组');
  });

  it.each(['self_check', 'handout'] as const)('rejects provider output beyond %s', async (product) => {
    mocks.turn.mockResolvedValue({ text: JSON.stringify(content), model: 'fixture', usage: {} });
    await expect(createStudentSelfStudyPackage(request, principal, { ...study, product }))
      .rejects.toThrow('did not match the requested content');
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it('skips capability labels matching ordinary-text filters without rejecting derived planning descriptions', async () => {
    mocks.learningContext.mockResolvedValue({
      insight: { ...insight, weakestCapability: { label: '终端日志分析', score: 25 } },
    });
    mocks.turn.mockResolvedValue({ model: 'fixture', text: JSON.stringify(content) });
    const response = await POST(httpRequest());
    expect(response.status).toBe(201);
    const packet = mocks.turn.mock.calls[0][0];
    expect(packet[1].content).not.toContain('终端日志分析');
  });

});
