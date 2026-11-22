import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as openTask } from '@/app/api/pbl/v2/open-task/route';
import { POST as teach } from '@/app/api/pbl/v2/instructor/route';
import { recordUsage } from '@/lib/server/usage-storage';
import type { PBLProjectV2 } from '@/lib/pbl/v2/types';

vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: vi.fn() }));

const upstream = vi.fn<typeof fetch>();

function project(): PBLProjectV2 {
  return {
    uiPhase: 'workspace',
    title: '盆栽观察',
    description: '学会比较盆栽叶片在一周内的变化。',
    proficiency: 'intermediate',
    language: 'zh-CN',
    tags: [],
    status: 'active',
    roles: [{ id: 'instructor', name: '观察导师', type: 'instructor' }],
    milestones: [
      {
        id: 'milestone',
        title: '建立观察记录',
        order: 0,
        status: 'active',
        documents: [],
        microtasks: [
          {
            id: 'task',
            title: '记录叶片数量',
            description: '每天记录一次数量。',
            status: 'in_progress',
            assignee: 'user',
            order: 0,
            hints: ['固定时间观察。'],
          },
        ],
      },
    ],
    submissions: [],
    evaluations: [],
    threads: [
      {
        agentId: 'instructor',
        messages: [
          {
            id: 'a',
            roleType: 'instructor',
            content: '上次选了固定时间。',
            ts: '2026-05-08T00:00Z',
          },
        ],
      },
    ],
    engagementEvents: [],
    createdAt: '2026-05-08T00:00Z',
    updatedAt: '2026-05-08T00:00Z',
  };
}

function request(route: 'open-task' | 'instructor', args: Record<string, unknown>) {
  return new NextRequest('http://runtime.test/api/pbl/v2/' + route, {
    method: 'POST',
    headers: {
      'x-user-locale': 'zh-CN',
      'x-api-key': 'browser-key',
      'x-base-url': 'https://browser.invalid',
    },
    body: JSON.stringify({
      project: { ...project(), privateAnswer: 'not-for-harness' },
      ...args,
    }),
  });
}

function receive(value: unknown) {
  upstream.mockResolvedValueOnce(
    Response.json({
      text: JSON.stringify(value),
      model: 'actual-harness-model',
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    }),
  );
}

async function frames(response: Response) {
  return (await response.text())
    .trim()
    .split('\n\n')
    .map((frame) => {
      const [event, data] = frame.split('\n');
      return { type: event.slice(7), ...JSON.parse(data.slice(6)) };
    });
}

