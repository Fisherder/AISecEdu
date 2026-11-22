import { createHash } from 'node:crypto';
import { z } from 'zod';
import { openDebateCheckpoint, withDebateResponseLock, withDebateUsage } from '@/lib/debate/checkpoint';
import { debateSpecSchema } from '@/lib/debate/schema';
import { GenerationStageError } from '@/lib/generation/validated-stage';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import { debateLesson, generateDebate, isOrdinaryDebateProse, reviseDebate } from '@/lib/server/debate-generation';
import { createHarnessTurn, recordHarnessUsage } from './classroom-turn';
import { hasMeasuredLessonUsage } from './ordinary-lesson-plan';

export const ORDINARY_DEBATE_BACKEND = 'ordinary-debate-harness-v1';
export const ORDINARY_DEBATE_SCOPE = 'debate-authoring';
const modelRoute = 'ordinary-debate-harness';
const prose = z.string().trim().min(1).max(18_000).refine(isOrdinaryDebateProse);
const lines = z.array(prose).max(60);
const planSchema = z.object({
  title: prose.optional(), summary: prose.optional(), type: z.literal('debate').optional(),
  objectives: lines.optional(),
  outline: z.array(z.object({
    title: prose, description: prose.optional(), keyPoints: lines.optional(),
  })).max(60).optional(),
  activities: z.array(z.object({title: prose, instruction: prose})).max(40).optional(),
  assessment: z.object({criteria: lines}).optional(),
  sourceGrounding: z.array(z.object({materialId: z.string(), uses: lines})).max(80).optional(),
});

const materialId = z.string().regex(/^material-[1-9][0-9]*$/);
const materialContextSchema = z.object({
  expectedMaterialCount: z.number().int().min(0).max(80),
  complete: z.literal(true),
  materialIds: z.array(materialId),
});
const dossierSchema = z.object({
  coverage: z.object({complete: z.literal(true)}),
  materials: z.array(z.object({
    id: materialId, title: prose.optional(), coverage: z.object({complete: z.literal(true)}),
    analysis: z.object({summary: prose}),
  })).max(80),
});

function readGrounding(payload: Record<string, unknown>, plan: z.infer<typeof planSchema>) {
  if (payload.materialContext === undefined && payload.materialDossier === undefined && !plan.sourceGrounding?.length) return;
  const context = materialContextSchema.parse(payload.materialContext);
  const ids = new Set(context.materialIds);
  if (ids.size !== context.expectedMaterialCount || ids.size !== context.materialIds.length ||
      plan.sourceGrounding?.some(source => !ids.has(source.materialId))) {
    throw new Error('Debate source references must match the verified material summary');
  }
  if (!ids.size && payload.materialDossier === undefined) return;
  const {materials} = dossierSchema.parse(payload.materialDossier);
  if (materials.length !== ids.size || !materials.every(material => ids.delete(material.id))) {
    throw new Error('Debate requires complete and distinct teaching material summaries');
  }
  return materials.map(({id, title, analysis}) => ({id, title, summary: analysis.summary}));
}

const requestSchema = z.object({
  jobId: z.string().trim().min(1),
  kind: z.enum(['artifact.materialize', 'artifact.revise']),
  scope: z.object({
    ordinaryTeaching: z.literal(ORDINARY_DEBATE_SCOPE),
    ownerId: z.number().int().positive(),
    dojoId: z.number().int(),
    moduleIndex: z.number().int().nullish(),
  }),
  payload: z.object({
    debateAuthoringBackend: z.literal(ORDINARY_DEBATE_BACKEND),
    artifactType: z.literal('debate'),
    artifactId: z.string().trim().min(1),
    expectedRevision: z.number().int().positive(),
    workspaceId: z.null().optional(),
  }),
});

const revisionSchema = z.object({
  instruction: prose,
  currentContent: z.object({
    lesson: z.object({artifacts: z.array(z.object({
      content: z.object({debate: debateSpecSchema}),
    })).length(1)}),
    debateRevisionHistory: z.array(z.object({
      changes: z.array(z.object({path: z.string().startsWith('/').max(400)})).max(100),
    })).max(16).optional(),
  }),
});

