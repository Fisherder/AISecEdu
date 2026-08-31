import { safeQuizScores, safeStringArray } from '@/lib/security/learning-analytics';

export interface TaskCompletionRule {
  requireAllScenes: boolean;
  minQuizScore: number | null;
}

export type LearningTaskState = 'not-started' | 'in-progress' | 'completed';

export interface LearningTaskProgress {
  state: LearningTaskState;
  completionRate: number;
  completedScenes: number;
  totalScenes: number;
  averageQuizScore: number | null;
  quizAttemptCount: number;
  sceneRequirementMet: boolean;
  quizRequirementMet: boolean;
  overdue: boolean;
  startedAt: number | null;
  completedAt: number | null;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Use the safe defaults below.
    }
  }
  return {};
}

export function normalizeTaskCompletionRule(value: unknown): TaskCompletionRule {
  const raw = objectValue(value);
  const score =
    typeof raw.minQuizScore === 'number' && Number.isFinite(raw.minQuizScore)
      ? Math.max(0, Math.min(100, Math.round(raw.minQuizScore)))
      : null;
  return {
    requireAllScenes: raw.requireAllScenes !== false,
    minQuizScore: score,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Derive assignment state from traceable classroom evidence. Unknown scene ids
 * are ignored, and the persisted attempt marker cannot by itself complete work.
 */
export function evaluateLearningTask(args: {
  sceneIds: readonly string[];
  progressRow?: Record<string, unknown> | null;
  attemptRow?: Record<string, unknown> | null;
  rule?: unknown;
  dueAt?: number | null;
  now?: number;
}): LearningTaskProgress {
  const rule = normalizeTaskCompletionRule(args.rule);
  const knownScenes = new Set(args.sceneIds);
  const completedSceneIds = safeStringArray(args.progressRow?.completed_scenes).filter((sceneId) =>
    knownScenes.has(sceneId),
  );
  const completedScenes = new Set(completedSceneIds).size;
  const totalScenes = knownScenes.size;
  const quizScores = Object.values(safeQuizScores(args.progressRow?.quiz_scores));
  const averageQuizScore =
    quizScores.length > 0
      ? Math.round(quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length)
      : null;
  const sceneRequirementMet =
    !rule.requireAllScenes || (totalScenes > 0 && completedScenes >= totalScenes);
  const quizRequirementMet =
    rule.minQuizScore == null ||
    (averageQuizScore != null && averageQuizScore >= rule.minQuizScore);
  const completed = sceneRequirementMet && quizRequirementMet;
  const persistedStartedAt = numberOrNull(args.attemptRow?.started_at);
  const persistedCompletedAt = numberOrNull(args.attemptRow?.completed_at);
  const hasEvidence = completedScenes > 0 || quizScores.length > 0 || persistedStartedAt != null;
  const state: LearningTaskState = completed
    ? 'completed'
    : hasEvidence
      ? 'in-progress'
      : 'not-started';

  const sceneProgress = totalScenes > 0 ? Math.min(1, completedScenes / totalScenes) : 0;
  const quizProgress =
    rule.minQuizScore == null
      ? 1
      : averageQuizScore == null
        ? 0
        : Math.min(1, averageQuizScore / Math.max(1, rule.minQuizScore));
  const completionRate =
    rule.minQuizScore == null ? sceneProgress : sceneProgress * 0.8 + quizProgress * 0.2;
  const now = args.now ?? Date.now();

  return {
    state,
    completionRate: completed ? 1 : Math.max(0, Math.min(0.99, completionRate)),
    completedScenes,
    totalScenes,
    averageQuizScore,
    quizAttemptCount: quizScores.length,
    sceneRequirementMet,
    quizRequirementMet,
    overdue: !completed && typeof args.dueAt === 'number' && args.dueAt < now,
    startedAt: persistedStartedAt,
    completedAt: completed
      ? (persistedCompletedAt ?? numberOrNull(args.progressRow?.updated_at) ?? now)
      : null,
  };
}

export function taskEvidenceSnapshot(progress: LearningTaskProgress): Record<string, unknown> {
  return {
    state: progress.state,
    completedScenes: progress.completedScenes,
    totalScenes: progress.totalScenes,
    averageQuizScore: progress.averageQuizScore,
    quizAttemptCount: progress.quizAttemptCount,
    checkedAt: Date.now(),
  };
}
