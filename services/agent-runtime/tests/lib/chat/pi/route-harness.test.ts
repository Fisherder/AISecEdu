import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/chat/pi/route';
import { recordUsage } from '@/lib/server/usage-storage';
import type { DirectorState, StatelessEvent } from '@/lib/types/chat';

vi.mock('@/lib/server/usage-storage', () => ({ recordUsage: vi.fn() }));

const fetchTurn = vi.fn<typeof fetch>();

function request(
  agentIds: unknown = ['default-1', 'default-2'],
  directorState?: DirectorState,
  whiteboard: unknown[] = [],
  currentSceneId = 'public-slide',
  language?: string,
) {
  return new NextRequest('http://localhost/api/chat/pi', {
    method: 'POST',
    headers: language ? { 'X-User-Locale': language, 'Accept-Language': 'zh-CN' } : undefined,
    body: JSON.stringify({
      messages: [
        { id: 'first', role: 'user', parts: [{ type: 'text', text: '请讲盆栽需要多少水。' }] },
      ],
      storeState: {
        stage: { id: 'lesson', name: '家庭园艺', whiteboard },
        currentSceneId,
        mode: 'autonomous',
        whiteboardOpen: false,
        scenes: [
          {
            id: 'public-slide',
            title: '盆栽灌溉',
            type: 'slide',
            order: 0,
            content: {
              type: 'slide',
              canvas: {
                elements: [
                  { id: 'text', type: 'text', content: '量杯刻度是 50 毫升。', left: 0, top: 0 },
                ],
              },
            },
          },
          {
            id: 'private-lab',
            title: 'internal-lab-title',
            type: 'interactive',
            order: 1,
            content: { privateSolution: 'do-not-forward' },
          },
        ],
      },
      config: { agentIds, piEnableWhiteboardTools: true, discussionTopic: '如何量水' },
      directorState,
      apiKey: 'browser-secret',
      baseUrl: 'https://browser.invalid',
      model: 'browser-model',
    }),
  });
}

function propose(value: unknown) {
  fetchTurn.mockResolvedValueOnce(
    Response.json({
      model: 'fixture-model',
      text: JSON.stringify(value),
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    }),
  );
}

async function events(response: Response): Promise<StatelessEvent[]> {
  return (await response.text())
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)));
}

