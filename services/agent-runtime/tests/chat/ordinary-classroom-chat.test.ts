import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as chat } from '@/app/api/chat/route';
import { POST as piChat } from '@/app/api/chat/pi/route';
import { runPiSingleRequest } from '@/components/chat/use-chat-sessions';
import { runAgentLoop, type AgentLoopIterationResult, type AgentLoopStoreState } from '@/lib/chat/agent-loop';
import type { StatelessChatRequest } from '@/lib/types/chat';
import { statelessGenerate } from '@/lib/orchestration/stateless-generate';
import { recordUsage } from '@/lib/server/usage-storage';

vi.mock('@/lib/config/feature-flags', () => ({ isPiChatEnabled: () => true }));
vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: vi.fn() }));
vi.mock('@/lib/orchestration/stateless-generate', () => ({
  statelessGenerate: vi.fn(async function* () {
    yield { type: 'done', data: { totalActions: 0, totalAgents: 0 } };
  }),
}));

const browserHeaders = {
  Cookie: 'aisecedu_agent_runtime=signed-session',
  'x-trace-id': 'chat-trace',
  'X-AISecEdu-Classroom-Dialogue': '1',
};

function request(stageId: string | null = 'classroom-one', headers: HeadersInit = browserHeaders) {
  return new NextRequest('http://runtime/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages: [
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Plants use sunlight.' }],
          metadata: { agentId: 'default-1', senderName: 'FORGED_NAME' },
        },
        {
          role: 'user',
          metadata: { metadataSecret: 'PRIVATE_METADATA' },
          parts: [
            { type: 'text', text: 'How does a leaf use light?' },
            { type: 'tool-private', text: 'PRIVATE_TOOL', input: { text: 'PRIVATE_INPUT' } },
          ],
        },
      ],
      storeState: {
        stage: stageId && { id: stageId, name: 'FORGED_STAGE' },
        currentSceneId: 'classroom-one-slide',
        scenes: [{ id: 'classroom-one-slide', content: 'PRIVATE_CLIENT_SLIDE' }],
      },
      config: {
        agentIds: ['default-3', 'default-1', 'default-2', 'custom-agent'],
        agentConfigs: [{ id: 'default-2', persona: 'FORGED_AGENT' }],
        discussionTopic: 'FORGED_TOPIC',
        discussionPrompt: 'FORGED_PROMPT',
      },
      directorState: { turnCount: 999, whiteboardLedger: ['PRIVATE_LEDGER'] },
      userProfile: { bio: 'PRIVATE_BIO' },
    }),
  });
}

const speech = {
  type: 'speech', speaker: 2, text: '叶片把光能转化为化学能。🌱',
  model: 'native-dialogue', usage: { prompt_tokens: 8, completion_tokens: 5 },
};
const done = (next: 'user' | 'end') => ({
  type: 'done', next, model: 'native-dialogue', usage: { prompt_tokens: 12, completion_tokens: 8 },
});
const lines = (...records: object[]) => records.map((record) => JSON.stringify(record) + '\n').join('');
const ndjson = (body: BodyInit) => new Response(body, {
  headers: { 'Content-Type': 'application/x-ndjson' },
});

function harnessFetch(dialogue = () => ndjson(lines(speech, done('end')))) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/ordinary-chat-context')) {
      expect(new URL(url).searchParams.get('sceneId')).toBe('classroom-one-slide');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer signed-session');
      expect(new Headers(init?.headers).get('X-Trace-ID')).toBe('chat-trace');
      return Response.json({
        success: true,
        data: { ordinary: true, topic: 'Photosynthesis', slideText: 'A leaf captures light.' },
      });
    }
    if (path === '/v1/classroom-dialogue') {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer harness-unit-test-secret');
      return dialogue();
    }
    throw new Error('Unexpected URL ' + url);
  });
}

