import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCoursewareSlide } from '@/lib/courseware/compiler';
import { coursewareSlideDataSchema } from '@/lib/courseware/schema';
import { applyProposal, nativeOf, type StudioLesson } from '@/lib/courseware-studio/document';

const mocks = vi.hoisted(() => ({
  callbacks: [] as Array<() => Promise<unknown>>,
  afterPhase: false,
  resolveModel: vi.fn(),
  usage: vi.fn(),
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => Promise<unknown>) => mocks.callbacks.push(callback),
}));
vi.mock('next/headers', () => ({
  headers: async () => {
    if (mocks.afterPhase) throw new Error('Request context ended');
    return new Headers();
  },
  cookies: async () => {
    if (mocks.afterPhase) throw new Error('Request context ended');
    return { get: () => ({ value: 'teacher-session' }) };
  },
}));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));
vi.mock('@/lib/server/usage-storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/server/usage-storage')>();
  return {
    ...original,
    recordUsage: async (...args: Parameters<typeof original.recordUsage>) => {
      mocks.usage(...args);
      return original.recordUsage(args[0], { ...args[1], baseDir: 'unused-integrated-fixture' });
    },
  };
});

const artifactId = 'studio-deck';
const ctx = { params: Promise.resolve({ id: artifactId }) };
const policy = {
  mode: 'ordinary-harness',
  enabled: true,
  model: 'pinned-model',
  ownerId: 7,
  artifactId,
  revision: 4,
};
const legacy = { ...policy, mode: 'legacy', model: null };
const secret = 'synthetic-studio-service-secret';
const cookie = 'aisecedu_agent_runtime=teacher-session';
const origin = 'http://app.invalid';
const harness = 'http://harness.invalid/v1/turn';

function makeLesson(): StudioLesson {
  return {
    id: artifactId,
    __aiseceduRevision: 4,
    title: 'PRIVATE DECK TITLE',
    createdAt: 1,
    updatedAt: 1,
    artifacts: ['单位分数', '分数的大小'].map((title, index) => {
      const studio = coursewareSlideDataSchema.parse({
        page: {
          schema: 'courseware-page-v2',
          title,
          id: 'STUDIO' + index,
          durationSeconds: 60,
          objective: 'PRIVATE OBJECTIVE',
          composition: 'wide',
          role: 'opening',
          takeaway: '分母相同先比较分子',
          layout: {
            title: { box: { left: 40, top: 26, width: 510, height: 60 }, fontSize: 34 },
            takeaway: { box: { left: 40, top: 92, width: 750, height: 42 }, fontSize: 22 },
            supporting: [],
            visual: { left: 40, top: 160, width: 920, height: 355 },
          },
          visual: {
            kind: 'comparison',
            columns: ['三分之一', '三分之二'],
            rows: [
              { label: '分子', values: ['1', '2'] },
              { label: '分母', values: ['3', '3'] },
            ],
          },
          speakerNotes: 'PRIVATE SPEAKER ' + '教师观察学生能否区分分子和分母。'.repeat(5),
          evidence: [{ sourceId: 'PRIVATE REFERENCE', claim: 'PRIVATE EVIDENCE' }],
        },
        theme: {
          name: 'PRIVATE THEME',
          background: '#ffffff',
          foreground: '#000000',
          muted: '#444444',
          accent: '#2222ee',
          secondary: '#005544',
          surface: '#cccccc',
        },
        assets: [
          {
            id: 'fixture-image',
            src: 'data:image/png;base64,AA==',
            source: 'PRIVATE SOURCE',
            alt: 'PRIVATE ALT',
            width: 1,
            height: 1,
          },
        ],
      });
      const rendered = compileCoursewareSlide(studio);
      return {
        id: 'PRIVATE-PAGE-' + index,
        title,
        order: index,
        createdAt: 1,
        type: 'slide' as const,
        outline: {
          id: 'outline-' + index,
          title,
          type: 'slide' as const,
          description: 'PRIVATE OUTLINE',
          keyPoints: [],
          order: index,
        },
        content: {
          elements: rendered.elements,
          background: rendered.background,
          studio: { ...studio, privateStudio: 'PRIVATE STUDIO' },
          remark: 'PRIVATE REMARK',
        },
      };
    }),
  };
}

function makeRequest(lesson: StudioLesson, extras: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/agent-runtime/api/lessons/studio-deck/studio/agent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-Trace-ID': 'synthetic-trace',
    },
    body: JSON.stringify({
      lesson,
      scope: { pageIds: [lesson.artifacts[0].id] },
      requestId: 'studio-run',
      instruction: '将标题写成一个问题',
      ...extras,
    }),
  });
}

