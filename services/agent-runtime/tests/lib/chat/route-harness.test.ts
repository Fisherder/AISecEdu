import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chat/route';
import * as directorPrompt from '@/lib/orchestration/director-prompt';
import type { ClassroomTurnMessage } from '@/lib/server/agent-harness/classroom-turn';
import type { StatelessEvent } from '@/lib/types/chat';
import { recordUsage } from '@/lib/server/usage-storage';

vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: vi.fn() }));

const endpoint = 'http://fixture-harness.invalid:3081/v1/turn';
const fetchTurn = vi.fn<typeof fetch>();

function makeRequest() {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { id: 'a', role: 'user', parts: [{ type: 'text', text: '学生之前的问题' }] },
        {
          id: 'b',
          role: 'assistant',
          parts: [{ type: 'text', text: '老师之前的解释' }],
          metadata: { agentId: 'default-1', senderName: '老师' },
        },
        { id: 'c', role: 'user', parts: [{ type: 'text', text: '现在的问题' }] },
      ],
      storeState: {
        stage: { id: 'lesson', name: '演示课', whiteboard: [] },
        scenes: [
          {
            id: 'current',
            title: '课件主题',
            type: 'slide',
            content: { type: 'slide', canvas: { elements: [] } },
          },
        ],
        currentSceneId: 'current',
        mode: 'autonomous',
        whiteboardOpen: false,
      },
      config: {
        agentIds: ['default-1', 'default-2'],
        agentConfigs: [
          {
            id: 'default-2',
            name: '课堂助教',
            role: 'assistant',
            persona: '课堂提示：提供示例',
            priority: 2,
            avatar: '',
            color: '#123456',
            allowedActions: ['wb_draw_text', 'arbitrary_action'],
          },
        ],
      },
      apiKey: 'browser-key',
      baseUrl: 'http://browser.invalid/',
      model: 'browser-model',
    }),
  });
}