async function events(response: Response) {
  return (await response.text()).split('\n\n').flatMap((line) =>
    line.startsWith('data: ') ? [JSON.parse(line.slice(6))] : [],
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AISECEDU_INTEGRATED', '1');
  vi.stubEnv('AISECEDU_INTERNAL_URL', 'https://authority.test');
  vi.stubEnv('AISECEDU_SERVICE_SECRET', 'authority-unit-test-secret');
  vi.stubEnv('DOJO_AI_ENABLED', '1');
  vi.stubEnv('HARNESS_INTERNAL_URL', 'https://harness.test');
  vi.stubEnv('HARNESS_SERVICE_SECRET', 'harness-unit-test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('ordinary classroom browser chat', () => {
  it('verifies the classroom and sends only the bounded public projection to Harness', async () => {
    const fetchMock = harnessFetch();
    vi.stubGlobal('fetch', fetchMock);
    const response = await chat(request());
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('X-AISecEdu-Classroom-Dialogue')).toBe('1');
    const stream = await events(response);
    expect(stream.map(({ type }) => type)).toEqual([
      'thinking', 'thinking', 'agent_start', 'text_delta', 'agent_end', 'done',
    ]);
    expect(stream[2].data).toMatchObject({ agentId: 'default-2', agentName: 'AI助教' });
    expect(stream[3].data.content).toBe(speech.text);
    expect(stream.at(-1).data).toMatchObject({ totalActions: 0, totalAgents: 1, cueUserReceived: false });
    expect(statelessGenerate).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      roles: ['teacher', 'assistant', 'student'],
      history: [
        { speaker: 1, text: 'Plants use sunlight.' },
        { speaker: 'user', text: 'How does a leaf use light?' },
      ],
      topic: 'Photosynthesis',
      slideText: 'A leaf captures light.',
    });
    expect(recordUsage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        modelId: 'native-dialogue',
        usage: expect.objectContaining({ inputTokens: 12, outputTokens: 8 }),
      }),
      { capturedSession: { token: 'signed-session', traceId: 'chat-trace' } },
    );
  });

  it.each(['user', 'end'] as const)('stops after one browser POST when native closes with %s', async (next) => {
    const initial: StatelessChatRequest = await request().json();
    let completion: AgentLoopIterationResult | null = null;
    const rendered: string[] = [];
    const fetchMock = harnessFetch(() => ndjson(lines(
      speech,
      { ...speech, speaker: 1, text: 'Light supplies energy.' },
      done(next),
    )));
    vi.stubGlobal('fetch', fetchMock);
    const fetchChat = vi.fn((body: Record<string, unknown>, signal: AbortSignal) =>
      chat(new NextRequest('http://runtime/api/chat', {
        method: 'POST', headers: browserHeaders, body: JSON.stringify(body), signal,
      })),
    );
    const result = await runAgentLoop(
      { config: initial.config },
      {
        getStoreState: () => initial.storeState as AgentLoopStoreState,
        getMessages: () => initial.messages,
        fetchChat,
        onEvent: (event) => {
          if (event.type === 'text_delta') rendered.push(event.data.content);
          if (event.type === 'done') {
            completion = {
              ...event.data,
              agentHadContent: event.data.agentHadContent ?? false,
              cueUserReceived: event.data.cueUserReceived ?? false,
            };
          }
        },
        onIterationEnd: async () => completion,
      },
      new AbortController().signal,
    );

    expect(result.reason).toBe(next === 'user' ? 'cue_user' : 'end');
    expect(rendered).toEqual([speech.text, 'Light supplies energy.']);
    expect(fetchChat).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['user', 'end'] as const)('handles an empty dialogue ending in %s', async (next) => {
    const fetchMock = harnessFetch(() => ndjson(lines(done(next))));
    vi.stubGlobal('fetch', fetchMock);
    const stream = await events(await chat(request()));
    expect(stream.map(({ type }) => type)).toEqual(
      next === 'user' ? ['thinking', 'cue_user', 'done'] : ['thinking', 'done'],
    );
    expect(stream.at(-1).data).toMatchObject({ totalAgents: 0, cueUserReceived: next === 'user' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([403, 404, 502])('fails closed for authority HTTP %s in both chat entry points', async (status) => {
    for (const post of [chat, piChat]) {
      const fetchMock = vi.fn(async () => Response.json({ success: false }, { status }));
      vi.stubGlobal('fetch', fetchMock);
      const response = await post(request());
      expect(response.status).toBe(status);
      expect(response.headers.get('X-AISecEdu-Chat-Route')).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
    expect(statelessGenerate).not.toHaveBeenCalled();
  });

  it('fails closed on missing integrated classroom identity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await chat(request(null))).status).toBe(400);
    expect((await piChat(request(null))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(statelessGenerate).not.toHaveBeenCalled();
  });

  it('preserves verified nonordinary classroom chat', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ success: true, data: { ordinary: false } })));
    expect((await events(await chat(request()))).at(-1).type).toBe('done');
    expect(statelessGenerate).toHaveBeenCalledOnce();
  });

  it('streams ordinary Pi requests through the same verified transport in one POST', async () => {
    const upstream = harnessFetch(() => ndjson(lines(done('user'))));
    const browserFetch = vi.fn(async (url: string) => {
      expect(url).toBe('/api/chat/pi');
      const response = await piChat(request());
      expect(response.status).toBe(200);
      expect(response.headers.get('X-AISecEdu-Chat-Route')).toBe('ordinary');
      return response;
    });
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) =>
      url === '/api/chat/pi' ? browserFetch(url) : upstream(url, init));
    vi.stubGlobal('fetch', fetchMock);
    const onEvent = vi.fn();
    const clearLiveSessionAfterError = vi.fn();
    const markSessionCompleted = vi.fn();
    const storeDirectorState = vi.fn();
    await runPiSingleRequest(
      'session',
      {} as Parameters<typeof runPiSingleRequest>[1],
      new AbortController(),
      'qa',
      () => ({
        onEvent,
        onIterationEnd: async () => ({
          directorState: undefined, totalAgents: 0, agentHadContent: false, cueUserReceived: true,
        }),
      }),
      clearLiveSessionAfterError,
      vi.fn(),
      markSessionCompleted,
      storeDirectorState,
      {},
      (key) => key,
      'en',
    );
    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual(['thinking', 'cue_user', 'done']);
    expect(clearLiveSessionAfterError).not.toHaveBeenCalled();
    expect(markSessionCompleted).not.toHaveBeenCalled();
    expect(storeDirectorState).toHaveBeenCalledOnce();
    expect(browserFetch).toHaveBeenCalledOnce();
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('rejects stale browsers before requesting paid generation on either entry point', async () => {
    const { ['X-AISecEdu-Classroom-Dialogue']: _, ...oldHeaders } = browserHeaders;
    for (const post of [chat, piChat]) {
      const fetchMock = harnessFetch();
      vi.stubGlobal('fetch', fetchMock);
      const response = await post(request('classroom-one', oldHeaders));
      expect(response.status).toBe(409);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('rejects the obsolete per-turn response without making a second browser request', async () => {
    const initial: StatelessChatRequest = await request().json();
    const fetchChat = vi.fn(async () => new Response('', {
      headers: { 'X-AISecEdu-Chat-Route': 'ordinary' },
    }));
    const onEvent = vi.fn();
    await expect(runAgentLoop(
      { config: initial.config },
      {
        getStoreState: () => initial.storeState as AgentLoopStoreState,
        getMessages: () => initial.messages,
        fetchChat,
        onEvent,
        onIterationEnd: async () => null,
      },
      new AbortController().signal,
    )).rejects.toThrow('请刷新页面后重试');
    expect(fetchChat).toHaveBeenCalledOnce();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('exits a truncated browser stream without waiting for a missing done event', async () => {
    const initial: StatelessChatRequest = await request().json();
    const fetchChat = vi.fn(async () => new Response(
      'data: {"type":"thinking","data":{"stage":"director"}}\n\n',
      { headers: { 'X-AISecEdu-Chat-Route': 'ordinary', 'X-AISecEdu-Classroom-Dialogue': '1' } },
    ));
    const onIterationEnd = vi.fn(async () => null);
    const result = await runAgentLoop(
      { config: initial.config },
      {
        getStoreState: () => initial.storeState as AgentLoopStoreState,
        getMessages: () => initial.messages,
        fetchChat,
        onEvent: vi.fn(),
        onIterationEnd,
      },
      new AbortController().signal,
    );
    expect(result.reason).toBe('no_done');
    expect(onIterationEnd).not.toHaveBeenCalled();
    expect(fetchChat).toHaveBeenCalledOnce();
  });

  it('fails closed against an old Harness without the new endpoint', async () => {
    const fetchMock = harnessFetch(() => Response.json({ error: 'not found' }, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const stream = await events(await chat(request()));
    expect(stream.map(({ type }) => type)).toEqual(['thinking', 'error']);
    expect(recordUsage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statelessGenerate).not.toHaveBeenCalled();
  });

  it.each([
    ['truncated', lines(speech) + JSON.stringify(done('end')), 5, 1],
    ['invalid ordinal', lines(speech, { ...speech, speaker: 99 }, done('end')), 5, 1],
    ['malformed JSON', lines(speech) + 'malformed\n', 5, 1],
    ['oversize frame', lines(speech) + ' '.repeat(16 * 1024 + 1), 5, 1],
    ['extra frame', lines(speech, done('end'), speech), 8, 1],
    ['regressing usage', lines(speech, { ...done('end'), usage: { prompt_tokens: 7, completion_tokens: 3 } }), 5, 1],
    ['changed model', lines(speech, { ...done('end'), model: 'another-model' }), 5, 1],
    ['seven speeches', lines(...Array.from({ length: 7 }, () => speech), done('end')), 5, 6],
    ['upstream error', lines(speech, { ...done('end'), type: 'error' }), 8, 1],
  ] as const)('fails on %s and bills the latest valid checkpoint once', async (_name, payload, tokens, count) => {
    vi.stubGlobal('fetch', harnessFetch(() => ndjson(payload)));
    const stream = await events(await chat(request()));
    expect(stream.at(-1).type).toBe('error');
    expect(stream.filter(({ type }) => type === 'text_delta')).toHaveLength(count);
    expect(stream.some(({ type }) => type === 'done' || type === 'cue_user')).toBe(false);
    expect(recordUsage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ usage: expect.objectContaining({ outputTokens: tokens }) }),
      expect.anything(),
    );
  });

  it('flushes a complete speech before native closes and bills its checkpoint on browser cancellation', async () => {
    const bytes = new TextEncoder().encode(lines(speech));
    const cancelled = vi.fn();
    vi.stubGlobal('fetch', harnessFetch(() => ndjson(new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      },
      cancel: cancelled,
    }))));
    const response = await chat(request());
    const reader = response.body!.getReader();
    const decode = new TextDecoder();
    const readUntilSpeech = async () => {
      let rendered = '';
      while (!rendered.includes('"type":"agent_end"')) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('Speech was missing');
        rendered += decode.decode(chunk.value, { stream: true });
      }
      return rendered;
    };
    expect(await readUntilSpeech()).toContain(speech.text);
    expect(recordUsage).not.toHaveBeenCalled();
    await reader.cancel();
    await vi.waitFor(() => expect(recordUsage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ usage: expect.objectContaining({ outputTokens: 5 }) }),
      expect.anything(),
    ));
    expect(cancelled).toHaveBeenCalledOnce();
  });

});