export async function executeOrdinaryDebateJob(
  body: Record<string, unknown>,
  signal: AbortSignal,
  started: number,
) {
  const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
    ? body.payload as Record<string, unknown> : {};
  const invalid = () => ({status: 422, body: {
    success: false, error: '辩论任务缺少已核验的普通课程、活动版本或完整资料摘要。',
    errorCode: 'INVALID_ORDINARY_DEBATE_JOB', failureCategory: 'permanent',
  }});
  const unavailable = () => ({status: 503, body: {
    success: false, error: '普通课堂辩论服务暂不可用，请稍后重试。',
    errorCode: 'ORDINARY_DEBATE_UNAVAILABLE', failureCategory: 'service',
  }});
  const request = requestSchema.safeParse({...body, payload});
  if (!request.success || payload.generationReason === 'teacher_requested_ordinary_debate' ||
      Object.hasOwn(payload, 'ordinaryCandidateModel') || Object.hasOwn(payload, 'ordinaryLessonPlanRevisionModel')) {
    return invalid();
  }
  const {kind, jobId, scope, payload: {artifactId, expectedRevision}} = request.data;
  let input;
  try {
    if (kind === 'artifact.materialize') {
      const plan = planSchema.parse(payload.plan);
      const materialGrounding = readGrounding(payload, plan);
      input = {kind, design: {request: prose.parse(payload.requestPrompt), plan, materialGrounding}} as const;
    } else {
      const {instruction, currentContent} = revisionSchema.parse(payload);
      const spec = currentContent.lesson.artifacts[0].content.debate;
      if (!isOrdinaryDebateProse(spec) || !isOrdinaryDebateProse(currentContent.debateRevisionHistory)) return invalid();
      input = {kind, instruction, spec, history: currentContent.debateRevisionHistory ?? []} as const;
    }
  } catch {
    return invalid();
  }
  const modelId = process.env.HARNESS_DEEPSEEK_MODEL?.trim();
  const route = body.modelRoute && typeof body.modelRoute === 'object'
    ? body.modelRoute as Record<string, unknown> : undefined;
  if (!modelId || route?.route !== modelRoute || route.provider !== 'deepseek' ||
      route.actual_model !== modelId || route.required_model !== modelId || route.allow_degraded !== false) return unavailable();

  try {
    const turn = createHarnessTurn();
    if (!turn) return unavailable();
    const modelVersion = 'deepseek:' + modelId;
    const identity = {backend: ORDINARY_DEBATE_BACKEND, jobId, scope, artifactId, expectedRevision, input, modelVersion};
    return await withDebateResponseLock(identity, async () => {
      signal.throwIfAborted();
      const checkpoint = await openDebateCheckpoint(identity);
      const usage = withDebateUsage(checkpoint);
      const aiCall: AICallFn = async (system, prompt, images) => {
        if (images?.length) throw new Error('Ordinary debate requires a text-only model turn');
        const response = await turn([{role: 'system', content: system}, {role: 'user', content: prompt}], signal);
        await recordHarnessUsage(response, input.kind === 'artifact.materialize' ? 'debate-design' : 'debate-revise');
        if (response.model !== modelId || !hasMeasuredLessonUsage(response)) {
          throw new Error('The official debate turn did not return the pinned model and measured usage');
        }
        const {prompt_tokens, completion_tokens, total_tokens} = response.usage;
        if (total_tokens !== undefined && total_tokens !== prompt_tokens + completion_tokens) {
          throw new Error('The official debate turn returned inconsistent measured usage');
        }
        usage.add(prompt_tokens, completion_tokens);
        return response.text;
      };
      let result;
      if (input.kind === 'artifact.materialize') {
        const spec = await generateDebate(input.design, aiCall, usage.state, signal);
        const stage = 'workflow-debate-lesson-created-at';
        const savedCreatedAt = checkpoint.read(stage);
        const createdAt = savedCreatedAt ?? Date.now();
        if (typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt)) return unavailable();
        if (savedCreatedAt === undefined) await checkpoint.write(stage, createdAt);
        result = {
          content: {schema: 'aisecedu.global-agent.artifact.v1', artifactType: 'debate',
            renderer: 'agent-runtime-stage', plan: input.design.plan, lesson: debateLesson(spec, artifactId, createdAt)},
          validation: {status: 'GENERATED', renderer: 'agent-runtime-stage', artifactCount: 1,
            fallbackCount: 0, quality: {schema: spec.schema, interactive: true, rounds: spec.rounds.length}},
        };
      } else {
        const revised = await reviseDebate(input.spec, input.instruction, aiCall,
          {history: input.history, state: usage.state, ordinarySignal: signal});
        const {spec, summary, changes, changedFields, changedPaths} = revised;
        result = {spec, summary, changes, changedFields, changedPaths};
      }
      const {inputTokens, outputTokens} = usage.usage ?? {};
      if (inputTokens === undefined || outputTokens === undefined) return unavailable();
      const totalTokens = inputTokens + outputTokens;
      if (!Number.isSafeInteger(totalTokens) || totalTokens <= 0) return unavailable();
      signal.throwIfAborted();
      return {status: 200, body: {success: true, result, model: {
        provider: 'deepseek', actualModel: modelId, modelVersion,
        usage: {inputTokens, outputTokens, totalTokens},
        degraded: false, executionMode: modelRoute, latencyMs: Date.now() - started,
        responseHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
      }}};
    });
  } catch (error) {
    if (!(error instanceof GenerationStageError)) return unavailable();
    return {status: 422, body: {success: false, error: '辩论结果未通过课堂内容或结构校验。',
      errorCode: 'ORDINARY_DEBATE_REJECTED', failureCategory: 'quality'}};
  }
}
