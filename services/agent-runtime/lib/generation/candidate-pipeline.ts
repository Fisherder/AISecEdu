export type CandidatePipelineIssue = {
  code: string;
  message: string;
  path?: string;
};

export type CandidatePipelineStage = {
  status: 'MODEL' | 'REPAIRED' | 'FALLBACK';
  attempts: number;
  issueCodes: string[];
};

export type CandidatePipelineItemReport = {
  ordinal: number;
  blueprint: CandidatePipelineStage;
  content: CandidatePipelineStage;
  repairs: number;
  finalStatus: 'MODEL' | 'REPAIRED' | 'FALLBACK';
  issueCodes: string[];
};

export type CandidatePipelineReport = {
  version: 'candidate-generation-v2';
  candidateCount: number;
  blueprintFallbackCount: number;
  fallbackCount: number;
  repairedCount: number;
  items: CandidatePipelineItemReport[];
};

export type CandidatePipelineOptions<Blueprint, Candidate> = {
  count: number;
  maxRepairs?: number;
  concurrency?: number;
  makeBlueprint: (ordinal: number) => Promise<Blueprint>;
  fallbackBlueprint: (ordinal: number) => Blueprint;
  makeCandidate: (blueprint: Blueprint, ordinal: number) => Promise<Candidate>;
  repairCandidate?: (
    candidate: Candidate,
    blueprint: Blueprint,
    issues: CandidatePipelineIssue[],
    ordinal: number,
    repairAttempt: number,
  ) => Promise<Candidate>;
  fallbackCandidate: (
    blueprint: Blueprint,
    issues: CandidatePipelineIssue[],
    ordinal: number,
  ) => Candidate;
  normalizeCandidate: (candidate: Candidate) => Candidate;
  validateCandidate: (candidate: Candidate) => CandidatePipelineIssue[];
  distinctKey: (candidate: Candidate) => string;
};

export class CandidatePipelineError extends Error {
  readonly report: CandidatePipelineReport;

