import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/integration/jobs/ordinary-lesson-plan-revise/route';
import { POST as postGeneric } from '@/app/api/integration/jobs/execute/route';

vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: vi.fn() }));

const secret = 'integration-secret-for-tests';
const scope = {
  ownerId: 112,
  dojoId: -253,
  moduleIndex: 1,
  ordinaryTeaching: 'ordinary-lesson-plan-revise',
};
const sections = [
  {
    index: 1,
    title: '图书分类',
    explanation: '按不同类别排列图书。',
    takeaways: ['用分类方便查找'],
  },
  { index: 2, title: '借阅规则', explanation: '每册书都有归还日期。', takeaways: ['借阅期限'] },
];
const job = {
  jobId: 'private-job',
  kind: 'artifact.revise',
  scope,
  modelRoute: {
    route: 'upstream-ordinary-lesson-plan-revise',
    provider: 'deepseek',
    actual_model: 'official',
    required_model: 'official',
    allow_degraded: false,
  },
  payload: {
    artifactType: 'lesson-plan',
    artifactId: 'private-artifact',
    expectedRevision: 3,
    ordinaryLessonPlanRevisionModel: 'official',
    instruction: '请举一个更容易理解的例子。',
    sections,
  },
};
const patch = { index: 2, explanation: '例如，星期一归还这本绘本。' };
const fetchHarness = vi.fn();
const request = (value: unknown = job, token = secret) =>
  new NextRequest('http://localhost/api/integration/jobs/ordinary-lesson-plan-revise', {
    method: 'POST',
    headers: { 'X-AISecEdu-Service-Token': token },
    body: JSON.stringify(value),
  });
const turn = (
  value: unknown = { patches: [patch] },
  model = 'official',
  usage: unknown = {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
  },
) => Response.json({ text: JSON.stringify(value), model, usage });

describe('ordinary lesson plan revision job', () => {
  beforeEach(() => {
    vi.stubEnv('AISECEDU_SERVICE_SECRET', secret);
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://synthetic-ordinary.invalid');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture-harness-secret');
    vi.stubEnv('HARNESS_DEEPSEEK_MODEL', 'official');
    vi.stubGlobal('fetch', fetchHarness);
  });

  afterEach(() => {
    fetchHarness.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends only allowlisted prose and reports a measured sparse patch', async () => {
    fetchHarness.mockImplementation(async (url, init) => {
      expect(String(url)).toBe('http://synthetic-ordinary.invalid/v1/turn');
      const { messages, ...options } = JSON.parse(init.body);
      expect(options).toEqual({});
      expect(messages.map(({ role }: { role: string }) => role)).toEqual(['system', 'user']);
      expect(JSON.parse(messages[1].content)).toEqual({
        instruction: job.payload.instruction,
        sections,
      });
      return turn();
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const result = { patches: [patch] };
    expect(await response.json()).toMatchObject({
      success: true,
      result,
      model: {
        actualModel: 'official',
        provider: 'deepseek',
        executionMode: scope.ordinaryTeaching,
        degraded: false,
        usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
        responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      },
    });
    expect(fetchHarness).toHaveBeenCalledTimes(1);
  });

  it('requires the service credential and rejects incompatible ingress before the turn', async () => {
    expect((await POST(request(job, 'wrong'))).status).toBe(401);
    for (const submitted of [
      { ...job, kind: 'artifact.materialize' },
      { ...job, scope: { ...scope, workspaceId: 'private-workspace' } },
      { ...job, payload: { ...job.payload, currentContent: '<p>private</p>' } },
      { ...job, payload: { ...job.payload, sections: [sections[0], sections[0]] } },
      { ...job, payload: { ...job.payload, artifactType: 'slide-deck' } },
      { ...job, modelRoute: { ...job.modelRoute, route: 'teaching-default' } },
      { ...job, modelRoute: { ...job.modelRoute, allow_degraded: true } },
    ]) {
      expect((await POST(request(submitted))).status).toBe(422);
    }
    expect(
      (await POST(request({ ...job, modelRoute: { ...job.modelRoute, actual_model: 'other' } })))
        .status,
    ).toBe(503);
    expect(fetchHarness).not.toHaveBeenCalled();
  });

  it('rejects ordinary revision markers at the generic executor', async () => {
    const otherwiseGeneric = {
      ...job,
      scope: { ownerId: scope.ownerId, dojoId: scope.dojoId },
      modelRoute: { ...job.modelRoute, route: 'teaching-default' },
      payload: { artifactType: 'lesson-plan', instruction: job.payload.instruction },
    };
    for (const submitted of [
      { ...otherwiseGeneric, scope },
      { ...otherwiseGeneric, modelRoute: job.modelRoute },
      { ...otherwiseGeneric, payload: job.payload },
    ]) {
      const response = await postGeneric(
        new NextRequest('http://localhost/api/integration/jobs/execute', {
          method: 'POST',
          headers: { 'X-AISecEdu-Service-Token': secret },
          body: JSON.stringify(submitted),
        }),
      );
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        errorCode: 'INVALID_ORDINARY_LESSON_PLAN_REVISION_JOB',
      });
    }
    expect(fetchHarness).not.toHaveBeenCalled();
  });

  it.each([
    { patches: [] },
    { patches: [{ ...patch, index: 0 }] },
    { patches: [patch, patch] },
    { patches: [{ ...patch, title: '更改原题' }] },
    { patches: [{ ...patch, explanation: '<p>无效文字</p>' }] },
    { patches: [{ ...patch, explanation: sections[1].explanation }] },
    { patches: [{ ...patch, takeaways: sections[1].takeaways }] },
    { patches: [{ index: 2 }] },
    { patches: [patch], privateNotes: '其他内容' },
  ])('rejects a patch that does not match the projected typed contract %#', async (result) => {
    fetchHarness.mockResolvedValueOnce(turn(result));
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ failureCategory: 'quality' });
  });

  it('requires an exact model response and complete measured usage without retrying', async () => {
    fetchHarness.mockResolvedValueOnce(turn(undefined, 'wrong'));
    expect((await POST(request())).status).toBe(503);
    fetchHarness.mockResolvedValueOnce(turn(undefined, 'official', { total_tokens: 20 }));
    expect((await POST(request())).status).toBe(503);
    expect(fetchHarness).toHaveBeenCalledTimes(2);
  });
});
