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
) {
  return new NextRequest('http://localhost/api/chat/pi', {
    method: 'POST',
    body: JSON.stringify({
      messages: [
        { id: 'first', role: 'user', parts: [{ type: 'text', text: '请讲盆栽需要多少水。' }] },
      ],
      storeState: {
        stage: { id: 'lesson', name: '家庭园艺', whiteboard },
        currentSceneId: 'public-slide',
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
