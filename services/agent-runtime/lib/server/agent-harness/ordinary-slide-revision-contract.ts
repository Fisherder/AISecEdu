export const slideLayoutJob = {
  scope: 'slide-layout',
  backend: 'ordinary-slide-layout',
  route: 'upstream-ordinary-slide-layout',
  pin: 'ordinarySlideLayout',
  invalid: {
    status: 422,
    body: {
      success: false, error: '此内部地址仅接收锁定的普通静态课件版式修订。',
      errorCode: 'INVALID_ORDINARY_SLIDE_LAYOUT_JOB', failureCategory: 'permanent',
    },
  },
} as const;

export const deckRevisionJob = {
  scope: 'deck-revision',
  backend: 'ordinary-deck-revision',
  route: 'upstream-ordinary-deck-revision',
  pin: 'ordinaryDeckRevision',
  invalid: {
    status: 422,
    body: {
      success: false, error: '此内部地址仅接收已锁定的普通静态课件修订。',
      errorCode: 'INVALID_ORDINARY_DECK', failureCategory: 'permanent',
    },
  },
} as const;

export type OrdinarySlideRevisionJob = typeof slideLayoutJob | typeof deckRevisionJob;

export function jobRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function hasJobPin(
  job: OrdinarySlideRevisionJob,
  body: {scope?: unknown; modelRoute?: unknown},
  payload: Record<string, unknown>,
) {
  return jobRecord(body.scope)?.ordinaryTeaching === job.scope ||
    jobRecord(body.modelRoute)?.route === job.route ||
    payload.revisionBackend === job.backend ||
    Object.hasOwn(payload, job.pin);
}

export function pinnedOrdinarySlideRevision(body: {scope?: unknown; modelRoute?: unknown; payload?: unknown}) {
  const payload = jobRecord(body.payload) ?? {};
  if (hasJobPin(slideLayoutJob, body, payload)) return slideLayoutJob.invalid;
  if (hasJobPin(deckRevisionJob, body, payload) || Object.hasOwn(payload, 'deckOperation')) {
    return deckRevisionJob.invalid;
  }
}

export function ordinarySlideRevisionInput(body: Record<string, unknown>, job: OrdinarySlideRevisionJob) {
  const scope = jobRecord(body.scope);
  const payload = jobRecord(body.payload);
  const modelRoute = jobRecord(body.modelRoute);
  const otherJob = job === slideLayoutJob ? deckRevisionJob : slideLayoutJob;
  const ownerId = scope?.ownerId;
  const dojoId = scope?.dojoId;
  const moduleIndex = scope?.moduleIndex;
  if (!payload || body.kind !== 'artifact.revise' || scope?.ordinaryTeaching !== job.scope ||
      payload.revisionBackend !== job.backend || payload.artifactType !== 'slide-deck' ||
      payload.workspaceId != null || hasJobPin(otherJob, body, payload) ||
      (payload.deckOperation !== undefined && (job === slideLayoutJob || payload.deckOperation !== 'palette')) ||
      typeof ownerId !== 'number' || !Number.isSafeInteger(ownerId) || ownerId <= 0 ||
      typeof dojoId !== 'number' || !Number.isSafeInteger(dojoId) ||
      (moduleIndex != null && (typeof moduleIndex !== 'number' || !Number.isSafeInteger(moduleIndex)))) {
    return {error: job.invalid};
  }
  if (typeof body.jobId !== 'string' || !body.jobId.trim() || !modelRoute?.actual_model) {
    return {error: {status: 400, body: {success: false, error: 'jobId, kind and modelRoute are required'}}};
  }
  return {payload, modelRoute, scope: {jobId: body.jobId, ownerId, dojoId, moduleIndex}};
}
