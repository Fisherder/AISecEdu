import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callLLM: vi.fn(),
  resolveModel: vi.fn(),
  generate: vi.fn(),
  diagram: vi.fn(),
}));
vi.mock('@/lib/ai/llm', () => ({ callLLM: mocks.callLLM }));
vi.mock('@/lib/server/resolve-model', () => ({ resolveModel: mocks.resolveModel }));
vi.mock('@/lib/server/aisecedu-integration', () => ({
  AISECEDU_SERVICE_HEADER: 'X-AISecEdu-Service-Token',
  aiseceduInternalOrigin: () => 'http://ctfd',
  serviceTokenForInternalCall: () => 'integration-secret',
}));
vi.mock('@/lib/server/animated-explainer', async (original) => ({
  ...(await original<typeof import('@/lib/server/animated-explainer')>()),
  generateAnimatedExplainer: mocks.generate,
}));
vi.mock('@/lib/server/lesson-generation', () => ({ generateSingleArtifact: mocks.diagram }));

function verifiedIntentResponse(parameters: {messages: Array<{content: string}>}) {
  const input = JSON.parse(parameters.messages[1].content);
  return {text: JSON.stringify({intent: input.candidateIntent, sourceChecks: input.sourceRequirements.map((item: {index: number; text: string}) => ({index: item.index, quote: item.text, fulfilled: true, evidence: '明确保留原文范围'}))})};
}

function request(kind: string, payload: Record<string, unknown>, signal?: AbortSignal) {
  return new NextRequest('http://localhost/api/integration/jobs/execute', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-AISecEdu-Service-Token': 'integration-secret',
    },
    body: JSON.stringify({
      jobId: 'job_test_reasoning',
      kind,
      scope: { ownerId: 7 },
      payload,
      modelRoute: { route: 'standard', provider: 'deepseek', actual_model: 'deepseek-v4-flash' },
    }),
  });
}

