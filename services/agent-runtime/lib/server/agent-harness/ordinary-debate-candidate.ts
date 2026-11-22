import {createHash} from 'node:crypto';
import {runCandidatePipeline} from '@/lib/generation/candidate-pipeline';
import {generationFingerprint} from '@/lib/generation/durable-stage';
import {parseJsonResponse} from '@/lib/generation/json-repair';
import {createHarnessTurn, recordHarnessUsage} from './classroom-turn';
import {DebateCandidateCheckpointError, replayOrdinaryDebateCandidates} from './ordinary-debate-candidate-checkpoint';
import {hasMeasuredLessonUsage, ordinaryLessonCandidateBlueprint, ordinaryLessonCandidateDraft,
  ordinaryLessonCandidateInput} from './ordinary-lesson-plan';
import {ordinaryBlueprint, ordinaryCandidate, ordinaryTeachingJson, ordinaryTeachingRules,
  type OrdinaryTeachingModel} from './ordinary-teaching';

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

const focus = ['论点与反驳', '证据取舍', '不同角色的立场', '讨论规则和组织方式'];
const safeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);

function readBlueprint(text: string) {
  const {blueprint} = ordinaryBlueprint.parse(parseJsonResponse(text));
  return ordinaryLessonCandidateBlueprint.parse({
    ...blueprint,
    title: blueprint.title.slice(0, 240),
    summary: blueprint.summary.slice(0, 5000),
    strategy: blueprint.strategy.slice(0, 160),
    variant: blueprint.variant.slice(0, 120),
    objectives: blueprint.objectives.slice(0, 12),
    outline: blueprint.outline.slice(0, 20).map(step => ({...step, title: step.title.slice(0, 180)})),
    assessment: blueprint.assessment.slice(0, 8),
  });
}

type Blueprint = ReturnType<typeof readBlueprint>;
type Selected = ReturnType<typeof ordinaryLessonCandidateInput>;

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