describe('Pi classroom through Harness', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_PI_CHAT_ENABLED', 'true');
    vi.stubEnv('DOJO_AI_ENABLED', 'auto');
    vi.stubEnv('HARNESS_CONFIGURED', 'true');
    vi.stubEnv('OPENMAIC_ENABLE_PI_WEB_SEARCH', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture-auth');
    vi.stubGlobal('fetch', fetchTurn);
  });

  afterEach(() => {
    fetchTurn.mockReset();
    vi.mocked(recordUsage).mockClear();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('respects the route feature flag and rejects unknown roles before contacting Harness', async () => {
    vi.stubEnv('NEXT_PUBLIC_PI_CHAT_ENABLED', '');
    expect((await POST(request())).status).toBe(404);
    vi.stubEnv('NEXT_PUBLIC_PI_CHAT_ENABLED', 'true');
    expect((await POST(request('not-a-list'))).status).toBe(400);
    expect((await POST(request(['default-1', 'unknown']))).status).toBe(400);
    vi.stubEnv('DOJO_AI_ENABLED', 'no');
    expect((await POST(request())).status).toBe(503);
    expect(fetchTurn).not.toHaveBeenCalled();
  });

  it('uses only the visible scene, runs real role and board presentation, and cues once', async () => {
    propose({ type: 'read_scene', sceneId: 'private-lab' });
    propose({ type: 'read_scene', sceneId: 'public-slide' });
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '解释量杯标记。' });
    propose([
      { type: 'text', content: '先量取 50 毫升。' },
      { type: 'action', name: 'wb_draw_text', params: { content: '50 毫升', x: 10, y: 20 } },
      { type: 'action', name: 'unknown_ui_action', params: {} },
    ]);
    propose({ type: 'cue_user', prompt: '还想看哪一部分？' });

    const response = await POST(request());
    expect(response.status).toBe(200);
    const received = await events(response);
    expect(received.map((event) => event.type)).toEqual([
      'agent_start',
      'text_delta',
      'action',
      'agent_end',
      'cue_user',
      'done',
    ]);
    expect(received[2].data).toMatchObject({
      actionName: 'wb_draw_text',
      params: { content: '50 毫升' },
    });
    expect(received.at(-1)?.data).toMatchObject({
      totalAgents: 1,
      totalActions: 1,
      sessionClosed: false,
      cueUserReceived: true,
      directorToolTrace: [
        { toolName: 'read_scene', isError: true },
        { toolName: 'read_scene', isError: false },
        { toolName: 'call_agent', isError: false },
        { toolName: 'cue_user', isError: false },
      ],
    });
    expect(fetchTurn).toHaveBeenCalledTimes(5);
    for (const [url, options] of fetchTurn.mock.calls) {
      expect(String(url)).toBe('http://harness.invalid:3081/v1/turn');
      expect(options?.headers).toMatchObject({ Authorization: 'Bearer fixture-auth' });
      expect(options?.body).not.toMatch(
        /browser-secret|browser\.invalid|browser-model|internal-lab-title|do-not-forward/,
      );
    }
    const firstDirectorTurn = JSON.parse(String(fetchTurn.mock.calls[0][1]?.body));
    expect(firstDirectorTurn.messages.at(-1)).toMatchObject({
      role: 'user',
      content: expect.stringContaining('Discussion context: 如何量水\nLatest user message: 请讲盆栽需要多少水。'),
    });
    expect(fetchTurn.mock.calls[3][1]?.body).toContain('量杯刻度是 50 毫升');
    expect(recordUsage).toHaveBeenCalledTimes(5);
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'pi-chat-child',
        modelId: 'fixture-model',
      }),
    );
  });

  it('accepts a single JSON fence while retaining the strict director schema', async () => {
    fetchTurn.mockResolvedValueOnce(Response.json({
      model: 'fixture-model',
      text: '```json\n{"type":"call_agent","agentId":"default-1","instruction":"介绍量杯。"}\n```',
    }));
    propose([{ type: 'text', content: '保持量杯水平。' }]);
    propose({ type: 'cue_user' });
    expect((await events(await POST(request()))).at(-1)?.type).toBe('done');
    expect(fetchTurn).toHaveBeenCalledTimes(3);

    propose({ type: 'call_agent', agentId: 'default-1', instruction: '介绍量杯。', reason: 'extra' });
    expect((await events(await POST(request()))).map(({ type }) => type)).toEqual(['error']);
    expect(fetchTurn).toHaveBeenCalledTimes(4);
  });

  it('rejects a search proposal even if the legacy search flag is set', async () => {
    propose({ type: 'web_search', query: 'weather' });
    expect((await events(await POST(request()))).map((event) => event.type)).toEqual(['error']);
    expect(fetchTurn).toHaveBeenCalledTimes(1);
  });

  it('retains agent history while counting only the current Pi round', async () => {
    const previous = {
      agentId: 'default-1', agentName: '老师', contentPreview: '上次介绍了观察量杯。',
      actionCount: 0, whiteboardActions: [],
    };
    const state = { turnCount: 4, agentResponses: [previous], whiteboardLedger: [] };
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '用一句话回顾。' });
    propose([{ type: 'text', content: '把量杯放平再读数。' }]);
    propose({ type: 'cue_user' });

    const received = await events(await POST(request(undefined, state)));
    expect(received.at(-1)?.data).toMatchObject({
      totalAgents: 1,
      cueUserReceived: true,
      directorState: {
        turnCount: 1,
        agentResponses: [previous, { contentPreview: '把量杯放平再读数。' }],
      },
    });
  });

  it('uses the current board snapshot without replaying stale client ledger text', async () => {
    const state: DirectorState = {
      turnCount: 1,
      agentResponses: [],
      whiteboardLedger: [{
        actionName: 'wb_draw_text',
        agentId: 'default-1',
        agentName: '老师',
        params: { content: 'flag{STALE_BOARD_FIXTURE}', x: 5, y: 5 },
      }],
    };
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '回顾目前板书。' });
    propose([{ type: 'text', content: '观察一下现有记录。' }]);
    propose({ type: 'cue_user' });

    const received = await events(await POST(request(undefined, state, [{
      elements: [{ id: 'visible', type: 'text', content: '已画板书示例', left: 0, top: 0 }],
    }])));
    expect(fetchTurn.mock.calls[1][1]?.body).toContain('已画板书示例');
    expect(JSON.stringify(fetchTurn.mock.calls)).not.toContain('STALE_BOARD_FIXTURE');
    expect(JSON.stringify(received)).not.toContain('STALE_BOARD_FIXTURE');
    expect(received.at(-1)?.data).toMatchObject({ directorState: { whiteboardLedger: [] } });
  });

  it('rejects an unsupported current scene before sending any provider context', async () => {
    const response = await POST(request(undefined, undefined, [], 'private-lab'));
    expect(response.status).toBe(422);
    expect(fetchTurn).not.toHaveBeenCalled();
  });

  it('returns the completed teaching and board state after a later director failure', async () => {
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '介绍量杯。' });
    propose([
      { type: 'text', content: '把量杯保持水平。' },
      { type: 'action', name: 'wb_draw_text', params: { content: '水平读数', x: 10, y: 20 } },
    ]);
    propose({ type: 'cue_user', prompt: '继续。', unknown: 'PRIVATE_FIXTURE_SENTINEL' });

    const received = await events(await POST(request()));
    expect(received.some(event => event.type === 'error')).toBe(false);
    expect(received.find(event => event.type === 'cue_user')?.data).toMatchObject({
      prompt: '本轮课堂对话提前结束，你可以继续提问。',
    });
    expect(received.at(-1)).toMatchObject({
      type: 'done',
      data: {
        cueUserReceived: true,
        directorState: {
          agentResponses: [{ contentPreview: '把量杯保持水平。' }],
          whiteboardLedger: [{ actionName: 'wb_draw_text', params: { content: '水平读数' } }],
        },
        directorToolTrace: [{ toolName: 'call_agent' }],
      },
    });
    expect(JSON.stringify(received)).not.toContain('PRIVATE_FIXTURE_SENTINEL');
    expect(fetchTurn).toHaveBeenCalledTimes(3);
  });

  it('localizes malformed decisions without changing the teacher’s speech', async () => {
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '介绍量杯。' });
    propose([{ type: 'text', content: '把量杯保持水平。' }]);
    propose({ type: 'invalid' });

    const received = await events(await POST(request(undefined, undefined, [], undefined, 'en-US')));
    expect(received.find(event => event.type === 'text_delta')?.data).toMatchObject({
      content: '把量杯保持水平。',
    });
    expect(received.find(event => event.type === 'cue_user')?.data).toMatchObject({
      prompt: 'This classroom turn ended early. You can keep asking questions.',
    });
  });

  it.each(['director transport', 'director usage recording', 'child usage recording'])(
    'surfaces a later %s failure after visible classroom output',
    async (failure) => {
      propose({ type: 'call_agent', agentId: 'default-1', instruction: '介绍量杯。' });
      propose([
        { type: 'text', content: '把量杯保持水平。' },
        { type: 'action', name: 'wb_draw_text', params: { content: '水平读数', x: 10, y: 20 } },
      ]);

      if (failure === 'director transport') {
        fetchTurn.mockRejectedValueOnce(new TypeError('network unavailable'));
      } else {
        vi.mocked(recordUsage).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
        if (failure === 'child usage recording') {
          propose({ type: 'call_agent', agentId: 'default-2', instruction: '补充量杯知识。' });
          propose([{ type: 'text', content: '量杯有刻度。' }]);
          vi.mocked(recordUsage).mockResolvedValueOnce(undefined);
        } else {
          propose({ type: 'cue_user' });
        }
        vi.mocked(recordUsage).mockRejectedValueOnce(new Error('usage recording unavailable'));
      }

      const received = await events(await POST(request()));
      expect(received.some(event => event.type === 'text_delta')).toBe(true);
      expect(JSON.stringify(received)).toContain('水平读数');
      expect(received.some(event => event.type === 'done' || event.type === 'cue_user')).toBe(false);
      expect(received.at(-1)).toMatchObject({
        type: 'error',
        data: { message: failure === 'director transport' ? '对话服务暂时不可用。' : 'usage recording unavailable' },
      });
      expect(fetchTurn).toHaveBeenCalledTimes(failure === 'child usage recording' ? 4 : 3);
    },
  );

  it('ends the request on a failed child turn without spending another director attempt', async () => {
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '介绍量杯。' });
    fetchTurn.mockResolvedValueOnce(Response.json({ error: 'fixture unavailable' }, { status: 503 }));
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '不应继续下一轮。' });

    const received = await events(await POST(request()));
    expect(received.map((event) => event.type)).toEqual(['agent_start', 'agent_end', 'error']);
    expect(fetchTurn).toHaveBeenCalledTimes(2);
  });

  it('closes only after a visible classroom turn', async () => {
    propose({ type: 'close_session', endReason: 'user_done' });
    propose({ type: 'call_agent', agentId: 'default-1', instruction: '用一句话结束。' });
    propose([{ type: 'text', content: '那我们回到课程。' }]);
    propose({ type: 'close_session', endReason: 'user_done' });
    const received = await events(await POST(request()));
    expect(received.map((event) => event.type)).toEqual([
      'agent_start',
      'text_delta',
      'agent_end',
      'done',
    ]);
    expect(received.at(-1)?.data).toMatchObject({
      sessionClosed: true,
      cueUserReceived: false,
      endReason: 'user_done',
    });
  });
});
