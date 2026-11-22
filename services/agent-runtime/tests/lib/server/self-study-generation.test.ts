import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@/lib/server/auth/session';
import {
  createStudentSelfStudyPackage,
  normalizeSelfStudyRequest,
} from '@/lib/server/self-study-generation';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  query: vi.fn(),
  turn: vi.fn(),
  usage: vi.fn(),
  write: vi.fn(),
  publish: vi.fn(),
}));
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
  loadStudentLearningContext: async () => ({
    insight: { completionRate: 0, averageQuizScore: null, weakestCapability: null },
  }),
}));
vi.mock('@/lib/server/agent-harness/classroom-turn', () => ({
  createHarnessTurn: () => mocks.turn,
  recordHarnessUsage: mocks.usage,
}));

const request = { signal: new AbortController().signal } as NextRequest;
const principal = { learnerKey: 'fixture-learner' } as Principal;
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
    mocks.getDb.mockResolvedValue({ query: mocks.query });
    mocks.publish.mockResolvedValue({ classroomId: 'fixture-classroom', url: '/classroom/fixture-classroom' });
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
});
