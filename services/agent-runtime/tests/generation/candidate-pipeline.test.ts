import { describe, expect, it } from 'vitest';
import {
  CandidatePipelineError,
  runCandidatePipeline,
  type CandidatePipelineIssue,
} from '@/lib/generation/candidate-pipeline';

type Blueprint = { ordinal: number; variant: string };
type Candidate = { title: string; strategy: string; valid: boolean };

const issue = (code: string): CandidatePipelineIssue[] => [
  { code, message: `${code} needs repair` },
];

const baseOptions = () => ({
  count: 2,
  concurrency: 2,
  makeBlueprint: async (ordinal: number): Promise<Blueprint> => ({
    ordinal,
    variant: `variant-${ordinal}`,
  }),
  fallbackBlueprint: (ordinal: number): Blueprint => ({
    ordinal,
    variant: `fallback-${ordinal}`,
  }),
  fallbackCandidate: (blueprint: Blueprint): Candidate => ({
    title: `fallback-${blueprint.ordinal}`,
    strategy: blueprint.variant,
    valid: true,
  }),
  normalizeCandidate: (candidate: Candidate) => candidate,
  validateCandidate: (candidate: Candidate) => (candidate.valid ? [] : issue('SCHEMA')),
  distinctKey: (candidate: Candidate) => `${candidate.title}|${candidate.strategy}`,
});

describe('candidate generation pipeline', () => {
  it('repairs an invalid candidate without failing the whole generation', async () => {
    const options = baseOptions();
    let contentCalls = 0;
    let repairCalls = 0;
    const result = await runCandidatePipeline({
      ...options,
      count: 1,
      makeCandidate: async (blueprint) => {
        contentCalls += 1;
        return { title: 'draft', strategy: blueprint.variant, valid: false };
      },
      repairCandidate: async (_candidate, blueprint) => {
        repairCalls += 1;
        return { title: 'repaired', strategy: blueprint.variant, valid: true };
      },
    });

    expect(contentCalls).toBe(1);
    expect(repairCalls).toBe(1);
    expect(result.candidates[0]).toMatchObject({ title: 'repaired', valid: true });
    expect(result.report.repairedCount).toBe(1);
    expect(result.report.fallbackCount).toBe(0);
    expect(result.report.items[0]?.issueCodes).toContain('SCHEMA');
  });

  it('keeps a usable fallback when one model stage fails', async () => {
    const options = baseOptions();
    const result = await runCandidatePipeline({
      ...options,
      makeBlueprint: async (ordinal) => {
        if (ordinal === 1) throw new Error('provider timeout');
        return { ordinal, variant: `variant-${ordinal}` };
      },
      makeCandidate: async (blueprint) => ({
        title: `model-${blueprint.ordinal}`,
        strategy: blueprint.variant,
        valid: true,
      }),
    });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.title).toBe('model-1');
    expect(result.report.fallbackCount).toBe(0);
    expect(result.report.blueprintFallbackCount).toBe(1);
    expect(result.report.items[0]?.blueprint.status).toBe('FALLBACK');
  });

  it('repairs duplicate candidates before resorting to deterministic variants', async () => {
    const options = baseOptions();
    let repairCalls = 0;
    const result = await runCandidatePipeline({
      ...options,
      makeCandidate: async () => ({ title: 'same', strategy: 'same', valid: true }),
      repairCandidate: async (_candidate, blueprint, issues) => {
        repairCalls += 1;
        expect(issues[0]?.code).toBe('DUPLICATE_CANDIDATE');
        return {
          title: `repaired-${blueprint.ordinal}`,
          strategy: blueprint.variant,
          valid: true,
        };
      },
    });

    expect(repairCalls).toBe(1);
    expect(new Set(result.candidates.map((candidate) => candidate.title)).size).toBe(2);
    expect(result.report.repairedCount).toBe(1);
  });

  it('raises an auditable error when the deterministic fallback is invalid', async () => {
    const options = baseOptions();
    await expect(
      runCandidatePipeline({
        ...options,
        count: 1,
        makeCandidate: async () => ({ title: 'invalid', strategy: 'invalid', valid: false }),
        fallbackCandidate: () => ({ title: 'still-invalid', strategy: 'fallback', valid: false }),
      }),
    ).rejects.toBeInstanceOf(CandidatePipelineError);
  });
});