function fixture(lesson: StudioLesson) {
  const authorize = vi.fn<() => unknown>().mockReturnValue(policy);
  const provider = vi
    .fn<(packet: { scope: string; fields: Array<{ key: string; value: unknown }> }) => unknown>()
    .mockReturnValue({
      text: JSON.stringify({ changes: [{ key: 'title', value: '什么是单位分数' }] }),
      model: 'pinned-model',
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    });
  const usageEvents = vi.fn();
  const fetch = vi.fn(async (url: string | URL, init: RequestInit) => {
    if (String(url) === harness) {
      const body = JSON.parse(String(init.body));
      expect(Object.keys(body)).toEqual(['messages']);
      expect(body.messages.map((message: { role: string }) => message.role)).toEqual([
        'system',
        'user',
      ]);
      expect(String(init.body)).not.toMatch(/PRIVATE|data:image|<p|ANOTHER SESSION/);
      return Response.json(await provider(JSON.parse(body.messages[1].content)));
    }
    const target = new URL(url);
    expect(target.origin).toBe(origin);
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer teacher-session');
    expect(headers.get('x-aisecedu-service-token')).toBe(secret);
    if (target.pathname.endsWith('/runtime/usage')) {
      expect(init.method).toBe('POST');
      expect(headers.get('x-trace-id')).toBe('synthetic-trace');
      expect(String(init.body)).not.toMatch(/teacher-session|synthetic-studio-service-secret/);
      usageEvents(JSON.parse(String(init.body)));
      return Response.json({ success: true, data: { recorded: true } });
    }
    if (target.searchParams.has('agentPolicy')) {
      expect(target.searchParams.get('authorize')).toBe('1');
      expect(target.searchParams.get('revision')).toBe('4');
      expect(headers.get('x-trace-id')).toBe('synthetic-trace');
      expect(init.redirect).toBe('error');
      const current = authorize();
      if (current instanceof Response) return current;
      return Response.json({ success: true, data: { ownerId: 7, agentPolicy: current } });
    }
    expect(init.method).toBeUndefined();
    return Response.json({
      success: true,
      data: { ownerId: 7, lesson, status: 'DRAFT', canPublish: true },
    });
  });
  vi.stubGlobal('fetch', fetch);
  return { authorize, provider, usageEvents };
}

async function runAfter() {
  const after = mocks.callbacks.shift();
  expect(after).toBeDefined();
  mocks.afterPhase = true;
  try {
    await after!();
  } finally {
    mocks.afterPhase = false;
  }
}