async function generateDebateCandidates(selected: Selected, count: number, model: OrdinaryTeachingModel) {
  const sourceIds = selected.sources.map(source => source.materialId);
  const context = {...selected, sources: selected.sources.map((source, index) => ({
    ...source, materialId: `material-${index + 1}`,
  }))};
  const materialIds = context.sources.map(source => source.materialId);
  const aliases = new Map(materialIds.map((alias, index) => [alias, sourceIds[index]]));
  const usage = {inputTokens: 0, outputTokens: 0, totalTokens: 0};

  async function call<T>(
    system: string, prompt: string, source: string, retries: number, parse: (text: string) => T,
  ) {
    const response = await ordinaryTeachingJson(model, system, prompt, source, retries, text => {
      try {
        parse(text);
        return true;
      } catch {
        return false;
      }
    });
    usage.inputTokens += response.totalUsage.inputTokens;
    usage.outputTokens += response.totalUsage.outputTokens;
    usage.totalTokens += response.totalUsage.totalTokens;
    return parse(response.text);
  }

  function parseCandidate(text: string): Record<string, unknown> {
    const {candidate} = ordinaryCandidate(parseJsonResponse(text), artifactType, materialIds);
    const {content} = candidate;
    return ordinaryLessonCandidateDraft({...candidate, content: {...content,
      sourceGrounding: content.sourceGrounding.map(row => ({
        ...row, materialId: aliases.get(row.materialId),
      })),
    }}, selected, artifactType);
  }

  const expansionSystem = `${ordinaryTeachingRules} 只提供候选辩论方案的议题、组织方式、举证环节和评价依据。生成 debate 候选，仅返回 {"candidate":{"title":"...","summary":"...","strategy":"...","differences":["..."],"recommendation":"...","content":{"type":"debate","objectives":["..."],"outline":[{"title":"...","description":"...","keyPoints":["..."]}],"activities":[{"title":"...","instruction":"..."}],"assessment":{"criteria":["..."]},"sourceGrounding":[{"materialId":"...","uses":["..."]}]}}}。
sourceGrounding 必须准确覆盖授权资料 ${JSON.stringify(materialIds)}。
方案标题最多160字，大纲最多30节，每节题目最多80字、说明最多800字、要点各最多200字。目标和评价准则各最多300字；活动题目最多100字、活动说明最多800字。`;
  const expansionPrompt = (blueprint: Blueprint, ordinal: number) =>
    JSON.stringify({...context, ordinal, blueprint});

  const {candidates, report} = await runCandidatePipeline<Blueprint, ReturnType<typeof parseCandidate>>({
    count,
    concurrency: 3,
    maxRepairs: 1,
    makeBlueprint: ordinal => call(
      `${ordinaryTeachingRules} 构思课堂辩论方案，围绕议题比较各方观点及举证方式。${count > 1 ? `本方案优先考虑${focus[ordinal - 1]}。` : ''}输出第 ${ordinal}/${count} 个教学蓝图，路径与同批其他候选不同。
只返回 {"blueprint":{"title":"...","summary":"...","strategy":"...","variant":"...","objectives":["..."],"outline":[{"title":"...","purpose":"..."}],"assessment":["..."],"safety":["..."]}}。`,
      JSON.stringify(context), 'aisecedu-integration-job', 2, readBlueprint,
    ),
    makeCandidate: (blueprint, ordinal) => call(expansionSystem, expansionPrompt(blueprint, ordinal),
      'aisecedu-candidate-expansion', 1, parseCandidate),
    repairCandidate: (_candidate, blueprint, _issues, ordinal) => call(
      `${expansionSystem}\n请依据本轮要求和已确认的教学蓝图重新生成。`,
      expansionPrompt(blueprint, ordinal), 'aisecedu-candidate-repair', 1, parseCandidate,
    ),
    fallbackBlueprint: () => { throw new Error('The ordinary teaching blueprint did not meet the teaching schema'); },
    fallbackCandidate: () => { throw new Error('The ordinary teaching candidate did not meet the approved schema'); },
    normalizeCandidate: candidate => candidate,
    validateCandidate: () => [],
    distinctKey: candidate => {
      const content = record(candidate.content);
      return [artifactType, candidate.title, candidate.strategy, generationFingerprint(content)]
        .join('|').toLocaleLowerCase();
    },
  });

  return {result: {candidates, generationReport: report}, usage};
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

  let invalidReceipt = false;
  const model: OrdinaryTeachingModel = {modelId, signal, async turn(messages, turnSignal) {
    if (invalidReceipt) throw new Error('A pinned candidate call has already returned an invalid receipt');
    const response = await transport(messages, turnSignal).catch(error => {
      invalidReceipt = true;
      throw error;
    });
    if (response.model !== modelId || !hasMeasuredLessonUsage(response) ||
        response.usage.prompt_tokens <= 0 || response.usage.completion_tokens <= 0 ||
        (response.usage.total_tokens != null &&
          response.usage.total_tokens !== response.usage.prompt_tokens + response.usage.completion_tokens)) {
      invalidReceipt = true;
      await recordHarnessUsage(response, 'aisecedu-integration-job');
      throw new Error('The pinned candidate turn did not return a model and measured usage');
    }
    return response;
  }};

  try {
    const {result, usage} = await replayOrdinaryDebateCandidates({
      jobId, scope: {ownerId, dojoId, moduleIndex: moduleIndex ?? null},
      candidateSetId, candidateCount: count, generationMode, prompt: payload.prompt, selected,
      sourceRefs: ((payload.sourceRefs ?? []) as Record<string, unknown>[]).map(
        ({id, revisionId, sha256}) => ({id, revisionId, sha256}),
      ),
      model: modelId,
    }, signal, async () => {
      const generated = await generateDebateCandidates(selected, count, model);
      if (invalidReceipt) throw new Error('The pinned ordinary teaching proposals could not be verified');
      return generated;
    }, result => batchIssue(result, count));
    return {status: 200, body: {success: true, result, model: {
      provider: 'deepseek', actualModel: modelId, modelVersion: 'deepseek:' + modelId, usage,
      latencyMs: Date.now() - started, responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      degraded: false, executionMode: 'ordinary-candidate-plan',
    }}};
  } catch (error) {
    if (invalidReceipt || error instanceof DebateCandidateCheckpointError) return unavailable;
    return {status: 422, body: {
      success: false, error: '辩论方案未通过普通教学内容校验，请重试。',
      errorCode: 'INVALID_ORDINARY_DEBATE_CANDIDATE_RESPONSE', failureCategory: 'quality',
    }};
  }
}
