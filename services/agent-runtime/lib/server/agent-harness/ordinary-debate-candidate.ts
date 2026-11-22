import {createHash} from 'node:crypto';
import {createHarnessTurn} from './classroom-turn';
import {createPinnedCandidateModel, generateOrdinaryCandidates} from './ordinary-candidate-generation';
import {DebateCandidateCheckpointError, replayOrdinaryDebateCandidates} from './ordinary-debate-candidate-checkpoint';
import {ordinaryLessonCandidateInput} from './ordinary-lesson-plan';

const reason = 'teacher_requested_ordinary_debate';
const route = 'upstream-ordinary-debate-candidate';
const artifactType = 'debate';
const scopeName = 'candidate-plan';

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function isOrdinaryDebateCandidateJob(body: {
  scope?: unknown; modelRoute?: unknown; payload?: unknown;
}) {
  const payload = record(body.payload);
  return payload?.generationReason === reason || record(body.modelRoute)?.route === route ||
    (record(body.scope)?.ordinaryTeaching === scopeName && payload?.artifactType === artifactType);
}

export const invalidOrdinaryDebateCandidateJob = {
  status: 422,
  body: {success: false, error: '普通辩论方案需要教师课程及有效的生成任务。',
    errorCode: 'INVALID_ORDINARY_DEBATE_CANDIDATE_JOB', failureCategory: 'permanent'},
};

const unavailable = {
  status: 503,
  body: {success: false, error: '普通辩论方案服务暂不可用，请重新发起生成。',
    errorCode: 'ORDINARY_DEBATE_CANDIDATE_UNAVAILABLE', failureCategory: 'service'},
};

const safeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

function batchIssue(result: Record<string, unknown>, count: number) {
  // Individual candidates are checked against the exact typed plan and citations
  // by the pipeline and on replay. The batch must also vary each of these fields.
  const candidates = result.candidates;
  if (!Array.isArray(candidates) || candidates.length !== count) return 'Candidate count differs';
  const titles = new Set<string>();
  const strategies = new Set<string>();
  const plans = new Set<string>();
  for (const raw of candidates) {
    const candidate = record(raw);
    if (typeof candidate?.title !== 'string' || typeof candidate.strategy !== 'string' ||
        !candidate.strategy.trim() || !record(candidate.content)) return 'Candidate is incomplete';
    titles.add(candidate.title.trim().toLocaleLowerCase());
    strategies.add(candidate.strategy.trim().toLocaleLowerCase());
    plans.add(JSON.stringify(candidate.content));
  }
  return titles.size === count && strategies.size === count && plans.size === count
    ? null : 'Candidate titles, strategies, and content must be distinct';
}

export async function executeOrdinaryDebateCandidateJob(body: Record<string, unknown>, signal: AbortSignal, started: number) {
  const payload = record(body.payload) ?? {};
  const scope = record(body.scope);
  const modelRoute = record(body.modelRoute);
  const {jobId} = body;
  const {candidateCount: count, candidateSetId, generationMode} = payload;
  const ownerId = scope?.ownerId;
  const dojoId = scope?.dojoId;
  const moduleIndex = scope?.moduleIndex;
  const modeMatches = generationMode === 'single' ? count === 1
    : generationMode === 'multiple' && safeInteger(count) && count >= 2 && count <= 4;

  if (typeof jobId !== 'string' || !jobId.trim() || body.kind !== 'candidate.generate' ||
      scope?.ordinaryTeaching !== scopeName || payload.artifactType !== artifactType ||
      payload.generationReason !== reason || !modeMatches || !safeInteger(count) ||
      typeof candidateSetId !== 'string' || !candidateSetId.trim() || payload.workspaceId != null ||
      !safeInteger(ownerId) || ownerId <= 0 || !safeInteger(dojoId) ||
      (moduleIndex != null && !safeInteger(moduleIndex)) || Object.hasOwn(payload, 'debateAuthoringBackend') || Object.hasOwn(payload, 'ordinaryLessonPlanRevisionModel')) {
    return invalidOrdinaryDebateCandidateJob;
  }

  const modelId = process.env.HARNESS_DEEPSEEK_MODEL?.trim();
  if (!modelId || payload.ordinaryCandidateModel !== modelId ||
      modelRoute?.provider !== 'deepseek' || modelRoute.route !== route ||
      modelRoute.actual_model !== modelId || modelRoute.required_model !== modelId ||
      modelRoute.allow_degraded !== false) return unavailable;

  let transport;
  try {
    transport = createHarnessTurn();
  } catch {
    return unavailable;
  }
  if (!transport) return unavailable;

  let selected;
  try {
    selected = ordinaryLessonCandidateInput(payload, artifactType);
  } catch {
    return invalidOrdinaryDebateCandidateJob;
  }

  const {model, hasInvalidReceipt} = createPinnedCandidateModel(transport, modelId, signal);

  try {
    const {result, usage} = await replayOrdinaryDebateCandidates({
      jobId, scope: {ownerId, dojoId, moduleIndex: moduleIndex ?? null},
      candidateSetId, candidateCount: count, generationMode, prompt: payload.prompt, selected,
      sourceRefs: ((payload.sourceRefs ?? []) as Record<string, unknown>[]).map(
        ({id, revisionId, sha256}) => ({id, revisionId, sha256}),
      ),
      model: modelId,
    }, signal, async () => {
      const generated = await generateOrdinaryCandidates(selected, count, model, artifactType);
      if (hasInvalidReceipt()) throw new Error('The pinned ordinary teaching proposals could not be verified');
      return generated;
    }, result => batchIssue(result, count));
    return {status: 200, body: {success: true, result, model: {
      provider: 'deepseek', actualModel: modelId, modelVersion: 'deepseek:' + modelId, usage,
      latencyMs: Date.now() - started, responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      degraded: false, executionMode: 'ordinary-candidate-plan',
    }}};
  } catch (error) {
    if (hasInvalidReceipt() || error instanceof DebateCandidateCheckpointError) return unavailable;
    return {status: 422, body: {
      success: false, error: '辩论方案未通过普通教学内容校验，请重试。',
      errorCode: 'INVALID_ORDINARY_DEBATE_CANDIDATE_RESPONSE', failureCategory: 'quality',
    }};
  }
}
