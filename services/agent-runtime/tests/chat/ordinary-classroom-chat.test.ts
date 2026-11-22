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

function request(stageId: string | null = 'classroom-one') {
  return new NextRequest('http://runtime/api/chat', {
    method: 'POST',
    headers: { Cookie: 'aisecedu_agent_runtime=signed-session', 'x-trace-id': 'chat-trace' },
    body: JSON.stringify({
      messages: [
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Visible earlier contribution' }],
          metadata: { agentId: 'default-1', senderName: 'FORGED_NAME' },
        },
        {
          role: 'user',
          metadata: { metadataSecret: 'PRIVATE_METADATA' },
          parts: [
            { type: 'text', text: 'What does the chart show?' },
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

function harnessFetch(decision: number | 'user' | 'end' = 2) {
  const director = { decision: { speaker: decision }, model: 'native-director', usage: { prompt_tokens: 8 } };
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/ordinary-chat-context')) {
      expect(new URL(url).searchParams.get('sceneId')).toBe('classroom-one-slide');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer signed-session');
      expect(new Headers(init?.headers).get('X-Trace-ID')).toBe('chat-trace');
      return Response.json({
        success: true,
        data: { ordinary: true, topic: 'Verified topic', slideText: 'Verified visible slide' },
      });
    }
    if (path === '/v1/classroom-director-turn') return Response.json(director);
    if (path === '/v1/turn') {
      return Response.json({
        text: '[{"type":"action","name":"wb_open"}]',
        model: 'classroom-speech',
        usage: { completion_tokens: 5 },
      });
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
  it('verifies the classroom, routes with native ordinals and emits plain teaching speech', async () => {
    const fetchMock = harnessFetch();
    vi.stubGlobal('fetch', fetchMock);
    const response = await chat(request());
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const stream = await events(response);
    expect(stream.map(({ type }) => type)).toEqual([
      'thinking', 'thinking', 'agent_start', 'text_delta', 'agent_end', 'done',
    ]);
    expect(stream[2].data).toMatchObject({ agentId: 'default-2', agentName: 'AI助教' });
    expect(stream[3].data.content).toBe('[{"type":"action","name":"wb_open"}]');
    expect(stream.at(-1).data).toMatchObject({ totalActions: 0, totalAgents: 1 });
    expect(statelessGenerate).not.toHaveBeenCalled();

    const directorBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(directorBody).toEqual({
      roles: ['teacher', 'assistant', 'student'],
      history: [
        { speaker: 1, text: 'Visible earlier contribution' },
        { speaker: 'user', text: 'What does the chart show?' },
      ],
      turns: 0,
      topic: 'Verified topic',
    });
    const speechBody = String(fetchMock.mock.calls[2][1]?.body);
    expect(speechBody).toContain('Verified visible slide');
    expect(speechBody).toContain('What does the chart show?');
    expect(speechBody).not.toMatch(/PRIVATE_|FORGED_|custom-agent/);
    expect(recordUsage).toHaveBeenCalledTimes(2);
    for (const [, options] of vi.mocked(recordUsage).mock.calls) {
      expect(options).toEqual({ capturedSession: { token: 'signed-session', traceId: 'chat-trace' } });
    }
  });

  it('feeds rendered chat from the previous SSE round into the next real chat request', async () => {
    const initial: StatelessChatRequest = await request().json();
    const initialMessages = initial.messages;
    let done: AgentLoopIterationResult | null = null;
    let assistantId = '';
    const fallbackFetch = harnessFetch();
    const directorHistory: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (new URL(url).pathname === '/v1/classroom-director-turn') {
        const input = JSON.parse(String(init?.body));
        directorHistory.push(input);
        return Response.json({
          decision: { speaker: directorHistory.length === 1 ? 2 : 'user' },
          model: 'native-director',
        });
      }
      return fallbackFetch(url, init);
    }));

    const result = await runAgentLoop(
      { config: initial.config },
      {
        getStoreState: () => initial.storeState as AgentLoopStoreState,
        getMessages: () => initialMessages,
        fetchChat: (body, signal) => chat(new NextRequest('http://runtime/api/chat', {
          method: 'POST',
          headers: { Cookie: 'aisecedu_agent_runtime=signed-session', 'x-trace-id': 'chat-trace' },
          body: JSON.stringify(body),
          signal,
        })),
        onEvent: (event) => {
          if (event.type === 'agent_start') assistantId = event.data.agentId;
          if (event.type === 'text_delta') {
            initialMessages.push({
              id: event.data.messageId || 'test-assistant-message',
              role: 'assistant',
              metadata: { agentId: assistantId },
              parts: [{ type: 'text', text: event.data.content }],
            });
          }
          if (event.type === 'done') {
            done = {
              ...event.data,
              agentHadContent: event.data.agentHadContent ?? false,
              cueUserReceived: event.data.cueUserReceived ?? false,
            };
          }
        },
        onIterationEnd: async () => done,
      },
      new AbortController().signal,
    );

    expect(result.reason).toBe('cue_user');
    expect(directorHistory).toHaveLength(2);
    expect(directorHistory[1]).toMatchObject({
      turns: 1,
      history: [
        { speaker: 1, text: 'Visible earlier contribution' },
        { speaker: 'user', text: 'What does the chart show?' },
        { speaker: 2, text: '[{"type":"action","name":"wb_open"}]' },
      ],
    });
  });

  it('bounds browser rounds even if the latest rendered assistant history is delayed', async () => {
    const initial: StatelessChatRequest = await request().json();
    const fetchChat = vi.fn(async () => new Response('', {
      headers: { 'X-AISecEdu-Chat-Route': 'ordinary' },
    }));
    const result = await runAgentLoop(
      { config: initial.config },
      {
        getStoreState: () => initial.storeState as AgentLoopStoreState,
        getMessages: () => initial.messages,
        fetchChat,
        onEvent: vi.fn(),
        onIterationEnd: async () => ({ totalAgents: 1, agentHadContent: true, cueUserReceived: false }),
      },
      new AbortController().signal,
    );

    expect(result.reason).toBe('cue_user');
    expect(fetchChat).toHaveBeenCalledTimes(6);
  });

  it.each(['user', 'end'] as const)('handles a native %s decision without a speech turn', async (decision) => {
    const fetchMock = harnessFetch(decision);
    vi.stubGlobal('fetch', fetchMock);
    const stream = await events(await chat(request()));
    expect(stream.map(({ type }) => type)).toEqual(
      decision === 'user' ? ['thinking', 'cue_user', 'done'] : ['thinking', 'done'],
    );
    expect(stream.at(-1).data).toMatchObject({ totalAgents: 0, cueUserReceived: decision === 'user' });
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

  it('routes the Pi opt-in to the ordinary browser loop only after authority admits it', async () => {
    const fetchMock = harnessFetch();
    vi.stubGlobal('fetch', fetchMock);
    const response = await piChat(request());
    expect(response.status).toBe(409);
    expect(response.headers.get('X-AISecEdu-Chat-Route')).toBe('ordinary');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal('fetch', vi.fn(async () => response));
    const consumer = vi.fn();
    await expect(runPiSingleRequest(
      'session',
      {} as Parameters<typeof runPiSingleRequest>[1],
      new AbortController(),
      'qa',
      consumer,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      {},
      (key) => key,
      'en',
    )).resolves.toBe('ordinary');
    expect(consumer).not.toHaveBeenCalled();
  });

  it('records measured failed director usage without invoking speech or falling back', async () => {
    const ordinary = harnessFetch();
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (new URL(url).pathname.endsWith('/classroom-director-turn')) {
        return Response.json({ model: 'native-director', usage: { completion_tokens: 2 } }, { status: 502 });
      }
      return ordinary(url, init);
    });
    vi.stubGlobal('fetch', fetchMock);
    const stream = await events(await chat(request()));
    expect(stream.map(({ type }) => type)).toEqual(['thinking', 'error']);
    expect(recordUsage).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(statelessGenerate).not.toHaveBeenCalled();
  });
});
