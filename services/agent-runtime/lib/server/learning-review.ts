import { parseJsonResponse } from '@/lib/generation/json-repair';
import type { LearnerInsight } from '@/lib/security/learning-analytics';

export interface FormativeLearningReview {
  summary: string;
  strengths: string[];
  focusAreas: string[];
  nextSteps: string[];
  evidenceNote: string;
  disclaimer: string;
}

const DISCLAIMER =
  '本评价仅用于形成性学习反馈，不作为正式成绩，最终判断由学生与教师结合实际作品和过程证据作出。';

function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().replace(/\s+/g, ' ').slice(0, 220))
    .filter(Boolean)
    .slice(0, limit);
}

export function buildFallbackLearningReview(insight: LearnerInsight): FormativeLearningReview {
  const scored = insight.capabilities.filter((item) => item.score != null);
  const strongest = [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 2);
  const weakest = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 2);
  const noEvidence = insight.completedScenes === 0 && insight.quizAttemptCount === 0;
  return {
    summary: noEvidence
      ? '当前还没有足够的课堂或测验证据形成个性化结论，建议先完成一个学习任务建立基线。'
      : `已记录 ${insight.completedScenes}/${insight.totalScenes} 个学习场景和 ${insight.quizAttemptCount} 次测验证据；当前建议是“${insight.nextAction.title}”。`,
    strengths:
      strongest.length > 0
        ? strongest.map(
            (item) =>
              `${item.label}已有${item.evidenceCount}条可追溯证据，当前表现约为${item.score}。`,
          )
        : ['目前证据不足，暂不推断优势维度。'],
    focusAreas:
      weakest.length > 0
        ? weakest.map(
            (item) => `${item.label}的现有证据相对较弱，可优先通过针对性任务继续验证和提升。`,
          )
        : ['先增加课堂参与、练习提交或作品证据，再判断需要重点加强的方向。'],
    nextSteps: [
      insight.nextAction.title,
      insight.nextAction.reason,
      '完成后再生成一次评价，比较新增证据带来的变化。',
    ],
    evidenceNote: `评价依据：${insight.completedScenes}个已完成场景、${insight.quizAttemptCount}次测验；无证据的能力维度保持空白，不按零分处理。`,
    disclaimer: DISCLAIMER,
  };
}

export function normalizeLearningReview(
  raw: unknown,
  insight: LearnerInsight,
): FormativeLearningReview | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const summary = typeof item.summary === 'string' ? item.summary.trim().slice(0, 600) : '';
  const strengths = strings(item.strengths, 4);
  const focusAreas = strings(item.focusAreas, 4);
  const nextSteps = strings(item.nextSteps, 5);
  if (!summary || strengths.length === 0 || focusAreas.length === 0 || nextSteps.length === 0)
    return null;
  const fallback = buildFallbackLearningReview(insight);
  return {
    summary,
    strengths,
    focusAreas,
    nextSteps,
    evidenceNote:
      typeof item.evidenceNote === 'string'
        ? item.evidenceNote.trim().slice(0, 500)
        : fallback.evidenceNote,
    disclaimer: DISCLAIMER,
  };
}

export function parseLearningReview(
  response: string,
  insight: LearnerInsight,
): FormativeLearningReview | null {
  try {
    return normalizeLearningReview(parseJsonResponse<unknown>(response), insight);
  } catch {
    return null;
  }
}

export function learningReviewEvidenceSnapshot(insight: LearnerInsight, eventCount: number) {
  return {
    generatedAt: Date.now(),
    state: insight.state,
    completionRate: insight.completionRate,
    completedScenes: insight.completedScenes,
    totalScenes: insight.totalScenes,
    averageQuizScore: insight.averageQuizScore,
    quizAttemptCount: insight.quizAttemptCount,
    evidenceEventCount: eventCount,
    capabilities: insight.capabilities.map((item) => ({
      id: item.id,
      label: item.label,
      score: item.score,
      confidence: item.confidence,
      evidenceCount: item.evidenceCount,
      evidenceLabels: item.evidenceLabels,
    })),
    nextAction: insight.nextAction,
  };
}

export const LEARNING_REVIEW_SYSTEM_PROMPT = `你是学习教练，只能解释系统提供的可追溯学习证据。

要求：
1. 使用简体中文，语气具体、支持性强，不贴标签，不做人格判断。
2. 不得虚构分数、行为、作品或能力；无证据必须明确说证据不足。
3. 给出可执行的下一步，不把形成性评价表述为正式成绩。
4. 只返回 JSON，不要 Markdown。结构：
{"summary":"...","strengths":["..."],"focusAreas":["..."],"nextSteps":["..."],"evidenceNote":"..."}`;
