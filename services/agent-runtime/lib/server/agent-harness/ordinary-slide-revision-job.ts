import { createHash } from 'node:crypto';
import { createHarnessTurn } from './classroom-turn';
import type { OrdinaryTeachingModel } from './ordinary-teaching';
import type { OrdinarySlideRevisionJob } from './ordinary-slide-revision-contract';

export function pinnedSlideRevisionModel(
  route: Record<string, unknown>, job: OrdinarySlideRevisionJob, signal: AbortSignal,
): OrdinaryTeachingModel | undefined {
  const modelId = process.env.HARNESS_DEEPSEEK_MODEL?.trim();
  if (!modelId || route.route !== job.route || route.provider !== 'deepseek' ||
      route.actual_model !== modelId || route.required_model !== modelId || route.allow_degraded !== false) {
    return;
  }
  signal.throwIfAborted();
  const turn = createHarnessTurn();
  if (turn) return {turn, modelId, signal};
}

export function completedSlideRevision(
  result: Record<string, unknown>, usage: Record<string, number>, model: OrdinaryTeachingModel,
  job: OrdinarySlideRevisionJob, started: number,
) {
  model.signal.throwIfAborted();
  return {
    status: 200,
    body: {success: true, result, model: {
      provider: 'deepseek', actualModel: model.modelId, modelVersion: 'deepseek:' + model.modelId, usage,
      latencyMs: Date.now() - started, responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      degraded: false, executionMode: job.backend,
    }},
  };
}