describe('cinematic reasoning in authenticated job routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveModel.mockResolvedValue({
      providerId: 'deepseek',
      modelId: 'deepseek-v4-flash',
      modelString: 'deepseek:deepseek-v4-flash',
      model: { id: 'flash' },
      modelInfo: { outputWindow: 393216 },
    });
    mocks.generate.mockImplementation(async (_input, order, aiCall) => {
      await aiCall('Scene synthesis test', 'No private input');
      return {
        id: 'generated_test',
        type: 'simulation',
        title: 'Test scene',
        order,
        createdAt: 1,
        content: { renderingMode: 'cinematic-v1', html: '<main></main>' },
      };
    });
  });

  it('reasons about source fidelity before cinematic synthesis', async () => {
    const fullRequest =
      '需要详细观察同一三维装置。'.repeat(1800) + '最后的独立要求：复原全部结构。';
    mocks.callLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: 'cinematic-v1',
          reason: '需要三维空间观察',
          objects: ['装置'],
          interactions: [],
          interactionRequirements: [],
          visualPriorities: [],
        }),
      })
      .mockImplementationOnce(verifiedIntentResponse)
      .mockResolvedValueOnce({ text: '{}' });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request('artifact.materialize', {
        artifactType: 'simulation',
        requestPrompt: fullRequest,
        plan: { title: 'Test scene' },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.callLLM).toHaveBeenCalledTimes(3);
    expect(JSON.parse(mocks.callLLM.mock.calls[0][0].messages[1].content).request).toBe(
      fullRequest,
    );
    expect(mocks.generate.mock.calls[0][0].originalRequest).toBe(fullRequest);
    expect(mocks.generate.mock.calls[0][0].description).toContain('最后的独立要求：复原全部结构。');
    expect(mocks.callLLM.mock.calls[0][3]).toEqual({ mode: 'enabled', enabled: true, effort: 'low' });
    expect(mocks.callLLM.mock.calls[1][3]).toEqual({
      mode: 'enabled',
      enabled: true,
      effort: 'low',
    });
    expect(mocks.callLLM.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
    expect(mocks.callLLM.mock.calls[1][0].abortSignal).toBeInstanceOf(AbortSignal);
    expect(mocks.callLLM.mock.calls[1][0].maxRetries).toBe(0);
    expect(await mocks.callLLM.mock.calls[1][0].output.responseFormat).toEqual({ type: 'json' });
    for (const call of mocks.callLLM.mock.calls) {
      expect(call[0].model).toEqual({ id: 'flash' });
      expect(call[0].messages[0].content).toMatch(/json/i);
      expect(call[0].maxOutputTokens).toBe(call === mocks.callLLM.mock.calls.at(-1) ? 48000 : 24000);
    }
  });

  it('reasons about the requested 2D format before synthesis', async () => {
    mocks.callLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: 'interactive-2d',
          twoDimensionalFormat: 'diagram',
          reason: '明确只需二维节点关系',
          objects: ['步骤'],
          interactions: [],
          interactionRequirements: [],
          visualPriorities: [],
        }),
      })
      .mockImplementationOnce(verifiedIntentResponse)
      .mockResolvedValueOnce({ text: '{}' });
    mocks.diagram.mockImplementation(async (_input, order, aiCall) => {
      await aiCall('Diagram synthesis test', 'No private input');
      return {
        id: 'diagram_test',
        type: 'diagram',
        title: '二维流程',
        order,
        createdAt: 1,
        content: {
          widgetType: 'diagram',
          html: '<main data-diagram="v1"></main>',
          widgetConfig: { nodes: [{ id: 'step', details: '完整节点说明' }] },
        },
      };
    });
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request('artifact.materialize', {
        artifactType: 'simulation',
        requestPrompt: '只需要二维流程图',
        plan: { title: '二维流程' },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.callLLM).toHaveBeenCalledTimes(3);
    expect(mocks.callLLM.mock.calls[0][3]).toEqual({ mode: 'enabled', enabled: true, effort: 'low' });
    expect(mocks.callLLM.mock.calls[1][3]).toEqual({ mode: 'enabled', enabled: true, effort: 'low' });
  });

  it('uses the same Flash policy and output cap when revising an existing cinematic scene', async () => {
    mocks.callLLM.mockResolvedValue({ text: '{}' });
    const visualIntent = {
      mode: 'cinematic-v1',
      reason: '保留三维原需求和真实播放器控件',
      objects: ['处理器', '逻辑栈'],
      interactions: ['播放与暂停', '帧标记进入逻辑栈'],
      visualPriorities: ['动作与文字同步'],
      interactionRequirements: [
        { description: '播放与暂停', kind: 'player-control', controls: ['play', 'pause'] },
        { description: '帧标记进入逻辑栈', kind: 'state-change' },
      ],
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request('artifact.revise', {
        artifactType: 'simulation',
        instruction: '改善镜头',
        currentContent: {
          plan: { visualIntent },
          lesson: {
            title: 'Test scene',
            artifacts: [
              {
                id: 'original',
                title: 'Test scene',
                outline: {},
                content: { renderingMode: 'cinematic-v1', html: '<main></main>' },
              },
            ],
          },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0].visualIntent).toEqual(visualIntent);
    expect(mocks.callLLM.mock.calls[0][3]).toEqual({
      mode: 'enabled',
      enabled: true,
      effort: 'low',
    });
    expect(mocks.callLLM.mock.calls[0][0].maxOutputTokens).toBe(48000);
    expect(mocks.callLLM.mock.calls[0][0].model).toEqual({ id: 'flash' });
    expect(await mocks.callLLM.mock.calls[0][0].output.responseFormat).toEqual({ type: 'json' });
    const result = await response.json();
    expect(result.result.content.lesson.artifacts[0].id).toBe('original');
  });

  it('revises only the selected artifact using its own frozen contract', async () => {
    mocks.callLLM.mockResolvedValueOnce({text: JSON.stringify({artifactIds: ['scene-1'], reason: '教师指定第二件作品'})}).mockResolvedValue({ text: '{}' });
    const intents = ['处理器', '管路'].map((object) => ({
      mode: 'cinematic-v1',
      reason: '保留该作品自己的完整三维教学要求',
      objects: [object],
      interactions: ['观察' + object],
      visualPriorities: [],
      interactionRequirements: [{ description: '观察' + object, kind: 'view' }],
    }));
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request('artifact.revise', {
        artifactType: 'simulation',
        instruction: '改善镜头',
        currentContent: {
          lesson: {
            title: 'Two scenes',
            artifacts: intents.map((cinematicIntent, index) => ({
              id: 'scene-' + index,
              title: 'Scene ' + index,
              outline: {},
              content: { renderingMode: 'cinematic-v1', html: '<main></main>', cinematicIntent },
            })),
          },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][0].visualIntent).toEqual(intents[1]);
    const result = await response.json();
    expect(result.result.content.lesson.artifacts[0].content).toEqual({renderingMode: 'cinematic-v1', html: '<main></main>', cinematicIntent: intents[0]});
    expect(result.result.content.lesson.artifacts[1].id).toBe('scene-1');
  });

  it('validates every frozen revision contract before starting any model call', async () => {
    const valid = {
      mode: 'cinematic-v1',
      reason: '保留已验证三维要求',
      objects: ['处理器'],
      interactions: [],
      interactionRequirements: [],
      visualPriorities: [],
    };
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const response = await POST(
      request('artifact.revise', {
        artifactType: 'simulation',
        instruction: '改善镜头',
        currentContent: {
          lesson: {
            title: 'Two scenes',
            artifacts: [valid, { ...valid, mode: 'interactive-2d' }].map(
              (cinematicIntent, index) => ({
                id: 'scene-' + index,
                title: 'Scene ' + index,
                outline: {},
                content: { renderingMode: 'cinematic-v1', html: '<main></main>', cinematicIntent },
              }),
            ),
          },
        },
      }),
    );
    expect(response.status).toBe(500);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });

  it('aborts a disconnected cinematic request without returning or persisting a late artifact', async () => {
    const controller = new AbortController();
    mocks.callLLM
      .mockResolvedValueOnce({
        text: JSON.stringify({
          mode: 'cinematic-v1',
          reason: '需要三维空间观察',
          objects: ['装置'],
          interactions: [],
          interactionRequirements: [],
          visualPriorities: [],
        }),
      })
      .mockImplementationOnce(() => new Promise(() => {}));
    const { POST } = await import('@/app/api/integration/jobs/execute/route');
    const pending = POST(
      request(
        'artifact.materialize',
        { artifactType: 'simulation', requestPrompt: '观察三维装置', plan: { title: '装置' } },
        controller.signal,
      ),
    );
    await vi.waitFor(() => expect(mocks.callLLM).toHaveBeenCalledTimes(2));
    const providerSignal = mocks.callLLM.mock.calls[1][0].abortSignal as AbortSignal;
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      success: false,
      errorCode: 'GENERATION_TEMPORARILY_UNAVAILABLE',
    });
    expect(providerSignal.aborted).toBe(true);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });
});
