import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentModelConfig } from '@/lib/utils/model-config';

vi.mock('@/lib/store/settings', () => ({
  useSettingsStore: { getState: () => { throw new Error('Integrated classrooms must not read personal provider credentials'); } },
}));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('integrated classroom model configuration', () => {
  it('uses the server-selected classroom model without asking students for provider credentials', () => {
    vi.stubEnv('NEXT_PUBLIC_AISECEDU_INTEGRATED', 'true');
    vi.stubGlobal('window', { __AISECEDU_CLASSROOM_MODEL__: 'deepseek:course-model' });
    const config = getCurrentModelConfig();
    expect(config.modelString).toBe('deepseek:course-model');
    expect(config.modelId).toBe('course-model');
    expect(config.isServerConfigured).toBe(true);
    expect(config.requiresApiKey).toBe(false);
    expect(config.apiKey).toBe('');
    expect(config.baseUrl).toBe('');
  });

  it('does not pretend that an unconfigured server has a model', () => {
    vi.stubEnv('NEXT_PUBLIC_AISECEDU_INTEGRATED', 'true');
    vi.stubGlobal('window', {});
    expect(getCurrentModelConfig().modelId).toBe('');
    expect(getCurrentModelConfig().isServerConfigured).toBe(false);
  });
});
