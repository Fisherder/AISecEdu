import type { ThinkingConfig } from '@/lib/types/provider';

export function cinematicModelThinking(
  model: { providerId: string; modelId: string },
  cinematic: boolean,
  stage?: 'cinematic-scene' | 'cinematic-repair' | 'cinematic-review' | 'intent-source-verification' | 'process-scene' | 'process-repair',
): ThinkingConfig {
  if (model.providerId === 'deepseek' && ['deepseek-chat', 'deepseek-v4.1-flash'].includes(model.modelId))
    return { mode: 'disabled', enabled: false };
  if (cinematic && ['cinematic-scene', 'cinematic-review', 'intent-source-verification', 'cinematic-repair'].includes(stage || '') && model.providerId === 'deepseek' && model.modelId === 'deepseek-v4-flash')
    return { mode: 'disabled', enabled: false };
  if (cinematic && model.providerId === 'deepseek' && model.modelId === 'deepseek-v4-flash')
    return { mode: 'enabled', enabled: true, effort: 'low' };
  return { mode: 'disabled', enabled: false };
}

/** The visual job wrapper may retry one timed-out call with a direct answer.
 * Keep this list aligned with the DeepSeek model IDs actually routed in
 * production; semantic/validation failures are handled by their own stages. */
export function supportsCinematicTimeoutRecovery(model: {providerId: string; modelId: string}): boolean {
  return model.providerId === 'deepseek' &&
    ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-v4.1-flash'].includes(model.modelId);
}

export function teacherPlanningModelThinking(model: { providerId: string; modelId: string; thinkingConfig?: ThinkingConfig }): ThinkingConfig | undefined {
  if (model.providerId === 'deepseek' && ['deepseek-chat', 'deepseek-v4.1-flash'].includes(model.modelId))
    return { mode: 'disabled', enabled: false };
  return model.providerId === 'deepseek' && model.modelId === 'deepseek-v4-flash'
    ? { mode: 'enabled', enabled: true, effort: 'low' } : model.thinkingConfig;
}