describe('ordinary PBL v2 instructor via Harness', () => {
  beforeEach(() => {
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture-auth');
    vi.stubGlobal('fetch', upstream);
  });

  afterEach(() => {
    upstream.mockReset();
    vi.mocked(recordUsage).mockClear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(['greeting', 'setup'])(
    'opens the %s phase in SSE without allowing any operations',
    async (phase) => {
      receive({
        reply: '我们先观察，再比较记录。',
        observations: [{ kind: 'question', signature: 'ignored_on_open' }],
      });
      const response = await openTask(request('open-task', { phase }));
      expect(response.status).toBe(200);
      const events = await frames(response);
      expect(events.map((event) => event.type)).toEqual(['token', 'project_patch', 'done']);
      expect(events[1].patch).toMatchObject({
        kind: 'message',
        message: { content: '我们先观察，再比较记录。', microtaskId: 'task' },
      });
      const [url, requestInit] = upstream.mock.calls[0];
      expect(String(url)).toBe('http://harness.invalid:3081/v1/turn');
      expect(requestInit?.headers).toMatchObject({ Authorization: 'Bearer fixture-auth' });
      expect(requestInit?.body).not.toMatch(/not-for-harness|browser-key|browser\.invalid/);
      const wire = JSON.parse(String(requestInit?.body));
      expect(Object.keys(wire)).toEqual(['messages']);
      expect(JSON.parse(wire.messages[1].content)).toMatchObject({
        phase,
        context: { task: { title: '记录叶片数量' } },
        conversation: [{ role: 'assistant', content: '上次选了固定时间。' }],
      });
    },
  );

  it('applies only bounded observation and quoted learner difficulty before committing the reply', async () => {
    receive({
      reply: '先只观察一片叶子，并记录数量。',
      observations: [{ kind: 'struggle', signature: 'needs_first_step', note: '不知怎样开始' }],
      difficulty: { target: 'easier', learnerQuote: '请简单一点' },
    });
    const response = await teach(
      request('instructor', { userMessage: '我不知怎样开始，请简单一点' }),
    );
    const events = await frames(response);
    expect(
      events.filter((event) => event.type === 'tool_call').map((event) => event.toolName),
    ).toEqual(['record_observation', 'adjust_difficulty']);
    expect(
      events.filter((event) => event.type === 'project_patch').map((event) => event.patch.kind),
    ).toContain('proficiency');
    expect(events.some((event) => event.patch?.kind === 'advance')).toBe(false);
    expect(events.at(-1)?.type).toBe('done');
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'pbl-v2-instructor',
        modelId: 'actual-harness-model',
      }),
    );
  });

  it('ignores a difficulty proposal that does not quote the current learner', async () => {
    receive({
      reply: '试着比较两次观察。',
      difficulty: { target: 'harder', learnerQuote: 'make it harder' },
    });
    const events = await frames(await teach(request('instructor', { userMessage: '怎样记录？' })));
    expect(events.some((event) => event.type === 'tool_call')).toBe(false);
    expect(events.some((event) => event.type === 'token')).toBe(true);
  });

  it.each(['', '   '])('shows a retry error for empty Harness text: %j', async (reply) => {
    receive({ reply });
    const opening = await frames(await openTask(request('open-task', { phase: 'greeting' })));
    expect(opening.map((event) => event.type)).toEqual(['error', 'done']);
    expect(opening[0].code).toBe('EMPTY_LLM_OUTPUT');

    receive({ reply });
    const teaching = await frames(
      await teach(request('instructor', { userMessage: '怎样记录？' })),
    );
    expect(teaching.map((event) => event.type)).toEqual(['project_patch', 'error', 'done']);
    expect(teaching[1].code).toBe('EMPTY_LLM_OUTPUT');
  });

  it('acknowledges a valid difficulty-only reply when an instructor can speak', async () => {
    receive({ reply: ' ', difficulty: { target: 'easier', learnerQuote: '请简单一点' } });
    const events = await frames(await teach(request('instructor', { userMessage: '请简单一点' })));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'project_patch',
        patch: expect.objectContaining({
          kind: 'message',
          message: expect.objectContaining({ content: '好的，我来调整一下讲解的方式。' }),
        }),
      }),
    );
    expect(events.some((event) => event.type === 'error')).toBe(false);
  });

  it('shows a retry error when a difficulty-only reply cannot produce an instructor acknowledgment', async () => {
    receive({ reply: ' ', difficulty: { target: 'easier', learnerQuote: '请简单一点' } });
    const events = await frames(
      await teach(
        request('instructor', {
          userMessage: '请简单一点',
          project: { ...project(), roles: [], threads: [] },
        }),
      ),
    );
    expect(events.at(-2)).toMatchObject({ type: 'error', code: 'EMPTY_LLM_OUTPUT' });
    expect(events.at(-1)?.type).toBe('done');
    expect(events.some((event) => event.patch?.kind === 'message')).toBe(false);
  });

  it('rejects an observation without a signature before recording it', async () => {
    receive({
      reply: '试着每天记录叶片数量。',
      observations: [{ kind: 'question' }],
    });
    const events = await frames(await teach(request('instructor', { userMessage: '怎样记录？' })));
    expect(events.map((event) => event.type)).toEqual(['project_patch', 'error', 'done']);
    expect(events[0].patch).toMatchObject({ kind: 'engagement_event', eventKind: 'learner_turn' });
    expect(events[1].code).toBe('STREAM_ERROR');
  });

  it('fails closed for unsupported operations and missing configuration', async () => {
    receive({ reply: '不要显示这条。', operations: [{ type: 'external_lookup' }] });
    const events = await frames(await teach(request('instructor', { userMessage: '怎样记录？' })));
    expect(events.map((event) => event.type)).toEqual(['project_patch', 'error', 'done']);
    expect(events[1].code).toBe('STREAM_ERROR');
    vi.stubEnv('DOJO_AI_ENABLED', 'no');
    expect((await openTask(request('open-task', { phase: 'greeting' }))).status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
