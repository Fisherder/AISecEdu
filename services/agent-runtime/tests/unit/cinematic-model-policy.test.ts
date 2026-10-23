import { describe, expect, it } from 'vitest';
import { cinematicModelThinking } from '@/lib/server/cinematic-model-policy';

describe('cinematic model reasoning policy', () => {
  const flash = { providerId: 'deepseek', modelId: 'deepseek-v4-flash' };

  it('enables bounded-call reasoning without changing the selected Flash model', () => {
    const before = structuredClone(flash);
    expect(cinematicModelThinking(flash, true)).toEqual({
      mode: 'enabled',
      enabled: true,
      effort: 'low',
    });
    expect(flash).toEqual(before);
  });

  it('keeps unrelated generation non-thinking', () => {
    expect(cinematicModelThinking(flash, false)).toEqual({ mode: 'disabled', enabled: false });
  });
  it.each(['cinematic-scene', 'cinematic-review', 'cinematic-repair'] as const)('uses direct structured output for %s to keep validated stages within deadline', (stage) => {
    expect(cinematicModelThinking(flash, true, stage)).toEqual({mode: 'disabled', enabled: false});
  });

  it.each(['process-scene', 'process-repair'] as const)('reasons about %s calculations and targeted fixes within the call deadline', stage => {
    expect(cinematicModelThinking(flash, true, stage)).toEqual({mode: 'enabled', enabled: true, effort: 'low'});
  });

  it.each([
    { providerId: 'deepseek', modelId: 'deepseek-v4-pro' },
    { providerId: 'other', modelId: 'deepseek-v4-flash' },
    { providerId: 'deepseek', modelId: 'unknown' },
  ])('does not change policy for an unverified provider/model: %j', (model) => {
    expect(cinematicModelThinking(model, true)).toEqual({ mode: 'disabled', enabled: false });
  });
});