describe('integrated Courseware Studio with a pinned ordinary Harness policy', () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ordinary-studio-'));
  });
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    mocks.resolveModel.mockRejectedValue(new Error('synthetic legacy resolver called'));
    await rm(join(directory, 'courseware-studio'), { recursive: true, force: true });
    vi.stubEnv('GLOBAL_AGENT_RUNTIME_DATA_DIR', directory);
    vi.stubEnv('AISECEDU_INTEGRATED', 'true');
    vi.stubEnv('AISECEDU_INTERNAL_URL', origin);
    vi.stubEnv('AISECEDU_SERVICE_SECRET', secret);
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://harness.invalid');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'synthetic-harness-secret');
    vi.stubEnv('HARNESS_DEEPSEEK_MODEL', 'pinned-model');
  });

  it('creates once, reauthorizes outside the request context, and preserves unselected content and private fields on adoption', async () => {
    const lesson = makeLesson();
    const { authorize, provider, usageEvents } = fixture(lesson);
    const { POST } = await import('@/app/api/lessons/[id]/studio/agent/route');
    const { readRun } = await import('@/lib/server/courseware-studio');
    const first = await POST(makeRequest(lesson), ctx);
    expect(first.status).toBe(202);
    const { run } = await first.json();
    const duplicate = await POST(makeRequest(lesson), ctx);
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).run.id).toBe(run.id);
    expect((await POST(makeRequest(lesson, { instruction: '调整字号' }), ctx)).status).toBe(409);
    expect(mocks.callbacks).toHaveLength(1);
    await runAfter();
    const finished = await readRun(artifactId, run.id, 7);
    expect(finished).toMatchObject({
      status: 'ready',
      processed: 1,
      model: 'pinned-model',
      executionMode: 'ordinary-harness',
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    });
    expect(authorize).toHaveBeenCalledTimes(5);
    expect(provider).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        scope: 'page',
        pageNumber: 1,
        pageCount: 2,
      }),
    );
    const packet = provider.mock.calls[0][0];
    expect(JSON.stringify(packet)).not.toContain('分数的大小');
    expect(packet.fields).toContainEqual({ key: 'title', value: '单位分数' });
    const adopted = applyProposal(lesson, finished.proposals[0], finished.scope);
    expect(adopted.artifacts[0].content).toMatchObject({
      remark: 'PRIVATE REMARK',
      studio: {
        privateStudio: 'PRIVATE STUDIO',
        page: {
          title: '什么是单位分数',
          speakerNotes: expect.stringContaining('PRIVATE SPEAKER'),
          evidence: [{ sourceId: 'PRIVATE REFERENCE' }],
        },
      },
    });
    expect(adopted.artifacts[1]).toEqual(lesson.artifacts[1]);
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.usage).toHaveBeenCalledOnce();
    expect(usageEvents).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: 'courseware-studio',
        providerId: 'deepseek',
        modelId: 'pinned-model',
        inputTokens: 11,
        outputTokens: 7,
      }),
    );
  });

  it('projects only a selected object and never lets an object request write a page property', async () => {
    const lesson = makeLesson();
    const { provider } = fixture(lesson);
    provider.mockReturnValueOnce({
      model: 'pinned-model',
      usage: { prompt_tokens: 10, completion_tokens: 4 },
      text: JSON.stringify({ changes: [{ key: 'object.left', value: 90 }] }),
    });
    provider.mockReturnValueOnce({
      model: 'pinned-model',
      usage: { prompt_tokens: 10, completion_tokens: 4 },
      text: JSON.stringify({ changes: [{ key: 'takeaway', value: '越过对象范围' }] }),
    });
    const { POST } = await import('@/app/api/lessons/[id]/studio/agent/route');
    const { readRun } = await import('@/lib/server/courseware-studio');
    const scope = { pageIds: [lesson.artifacts[0].id], elementId: 'page-title' };
    for (const [index, status] of ['ready', 'failed'].entries()) {
      const started = await POST(
        makeRequest(lesson, {
          scope,
          requestId: 'object-' + index,
          instruction: '把选中对象向右移动',
        }),
        ctx,
      );
      expect(started.status).toBe(202);
      const { run } = await started.json();
      await runAfter();
      const result = await readRun(artifactId, run.id, 7);
      expect(result.status).toBe(status);
      expect(
        provider.mock.calls[index][0].fields.every((field) => field.key.startsWith('object.')),
      ).toBe(true);
      expect(JSON.stringify(provider.mock.calls[index][0])).not.toContain('分母相同先比较分子');
      if (status === 'ready') {
        const changed = applyProposal(lesson, result.proposals[0], scope);
        expect(nativeOf(changed.artifacts[0]).elements[0].left).toBe(90);
      } else expect(result.proposals).toEqual([]);
    }
  });

  it('rejects missing/disabled/mismatched policy and source selection without ever routing legacy', async () => {
    const lesson = makeLesson();
    const { authorize, provider } = fixture(lesson);
    const { POST } = await import('@/app/api/lessons/[id]/studio/agent/route');
    for (const disabled of [
      undefined,
      { ...policy, mode: 'ordinary-harness', enabled: false, model: null },
      { ...policy, model: 'different-model' },
      { ...policy, revision: 3 },
    ]) {
      authorize.mockReturnValueOnce(disabled);
      expect((await POST(makeRequest(lesson), ctx)).status).toBe(503);
    }
    for (const instruction of ['移动标题\n源码第 1 行', '移动标题 <p>PRIVATE</p>']) {
      expect((await POST(makeRequest(lesson, { instruction }), ctx)).status).toBe(400);
    }
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    expect(mocks.callbacks).toHaveLength(0);
  });

  it('keeps manual Studio GET readable with an old service missing the policy', async () => {
    const lesson = makeLesson();
    const { authorize, provider } = fixture(lesson);
    authorize.mockReturnValueOnce(undefined);
    const { GET } = await import('@/app/api/lessons/[id]/studio/route');
    const response = await GET(makeRequest(lesson), ctx);
    expect(response.status).toBe(200);
    const prepared = await response.json();
    expect(prepared.lesson.id).toBe(artifactId);
    expect(prepared).not.toHaveProperty('agentPolicy');
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not dial a model when authorization or revision changes after POST (including explicit legacy downgrade)', async () => {
    const lesson = makeLesson();
    const { authorize, provider } = fixture(lesson);
    const { POST } = await import('@/app/api/lessons/[id]/studio/agent/route');
    const { readRun } = await import('@/lib/server/courseware-studio');
    for (const [index, changed] of [
      legacy,
      { ...policy, revision: 5 },
      new Response(null, { status: 403 }),
    ].entries()) {
      authorize.mockReturnValueOnce(policy).mockReturnValueOnce(changed);
      const response = await POST(makeRequest(lesson, { requestId: 'reauthorize-' + index }), ctx);
      expect(response.status).toBe(202);
      const { run } = await response.json();
      await runAfter();
      expect(await readRun(artifactId, run.id, 7)).toMatchObject({
        status: 'failed',
        proposals: [],
      });
    }
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it('rejects missing usage and rechecks authorization after the provider reply before leaving an adoptable suggestion', async () => {
    const lesson = makeLesson();
    const { authorize, provider } = fixture(lesson);
    const { POST } = await import('@/app/api/lessons/[id]/studio/agent/route');
    const { readRun } = await import('@/lib/server/courseware-studio');
    provider.mockReturnValueOnce({ text: '{"changes":[]}', model: 'pinned-model' });
    const missing = await POST(makeRequest(lesson), ctx);
    await runAfter();
    expect(await readRun(artifactId, (await missing.json()).run.id, 7)).toMatchObject({
      status: 'failed',
      proposals: [],
    });
    authorize.mockReturnValueOnce(policy).mockReturnValueOnce(policy).mockReturnValueOnce(legacy);
    const changed = await POST(makeRequest(lesson, { requestId: 'changed-after' }), ctx);
    await runAfter();
    expect(await readRun(artifactId, (await changed.json()).run.id, 7)).toMatchObject({
      status: 'failed',
      proposals: [],
    });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
  });

  it.each(['failed', 'cancelled'])(
    'keeps completed pages as suggestions when a later page is %s',
    async (status) => {
      const lesson = makeLesson();
      const { provider } = fixture(lesson);
      const { POST } = await import('@/app/api/lessons/[id]/studio/agent/route');
      const { readRun, readRunBase, cancelRun } = await import('@/lib/server/courseware-studio');
      const response = await POST(
        makeRequest(lesson, { scope: { pageIds: lesson.artifacts.map((page) => page.id) } }),
        ctx,
      );
      expect(response.status).toBe(202);
      const { run } = await response.json();
      provider.mockReturnValueOnce({
        model: 'pinned-model',
        usage: { prompt_tokens: 5, completion_tokens: 5 },
        text: JSON.stringify({ changes: [{ key: 'title', value: '认识单位分数' }] }),
      });
      provider.mockImplementationOnce(async () => {
        if (status === 'cancelled') await cancelRun(artifactId, run.id, 7);
        return {
          model: 'pinned-model',
          usage: { prompt_tokens: 5, completion_tokens: 5 },
          text: JSON.stringify({ changes: [{ key: 'PRIVATE notes', value: '无效字段' }] }),
        };
      });
      await runAfter();
      const result = await readRun(artifactId, run.id, 7);
      expect(result).toMatchObject({
        status,
        processed: 1,
        proposals: [{ pageId: lesson.artifacts[0].id }],
      });
      expect(provider).toHaveBeenCalledTimes(2);
      expect(await readRunBase(artifactId, run.id, 7)).toEqual(lesson);
      expect(mocks.resolveModel).not.toHaveBeenCalled();
    },
  );

  it('preserves the explicit legacy policy, and pre-dispatch cancellation does not call any model', async () => {
    const lesson = makeLesson();
    const { authorize, provider } = fixture(lesson);
    const { POST } = await import('@/app/api/lessons/[id]/studio/agent/route');
    const { cancelRun, readRun } = await import('@/lib/server/courseware-studio');
    const cancelled = await POST(makeRequest(lesson), ctx);
    const { run } = await cancelled.json();
    await cancelRun(artifactId, run.id, 7);
    await runAfter();
    expect(await readRun(artifactId, run.id, 7)).toMatchObject({ status: 'cancelled' });
    expect(mocks.resolveModel).not.toHaveBeenCalled();
    authorize.mockReturnValue(legacy);
    const old = await POST(makeRequest(lesson, { requestId: 'legacy-run' }), ctx);
    expect(old.status).toBe(202);
    await runAfter();
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.resolveModel).toHaveBeenCalledOnce();
  });
});
