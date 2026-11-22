import {createHash} from 'node:crypto';
import {createHarnessTurn} from './classroom-turn';
import {createPinnedCandidateModel, generateOrdinaryCandidates} from './ordinary-candidate-generation';
import {
  InvalidLessonPlanResponse, materializeOrdinaryLessonPlan, ORDINARY_LESSON_REQUEST_LIMIT,
  ordinaryLessonCandidateInput, ordinaryLessonPlanInput,
} from './ordinary-lesson-plan';

const generationReason = 'teacher_requested_ordinary_lesson_plan';
const candidateRoute = 'upstream-lesson-plan-candidate';
const materializeRoute = 'upstream-lesson-plan-materialize';
const materializeScope = 'lesson-plan-materialize';

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function isPinnedOrdinaryLessonPlanJob(body: {scope?: unknown; modelRoute?: unknown; payload?: unknown}) {
  const payload = record(body.payload) ?? {};
  const route = record(body.modelRoute)?.route;
  return payload.generationReason === generationReason || Object.hasOwn(payload, 'ordinaryCandidateModel') ||
    Object.hasOwn(payload, 'ordinaryLessonPlan') || record(body.scope)?.ordinaryTeaching === materializeScope ||
    route === candidateRoute || route === materializeRoute;
}

export const invalidOrdinaryLessonPlanJob = {
  status: 422,
  body: {success: false, error: '此内部地址仅接收已锁定的普通教案任务。',
    errorCode: 'INVALID_ORDINARY_LESSON_PLAN_JOB', failureCategory: 'permanent'},
};

function invalidInput(candidate: boolean, error?: string) {
  return {status: 422, body: {success: false,
    error: error ?? (candidate ? '普通教案方案需要教师课程和已固定的生成任务。' : '教案任务缺少已选方案、版本或完整资料摘要。'),
    errorCode: candidate ? 'INVALID_ORDINARY_LESSON_PLAN_CANDIDATE' : 'INVALID_ORDINARY_LESSON_PLAN',
    failureCategory: 'permanent',
  }};
}

function unavailable(candidate: boolean) {
  return {status: 503, body: {success: false,
    error: candidate ? '普通教案方案服务暂不可用，请重新发起生成。' : '普通教案生成服务暂不可用，请稍后重试。',
    errorCode: candidate ? 'ORDINARY_LESSON_PLAN_CANDIDATE_UNAVAILABLE' : 'ORDINARY_LESSON_PLAN_UNAVAILABLE',
    failureCategory: 'service',
  }};
}

