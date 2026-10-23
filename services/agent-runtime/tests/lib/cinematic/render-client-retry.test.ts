import {afterEach, describe, expect, it, vi} from 'vitest';
import {inspectRenderedCinematic} from '@/lib/cinematic/render-client';
import {assemblySceneFixture} from '../../fixtures/cinematic-assembly';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('cinematic browser inspector connection', () => {
  it('retries a transient connection failure but still rejects an unauthorized response', async () => {
    vi.stubEnv('CINEMATIC_INSPECTOR_URL', 'http://inspector.test');
    vi.stubEnv('AISECEDU_SERVICE_SECRET', 'test-token');
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce(new Response(null, {status: 401}));
    vi.stubGlobal('fetch', fetch);
    await expect(inspectRenderedCinematic(assemblySceneFixture()))
      .rejects.toThrow('HTTP 401');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