  constructor(message: string, report: CandidatePipelineReport) {
    super(message);
    this.name = 'CandidatePipelineError';
    this.report = report;
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), Math.max(1, values.length)) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await mapper(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function issueCodes(issues: CandidatePipelineIssue[]): string[] {
  return [...new Set(issues.map((issue) => issue.code).filter(Boolean))].slice(0, 12);
}

function safeIssues(_error: unknown): CandidatePipelineIssue[] {
  // Do not copy provider/network errors into the persisted result.  They can
  // contain URLs, request fragments, or other implementation details that are
  // useful in server logs but are not safe as a teacher-facing diagnostic.
  return [{ code: 'MODEL_STAGE_FAILED', message: '模型阶段未完成，已进入修复或确定性兜底。' }];
}

function normalizeIssues(
  issues: CandidatePipelineIssue[] | null | undefined,
): CandidatePipelineIssue[] {
  return (Array.isArray(issues) ? issues : [])
    .filter((issue): issue is CandidatePipelineIssue => Boolean(issue && typeof issue === 'object'))
    .map((issue) => ({
      code: String(issue.code || 'INVALID_CANDIDATE').slice(0, 80),
      message: String(issue.message || '候选内容未通过校验').slice(0, 500),
      ...(issue.path ? { path: String(issue.path).slice(0, 160) } : {}),
    }))
    .slice(0, 24);
}

export async function runCandidatePipeline<Blueprint, Candidate>(
  options: CandidatePipelineOptions<Blueprint, Candidate>,
): Promise<{ candidates: Candidate[]; report: CandidatePipelineReport }> {
  const count = Math.max(1, Math.min(4, Math.trunc(options.count || 1)));
  const maxRepairs = Math.max(0, Math.min(3, Math.trunc(options.maxRepairs ?? 2)));
  const report: CandidatePipelineReport = {
    version: 'candidate-generation-v2',
    candidateCount: count,
    blueprintFallbackCount: 0,
    fallbackCount: 0,
    repairedCount: 0,
    items: [],
  };

  const items = await mapWithConcurrency(
    Array.from({ length: count }, (_, index) => index + 1),
    options.concurrency ?? 2,
    async (ordinal) => {
      let blueprint: Blueprint;
      let blueprintStage: CandidatePipelineStage;
      try {
        blueprint = await options.makeBlueprint(ordinal);
        blueprintStage = { status: 'MODEL', attempts: 1, issueCodes: [] };
      } catch (error) {
        blueprintStage = {
          status: 'FALLBACK',
          attempts: 1,
          issueCodes: issueCodes(safeIssues(error)),
        };
        try {
          blueprint = options.fallbackBlueprint(ordinal);
        } catch (fallbackError) {
          throw new CandidatePipelineError('Deterministic blueprint fallback failed', {
            ...report,
            items: [
              ...report.items,
              {
                ordinal,
                blueprint: blueprintStage,
                content: {
                  status: 'FALLBACK',
                  attempts: 0,
                  issueCodes: issueCodes(safeIssues(fallbackError)),
                },
                repairs: 0,
                finalStatus: 'FALLBACK',
                issueCodes: issueCodes(safeIssues(fallbackError)),
              },
            ],
          });
        }
      }

      let candidate: Candidate | null = null;
      let issues: CandidatePipelineIssue[] = [];
      let observedIssues: CandidatePipelineIssue[] = [];
      let contentStage: CandidatePipelineStage = {
        status: 'MODEL',
        attempts: 0,
        issueCodes: [],
      };
      try {
        candidate = options.normalizeCandidate(await options.makeCandidate(blueprint, ordinal));
        contentStage.attempts = 1;
        issues = normalizeIssues(options.validateCandidate(candidate));
        observedIssues = [...issues];
        contentStage.issueCodes = issueCodes(issues);
      } catch (error) {
        contentStage.attempts = 1;
        issues = safeIssues(error);
        observedIssues = [...issues];
        contentStage.issueCodes = issueCodes(issues);
      }

      let repairs = 0;
      while (candidate && issues.length && repairs < maxRepairs && options.repairCandidate) {
        repairs += 1;
        try {
          candidate = options.normalizeCandidate(
            await options.repairCandidate(candidate, blueprint, issues, ordinal, repairs),
          );
          issues = normalizeIssues(options.validateCandidate(candidate));
          observedIssues = [...observedIssues, ...issues];
          contentStage.attempts += 1;
          contentStage.status = 'REPAIRED';
          contentStage.issueCodes = issueCodes(issues);
        } catch (error) {
          issues = safeIssues(error);
          observedIssues = [...observedIssues, ...issues];
          contentStage.attempts += 1;
          contentStage.issueCodes = issueCodes(issues);
        }
      }

      let finalStatus: CandidatePipelineItemReport['finalStatus'] =
        contentStage.attempts > 1 ? 'REPAIRED' : 'MODEL';
      if (issues.length || !candidate) {
        let fallbackIssues: CandidatePipelineIssue[];
        try {
          candidate = options.normalizeCandidate(
            options.fallbackCandidate(blueprint, issues, ordinal),
          );
          fallbackIssues = normalizeIssues(options.validateCandidate(candidate));
        } catch (fallbackError) {
          const safeFallbackIssues = safeIssues(fallbackError);
          throw new CandidatePipelineError('Deterministic candidate fallback failed', {
            ...report,
            items: [
              ...report.items,
              {
                ordinal,
                blueprint: blueprintStage,
                content: {
                  status: 'FALLBACK',
                  attempts: contentStage.attempts,
                  issueCodes: issueCodes(safeFallbackIssues),
                },
                repairs,
                finalStatus: 'FALLBACK',
                issueCodes: issueCodes([...observedIssues, ...safeFallbackIssues]),
              },
            ],
          });
        }
        if (fallbackIssues.length) {
          throw new CandidatePipelineError(
            `Deterministic candidate fallback failed: ${fallbackIssues[0].message}`,
            {
              ...report,
              items: [
                ...report.items,
                {
                  ordinal,
                  blueprint: blueprintStage,
                  content: {
                    status: 'FALLBACK',
                    attempts: contentStage.attempts,
                    issueCodes: issueCodes(fallbackIssues),
                  },
                  repairs,
                  finalStatus: 'FALLBACK',
                  issueCodes: issueCodes([...observedIssues, ...fallbackIssues]),
                },
              ],
            },
          );
        }
        contentStage.status = 'FALLBACK';
        finalStatus = 'FALLBACK';
      }

      return {
        ordinal,
        blueprint,
        candidate,
        blueprintStage,
        contentStage,
        repairs,
        finalStatus,
        issueCodes: issueCodes([...observedIssues, ...issues]),
      };
    },
  );

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const item of items) {
    let candidate = item.candidate;
    let duplicate = seen.has(options.distinctKey(candidate));
    if (duplicate && options.repairCandidate && item.repairs < maxRepairs) {
      const distinctIssues: CandidatePipelineIssue[] = [
        {
          code: 'DUPLICATE_CANDIDATE',
          message: '候选必须与同批已生成内容在策略和教学路径上实质不同。',
        },
      ];
      try {
        const repaired = options.normalizeCandidate(
          await options.repairCandidate(
            candidate,
            item.blueprint,
            distinctIssues,
            item.ordinal,
            item.repairs + 1,
          ),
        );
        const repairedIssues = normalizeIssues(options.validateCandidate(repaired));
        if (!repairedIssues.length && !seen.has(options.distinctKey(repaired))) {
          candidate = repaired;
          item.repairs += 1;
          item.finalStatus = 'REPAIRED';
          item.contentStage.attempts += 1;
          item.contentStage.status = 'REPAIRED';
          item.contentStage.issueCodes = issueCodes(distinctIssues);
          item.issueCodes = [...new Set([...item.issueCodes, ...issueCodes(distinctIssues)])].slice(
            0,
            12,
          );
          duplicate = false;
        }
      } catch {
        duplicate = true;
      }
    }
    if (duplicate) {
      const distinctIssues: CandidatePipelineIssue[] = [
        {
          code: 'DUPLICATE_CANDIDATE',
          message: '候选与同批内容重复，已切换到确定性变体。',
        },
      ];
      let fallbackIssues: CandidatePipelineIssue[];
      try {
        candidate = options.normalizeCandidate(
          options.fallbackCandidate(item.blueprint, distinctIssues, item.ordinal),
        );
        fallbackIssues = normalizeIssues(options.validateCandidate(candidate));
      } catch (fallbackError) {
        const safeFallbackIssues = safeIssues(fallbackError);
        throw new CandidatePipelineError('Deterministic duplicate fallback failed', {
          ...report,
          items: [
            ...report.items,
            {
              ordinal: item.ordinal,
              blueprint: item.blueprintStage,
              content: {
                status: 'FALLBACK',
                attempts: item.contentStage.attempts + 1,
                issueCodes: issueCodes(safeFallbackIssues),
              },
              repairs: item.repairs,
              finalStatus: 'FALLBACK',
              issueCodes: issueCodes([...distinctIssues, ...safeFallbackIssues]),
            },
          ],
        });
      }
      if (fallbackIssues.length) {
        throw new CandidatePipelineError(
          `Deterministic duplicate fallback failed: ${fallbackIssues[0].message}`,
          {
            ...report,
            items: [
              ...report.items,
              {
                ordinal: item.ordinal,
                blueprint: item.blueprintStage,
                content: {
                  status: 'FALLBACK',
                  attempts: item.contentStage.attempts + 1,
                  issueCodes: issueCodes(fallbackIssues),
                },
                repairs: item.repairs,
                finalStatus: 'FALLBACK',
                issueCodes: issueCodes([...distinctIssues, ...fallbackIssues]),
              },
            ],
          },
        );
      }
      if (seen.has(options.distinctKey(candidate))) {
        throw new CandidatePipelineError('Candidate variants are not distinct', report);
      }
      item.finalStatus = 'FALLBACK';
      item.contentStage.attempts += 1;
      item.contentStage.status = 'FALLBACK';
      item.issueCodes = [...new Set([...item.issueCodes, ...issueCodes(distinctIssues)])].slice(
        0,
        12,
      );
    }
    seen.add(options.distinctKey(candidate));
    candidates.push(candidate);
    report.items.push({
      ordinal: item.ordinal,
      blueprint: item.blueprintStage,
      content: item.contentStage,
      repairs: item.repairs,
      finalStatus: item.finalStatus,
      issueCodes: item.issueCodes,
    });
  }

  report.fallbackCount = report.items.filter((item) => item.finalStatus === 'FALLBACK').length;
  report.blueprintFallbackCount = report.items.filter(
    (item) => item.blueprint.status === 'FALLBACK',
  ).length;
  report.repairedCount = report.items.filter((item) => item.finalStatus === 'REPAIRED').length;
  return { candidates, report };
}
