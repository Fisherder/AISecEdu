import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * Wiring guard: every PBL v2 *runtime* route must forward its MODEL_ROUTES
 * stage into model resolution, so operators can pin the shared runtime model
 * through `pbl-v2-runtime` or override a specific endpoint via
 * `pbl-v2-runtime:<endpoint>`.
 */
const mocks = vi.hoisted(() => ({
  resolveModelFromRequest: vi.fn(),
  resolveModel: vi.fn(),
}));

vi.mock('@/lib/server/resolve-model', () => ({
  resolveModelFromRequest: mocks.resolveModelFromRequest,
  resolveModel: mocks.resolveModel,
}));
vi.mock('@/lib/pbl/v2/api/sse', () => ({
  createSSEResponse: vi.fn(() => new Response('ok')),
}));
vi.mock('@/lib/pbl/v2/api/locale', () => ({
  applyRequestLocaleToProject: vi.fn(),
}));
vi.mock('@/lib/pbl/v2/agents/instructor', () => ({
  runInstructorTurn: vi.fn(),
}));
vi.mock('@/lib/pbl/v2/agents/simulator', () => ({
  runSimulatorTurn: vi.fn(),
}));
vi.mock('@/lib/pbl/v2/agents/evaluator', () => ({
  runTaskEvaluation: vi.fn(),
  runMilestoneEvaluation: vi.fn(),
  runFinalEvaluation: vi.fn(),
}));
vi.mock('@/lib/pbl/v2/operations/quiz-snapshot', () => ({
  applyQuizSignalsToProject: vi.fn(() => ({ updated: false, tierChanged: false })),
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/pbl/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe('PBL v2 runtime routes forward MODEL_ROUTES stages', () => {
  beforeEach(() => {
    mocks.resolveModelFromRequest.mockReset();
    mocks.resolveModelFromRequest.mockResolvedValue({
      model: {},
      thinkingConfig: undefined,
      modelInfo: null,
    });
  });

  it('instructor route forwards its runtime stage', async () => {
    const { POST } = await import('@/app/api/pbl/v2/instructor/route');
    await POST(makeRequest({ project: { id: 'p' }, userMessage: 'hi' }));
    expect(mocks.resolveModelFromRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'pbl-v2-runtime:instructor',
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it('image evaluation keeps the server-side runtime stage without caller credentials', async () => {
    vi.stubEnv('DOJO_AI_ENABLED', 'true');
    vi.stubEnv('HARNESS_INTERNAL_URL', 'http://harness.invalid:3081');
    vi.stubEnv('HARNESS_SERVICE_SECRET', 'fixture');
    mocks.resolveModel.mockResolvedValue({
      model: {},
      modelInfo: { capabilities: { vision: true } },
    });
    const { POST } = await import('@/app/api/pbl/v2/evaluate/route');
    await POST(
      makeRequest({
        project: {
          submissions: [{ microtaskId: 't1', fileUrl: '/image.png', mimeType: 'image/png' }],
        },
        kind: 'task',
        milestoneId: 'm1',
        microtaskId: 't1',
        apiKey: 'browser-key',
        baseUrl: 'https://browser.invalid',
      }),
    );
    expect(mocks.resolveModel).toHaveBeenCalledWith({ stage: 'pbl-v2-runtime:evaluate' });
    expect(mocks.resolveModelFromRequest).not.toHaveBeenCalled();
  });

  it('open-task route forwards its runtime stage', async () => {
    const { POST } = await import('@/app/api/pbl/v2/open-task/route');
    await POST(makeRequest({ project: { id: 'p' }, phase: 'greeting' }));
    expect(mocks.resolveModelFromRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'pbl-v2-runtime:open-task',
    );
  });

  it('simulator route forwards its runtime stage', async () => {
    const { POST } = await import('@/app/api/pbl/v2/simulator/route');
    await POST(makeRequest({ project: { id: 'p' }, userMessage: 'hi' }));
    expect(mocks.resolveModelFromRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'pbl-v2-runtime:simulator',
    );
  });
});