async function readEvents(response: Response): Promise<StatelessEvent[]> {
  return (await response.text())
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('ordinary classroom chat through Harness', () => {
  beforeEach(() => {
    vi.stubEnv('DOJO_AI_ENABLED', 'auto');
    vi.stubEnv('HARNESS_CONFIGURED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://fixture-harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'service-auth');
    vi.stubGlobal('fetch', fetchTurn);
  });

  afterEach(() => {
    fetchTurn.mockReset();
    vi.mocked(recordUsage).mockClear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('keeps the director, role context, scene, history and ordered classroom SSE', async () => {
    fetchTurn
      .mockResolvedValueOnce(
        Response.json({
          text: '{"next_agent":"default-2"}',
          model: 'fixture',
          usage: { prompt_tokens: 11, completion_tokens: 2, cache_read_input_tokens: 6 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          text: JSON.stringify([
            { type: 'text', content: '先看一个例子。' },
            { type: 'action', name: 'arbitrary_action', params: {} },
            { type: 'action', name: 'wb_draw_text', params: { content: '板书', x: 20, y: 40 } },
            { type: 'text', content: '再想想结论。' },
          ]),
          model: 'fixture',
          usage: { prompt_tokens: 12, completion_tokens: 3 },
        }),
      );

    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    const events = await readEvents(response);
    expect(events.map((event) => event.type)).toEqual([
      'thinking',
      'thinking',
      'agent_start',
      'text_delta',
      'action',
      'text_delta',
      'agent_end',
      'done',
    ]);
    expect(events[2].data).toMatchObject({ agentName: '课堂助教', agentId: 'default-2' });
    expect(events[4].data).toMatchObject({
      actionName: 'wb_draw_text',
      params: { content: '板书' },
    });
    expect(events.at(-1)?.data).toMatchObject({
      totalAgents: 1,
      totalActions: 1,
      directorState: { turnCount: 1 },
    });

    expect(recordUsage).toHaveBeenCalledTimes(2);
    expect(recordUsage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: 'chat-adapter',
        modelId: 'fixture',
        usage: {
          inputTokens: 5,
          outputTokens: 2,
          cacheReadTokens: 6,
          cacheCreationTokens: 0,
          reasoningTokens: 0,
        },
      }),
    );
    expect(recordUsage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: 'chat-adapter-stream',
        modelId: 'fixture',
      }),
    );
    expect(fetchTurn).toHaveBeenCalledTimes(2);
    for (const [url, request] of fetchTurn.mock.calls) {
      expect(String(url)).toBe(endpoint);
      expect(request?.headers).toMatchObject({ Authorization: 'Bearer service-auth' });
      expect(request?.body).not.toMatch(/browser-key|browser\.invalid|browser-model/);
      expect(request?.redirect).toBe('error');
    }
    const messages: ClassroomTurnMessage[] = JSON.parse(
      fetchTurn.mock.calls[1][1]?.body as string,
    ).messages;
    expect(messages[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('课堂提示：提供示例'),
    });
    expect(messages[0].content).toContain('课件主题');
    expect(messages.slice(1).map((message) => message.role)).toEqual(['user', 'user', 'user']);
    expect(messages.slice(1).map((message) => message.content)).toEqual([
      '学生之前的问题',
      '[老师]: [{"type":"text","content":"老师之前的解释"}]',
      '现在的问题',
    ]);
  });

  it('honors a terminal director decision even when a speaker ID is present', async () => {
    const parseDecision = vi.spyOn(directorPrompt, 'parseDirectorDecision').mockReturnValueOnce({
      shouldEnd: true,
      nextAgentId: 'default-2',
    });
    fetchTurn.mockResolvedValueOnce(
      Response.json({ text: '{"next_agent":"END"}', model: 'fixture' }),
    );

    try {
      const events = await readEvents(await POST(makeRequest()));
      expect(parseDecision).toHaveBeenCalledTimes(1);
      expect(fetchTurn).toHaveBeenCalledTimes(1);
      expect(events.map(({ type }) => type)).toEqual(['thinking', 'done']);
      expect(events.at(-1)?.data).toMatchObject({
        totalAgents: 0,
        directorState: { turnCount: 0 },
      });
    } finally {
      parseDecision.mockRestore();
    }
  });

  it('fails closed when the server credential is missing', async () => {
    vi.stubEnv('HARNESS_SERVICE_SECRET', '');
    expect((await POST(makeRequest())).status).toBe(503);
    expect(fetchTurn).not.toHaveBeenCalled();
  });

  it('honors explicit disable even when Harness is configured', async () => {
    vi.stubEnv('DOJO_AI_ENABLED', 'no');
    expect((await POST(makeRequest())).status).toBe(503);
    expect(fetchTurn).not.toHaveBeenCalled();
  });

  it('reports upstream failures through the classroom stream', async () => {
    fetchTurn.mockResolvedValueOnce(
      Response.json({ error: 'fixture provider failure' }, { status: 502 }),
    );
    const response = await POST(makeRequest());
    const events = await readEvents(response);
    expect(events.map((event) => event.type)).toEqual(['thinking', 'error']);
    expect(events.at(-1)?.data).toEqual({ message: '对话服务暂时不可用。' });
    expect(fetchTurn).toHaveBeenCalledTimes(1);
  });

  it('keeps malformed service replies out of the public error stream', async () => {
    fetchTurn.mockResolvedValueOnce(new Response('fixture-private-provider-detail'));
    const events = await readEvents(await POST(makeRequest()));
    expect(events.at(-1)?.data).toEqual({ message: '对话服务未返回完整答复。' });
  });

  it('keeps transport errors out of the public error stream', async () => {
    fetchTurn.mockRejectedValueOnce(new Error('fixture-private-network-detail'));
    const events = await readEvents(await POST(makeRequest()));
    expect(events.at(-1)?.data).toEqual({ message: '对话服务暂时不可用。' });
  });
});
