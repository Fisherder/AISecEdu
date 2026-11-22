import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {createHarnessTurn} from '@/lib/server/agent-harness/classroom-turn';
import {runOrdinaryJob} from '@/lib/server/agent-harness/ordinary-job-http';
import {createPinnedTeachingModel} from '@/lib/server/agent-harness/ordinary-teaching';
import {asJobRecord, ordinaryTeachingRoute} from '@/lib/server/agent-harness/ordinary-teaching-job-contract';
import {PinnedTeachingGenerationError, runPinnedTeachingGeneration} from '@/lib/server/agent-harness/ordinary-teaching-generation';

export const maxDuration = 2100;

function unavailable() {
  return {status: 503, body: {success: false, error: '任务指定的教学模型暂不可用，请稍后重试。',
    errorCode: 'ORDINARY_TEACHING_HARNESS_UNAVAILABLE', failureCategory: 'service'}};
}

async function execute(body: Record<string, unknown>, signal: AbortSignal, started: number, traceId: string) {
  const scope = asJobRecord(body.scope);
  const route = asJobRecord(body.modelRoute);
  const payload = asJobRecord(body.payload);
  const mode = scope?.ordinaryTeaching;
  const candidate = mode === 'candidate-plan' && body.kind === 'candidate.generate' &&
    (payload?.artifactType === 'slide-deck' || payload?.artifactType === 'lesson-plan') &&
    typeof payload.candidateSetId === 'string' && Boolean(payload.candidateSetId.trim());
  const material = mode === 'material-summary' && body.kind === 'material.enrich' &&
    typeof payload?.materialId === 'string' && Boolean(payload.materialId.trim()) &&
    typeof payload.revisionId === 'string' && Boolean(payload.revisionId.trim());
  if (!payload || !(candidate || material) || typeof body.jobId !== 'string' || !body.jobId.trim() ||
      scope?.ordinaryTeachingPinned !== true || route?.route !== ordinaryTeachingRoute ||
      !Number.isSafeInteger(scope.dojoId) || typeof scope.ownerId !== 'number' || !Number.isSafeInteger(scope.ownerId) ||
      scope.ownerId <= 0 || payload.workspaceId != null || Object.hasOwn(payload, 'ordinaryTeachingPin') ||
      Object.hasOwn(payload, 'ordinaryCandidateModel') || Object.hasOwn(payload, 'ordinaryLessonPlan') ||
      Object.hasOwn(payload, 'revisionBackend') || Object.hasOwn(payload, 'ordinaryDebate') ||
      payload.generationReason === 'teacher_requested_ordinary_lesson_plan' ||
      payload.generationReason === 'teacher_requested_ordinary_debate') {
    return {status: 422, body: {success: false, error: '普通教学任务与已登记的课程或类型不一致。',
      errorCode: 'INVALID_ORDINARY_TEACHING_PIN', failureCategory: 'permanent'}};
  }

  const modelId = process.env.HARNESS_DEEPSEEK_MODEL?.trim();
  if (!modelId || route.provider !== 'deepseek' || route.required_model !== modelId ||
      route.actual_model !== modelId || route.allow_degraded !== false) return unavailable();
  let transport;
  try {
    transport = createHarnessTurn();
  } catch {
    return unavailable();
  }
  if (!transport) return unavailable();

  const pin = createPinnedTeachingModel(transport, modelId, signal);
  try {
    const {result, usage} = await runPinnedTeachingGeneration(body.jobId, mode, payload, pin.model, traceId);
    signal.throwIfAborted();
    if (pin.hasInvalidReceipt() || !Number.isSafeInteger(usage.totalTokens) || usage.inputTokens <= 0 ||
        usage.outputTokens <= 0 || usage.totalTokens !== usage.inputTokens + usage.outputTokens) return unavailable();
    return {status: 200, body: {success: true, result, model: {
      provider: 'deepseek', actualModel: modelId, modelVersion: 'deepseek:' + modelId, usage,
      latencyMs: Date.now() - started, responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      degraded: false, executionMode: 'ordinary-' + mode,
    }}};
  } catch (error) {
    if (pin.hasInvalidReceipt() || signal.aborted) return unavailable();
    if (!(error instanceof PinnedTeachingGenerationError)) throw error;
    const source = error.category === 'source';
    const failureCategory = source ? 'service' : error.category === 'quality' ? 'quality' : 'permanent';
    return {status: source ? 503 : 422, body: {success: false, error: error.message, errorCode: error.code, failureCategory}};
  }
}

export function POST(req: NextRequest) {
  return runOrdinaryJob(req, execute);
}
