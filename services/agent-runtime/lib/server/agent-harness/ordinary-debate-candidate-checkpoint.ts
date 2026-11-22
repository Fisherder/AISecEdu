import { z } from 'zod';
import { openDebateCheckpoint, withDebateResponseLock } from '@/lib/debate/checkpoint';
import { generationFingerprint } from '@/lib/generation/durable-stage';
import { ordinaryCandidate } from './ordinary-teaching';
import { ordinaryLessonCandidateDraft, type ordinaryLessonCandidateInput } from './ordinary-lesson-plan';

const checkpointStage = 'workflow-debate-candidate-response';
const count = z.number().int().nonnegative();
const issueCodes = z.array(z.string().regex(/^[A-Z0-9_]{1,80}$/)).max(12);
const status = z.enum(['MODEL', 'REPAIRED']);
const stage = z.strictObject({status, attempts: count, issueCodes});
const report = z.strictObject({
  version: z.literal('candidate-generation-v2'),
  candidateCount: count, blueprintFallbackCount: z.literal(0), fallbackCount: z.literal(0), repairedCount: count,
  items: z.array(z.strictObject({
    ordinal: count, blueprint: stage, content: stage, repairs: count, finalStatus: status, issueCodes,
  })).max(4),
});
const completed = z.strictObject({
  result: z.strictObject({
    candidates: z.array(z.record(z.string(), z.unknown())).min(1).max(4),
    generationReport: report,
  }),
  usage: z.strictObject({inputTokens: count.positive(), outputTokens: count.positive(), totalTokens: count.positive()}),
});

type DebateInput = ReturnType<typeof ordinaryLessonCandidateInput>;

export class DebateCandidateCheckpointError extends Error {}

export async function replayOrdinaryDebateCandidates(
  identity: {
    jobId: string;
    scope: {ownerId: number; dojoId: number; moduleIndex: number | null};
    candidateSetId: string;
    candidateCount: number;
    generationMode: unknown;
    prompt: unknown;
    selected: DebateInput;
    sourceRefs: {id: unknown; revisionId: unknown; sha256: unknown}[];
    model: string;
  },
  signal: AbortSignal,
  generate: () => Promise<unknown>,
  batchIssue: (result: Record<string, unknown>) => string | null,
) {
  const key = {contract: 'ordinary-debate-candidate-response-v1', ...identity};
  const validate = (value: unknown) => {
    const {result, usage} = completed.parse(value);
    const {candidateCount, selected} = identity;
    const {generationReport} = result;
    const materialIds = selected.sources.map(({materialId}) => materialId);
    if (result.candidates.length !== candidateCount || generationReport.candidateCount !== candidateCount ||
        generationReport.items.length !== candidateCount ||
        generationReport.items.some(({ordinal}, index) => ordinal !== index + 1) ||
        generationReport.repairedCount !== generationReport.items.filter(item => item.finalStatus === 'REPAIRED').length ||
        usage.inputTokens + usage.outputTokens !== usage.totalTokens || batchIssue(result)) {
      throw new Error('Ordinary debate candidate completion does not match the request');
    }
    for (const candidate of result.candidates) {
      const bounded = ordinaryLessonCandidateDraft(candidate, selected, 'debate');
      const {experience, ...content} = bounded.content;
      const validated = ordinaryCandidate({candidate: {...bounded, content}}, 'debate', materialIds);
      if (generationFingerprint(validated.candidate) !== generationFingerprint(candidate)) {
        throw new Error('Ordinary debate candidate is not the authorized normalized plan');
      }
    }
    return {result, usage};
  };

  return withDebateResponseLock(key, async () => {
    signal.throwIfAborted();
    let checkpoint;
    try {
      checkpoint = await openDebateCheckpoint(key);
      const stored = checkpoint.read(checkpointStage);
      if (stored !== undefined) {
        const {completion, digest} = z.strictObject({completion: completed, digest: z.string()}).parse(stored);
        if (digest !== generationFingerprint(completion)) throw new Error('Ordinary debate candidate checkpoint differs');
        return validate(completion);
      }
    } catch (error) {
      throw new DebateCandidateCheckpointError('Ordinary debate candidate checkpoint cannot be read', {cause: error});
    }
    const completion = validate(await generate());
    try {
      await checkpoint.write(checkpointStage, {completion, digest: generationFingerprint(completion)});
    } catch (error) {
      throw new DebateCandidateCheckpointError('Ordinary debate candidate checkpoint cannot be saved', {cause: error});
    }
    signal.throwIfAborted();
    return completion;
  });
}