export async function executeOrdinaryLessonPlanJob(body: Record<string, unknown>, signal: AbortSignal, started: number) {
  const payload = record(body.payload) ?? {};
  const scope = record(body.scope);
  const route = record(body.modelRoute);
  const candidate = body.kind === 'candidate.generate' && scope?.ordinaryTeaching === 'candidate-plan' &&
    payload.generationReason === generationReason &&
    typeof payload.ordinaryCandidateModel === 'string' && Boolean(payload.ordinaryCandidateModel.trim());
  const materialize = body.kind === 'artifact.materialize' && scope?.ordinaryTeaching === materializeScope &&
    payload.generationReason !== generationReason && !Object.hasOwn(payload, 'ordinaryCandidateModel');
  if (payload.artifactType !== 'lesson-plan' || !(candidate || materialize) ||
      Object.hasOwn(payload, 'ordinaryDebate') || Object.hasOwn(payload, 'debateAuthoringBackend') ||
      Object.hasOwn(payload, 'ordinaryLessonPlanRevisionModel') || Object.hasOwn(payload, 'ordinaryLessonPlanRevision') ||
      payload.revisionBackend === 'ordinary-lesson-plan-revise' ||
      (candidate && Object.hasOwn(payload, 'ordinaryLessonPlan'))) return invalidOrdinaryLessonPlanJob;

  if (typeof body.jobId !== 'string' || !body.jobId.trim() || !route?.actual_model) {
    return {status: 400, body: {success: false, error: 'jobId, kind and modelRoute are required'}};
  }
  const ownerId = scope?.ownerId;
  if (payload.workspaceId != null || typeof ownerId !== 'number' || !Number.isSafeInteger(ownerId) ||
      ownerId <= 0 || !Number.isSafeInteger(scope?.dojoId) ||
      (scope?.moduleIndex != null && !Number.isSafeInteger(scope.moduleIndex)) ||
      (candidate && (typeof payload.candidateSetId !== 'string' || !payload.candidateSetId.trim()))) {
    return invalidInput(candidate);
  }
  if (candidate && typeof payload.prompt === 'string' && payload.prompt.trim().length > ORDINARY_LESSON_REQUEST_LIMIT) {
    return {status: 422, body: {success: false,
      error: `请把本轮教案要求缩短到 ${ORDINARY_LESSON_REQUEST_LIMIT} 字以内后重试。`,
      errorCode: 'ORDINARY_LESSON_PLAN_REQUEST_TOO_LONG', failureCategory: 'permanent',
    }};
  }

  const modelId = process.env.HARNESS_DEEPSEEK_MODEL?.trim();
  if (!modelId || route.provider !== 'deepseek' || route.route !== (candidate ? candidateRoute : materializeRoute) ||
      route.actual_model !== modelId || route.required_model !== modelId || route.allow_degraded !== false ||
      (candidate && payload.ordinaryCandidateModel !== modelId)) return unavailable(candidate);

  let transport;
  try {
    transport = createHarnessTurn();
  } catch {
    return unavailable(candidate);
  }
  if (!transport) return unavailable(candidate);

  const completed = (result: Record<string, unknown>, usage: Record<string, number>, executionMode: string) => {
    signal.throwIfAborted();
    return {status: 200, body: {success: true, result, model: {
      provider: 'deepseek', actualModel: modelId, modelVersion: 'deepseek:' + modelId, usage,
      latencyMs: Date.now() - started, responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      degraded: false, executionMode,
    }}};
  };
  if (candidate) {
    let selected;
    try {
      selected = ordinaryLessonCandidateInput(payload);
    } catch {
      return invalidInput(true, '普通教案方案需要本轮教学要求及对应的完整教材摘要。');
    }
    const requestedCount = Number(payload.candidateCount);
    const count = Number.isFinite(requestedCount) ? Math.max(1, Math.min(4, Math.trunc(requestedCount))) : 1;
    const {model, hasInvalidReceipt} = createPinnedCandidateModel(transport, modelId, signal);
    try {
      const {result, usage} = await generateOrdinaryCandidates(selected, count, model, 'lesson-plan');
      if (hasInvalidReceipt()) return unavailable(true);
      return completed(result, usage, 'ordinary-candidate-plan');
    } catch {
      if (hasInvalidReceipt() || signal.aborted) return unavailable(true);
      return {status: 422, body: {success: false, error: '教案方案未通过普通教学内容校验，请重试。',
        errorCode: 'INVALID_ORDINARY_LESSON_PLAN_CANDIDATE_RESPONSE', failureCategory: 'quality'}};
    }
  }

  let input;
  try {
    input = ordinaryLessonPlanInput(payload);
  } catch {
    return invalidInput(false);
  }
  try {
    const {result, usage} = await materializeOrdinaryLessonPlan(input, {turn: transport, modelId, signal});
    return completed(result, usage, 'lesson-plan-harness');
  } catch (error) {
    if (error instanceof InvalidLessonPlanResponse) {
      return {status: 422, body: {success: false,
        error: '模型返回的教案与已选大纲不符，或有无效内容，请重试。',
        errorCode: 'INVALID_ORDINARY_LESSON_PLAN_RESPONSE', failureCategory: 'quality'}};
    }
    return unavailable(false);
  }
}
