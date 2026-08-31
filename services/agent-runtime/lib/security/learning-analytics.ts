/**
 * Explainable learning analytics for the cybersecurity teaching profile.
 *
 * This module deliberately stays deterministic. LLM output may explain an
 * insight later, but it must not invent mastery scores or silently decide a
 * student's grade. Every value returned here can be traced to scene visits or
 * quiz scores already persisted by the platform.
 */

export type CapabilityDimensionId =
  | 'ai-mastery'
  | 'systems-thinking'
  | 'human-ai-coordination'
  | 'complex-problem-solving'
  | 'paradigm-innovation'
  | 'responsible-ethics';

export type EvidenceConfidence = 'none' | 'low' | 'medium' | 'high';
export type LearnerState = 'not-started' | 'on-track' | 'at-risk' | 'completed';

export interface CapabilityDimensionDefinition {
  id: CapabilityDimensionId;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  keywords: readonly string[];
}

export const CAPABILITY_DIMENSIONS: readonly CapabilityDimensionDefinition[] = [
  {
    id: 'ai-mastery',
    label: 'AI 驾驭力',
    shortLabel: 'AI 驾驭',
    description: '理解 AI 能力边界，并能安全、有效地使用与检验 AI。',
    color: '#38bdf8',
    keywords: ['ai', 'llm', '大模型', '智能体', 'agent', '提示词', 'prompt', '模型安全'],
  },
  {
    id: 'systems-thinking',
    label: '系统思维判断力',
    shortLabel: '系统判断',
    description: '从拓扑、协议、资产与信任边界理解完整攻防系统。',
    color: '#818cf8',
    keywords: ['系统', '拓扑', '网络', '协议', '架构', '信任边界', '攻击面', 'threat model'],
  },
  {
    id: 'human-ai-coordination',
    label: '人机协同组织力',
    shortLabel: '人机协同',
    description: '组织人类与多个智能体分工、验证和协同完成任务。',
    color: '#c084fc',
    keywords: ['协同', '团队', '分工', '编排', '多智能体', 'multi-agent', '角色扮演', '辩论'],
  },
  {
    id: 'complex-problem-solving',
    label: '复杂问题解决力',
    shortLabel: '复杂求解',
    description: '处理跨域、多阶段、证据不完整的安全问题。',
    color: '#fb7185',
    keywords: ['应急', '溯源', '取证', 'apt', '漏洞', '攻防', '渗透', '分析', '处置', '复盘'],
  },
  {
    id: 'paradigm-innovation',
    label: '范式突破创造力',
    shortLabel: '创新创造',
    description: '提出、设计并验证新的安全思路、策略或作品。',
    color: '#f59e0b',
    keywords: ['设计', '创新', '创造', '方案', '策略', '项目', 'pbl', '开放题', '构建'],
  },
  {
    id: 'responsible-ethics',
    label: '责任伦理担当力',
    shortLabel: '责任伦理',
    description: '在授权、合规、披露和双重用途边界内作出判断。',
    color: '#34d399',
    keywords: ['伦理', '合规', '法律', '授权', '责任', '披露', '边界', '网络安全法', '数据安全法'],
  },
] as const;

const DIMENSION_BY_ID = new Map(CAPABILITY_DIMENSIONS.map((dimension) => [dimension.id, dimension]));

export interface AnalyticsScene {
  id: string;
  title: string;
  type?: string;
  description?: string;
  capabilityTags?: CapabilityDimensionId[];
}

export interface LearningProgressSnapshot {
  classroomId: string;
  lessonId?: string;
  totalScenes: number;
  scenes: AnalyticsScene[];
  completedSceneIds: string[];
  quizScores: Record<string, number>;
  updatedAt?: number;
}

export interface CapabilityMetric {
  id: CapabilityDimensionId;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  score: number | null;
  confidence: EvidenceConfidence;
  evidenceCount: number;
  evidenceLabels: string[];
}

export interface LearnerInsight {
  state: LearnerState;
  completionRate: number;
  completedScenes: number;
  totalScenes: number;
  averageQuizScore: number | null;
  quizAttemptCount: number;
  capabilities: CapabilityMetric[];
  weakestCapability: CapabilityMetric | null;
  nextAction: {
    kind: 'start' | 'continue' | 'remediate' | 'extend';
    title: string;
    reason: string;
    classroomId?: string;
    sceneId?: string;
  };
  lastActiveAt: number | null;
}

export interface CohortInsight {
  learnerCount: number;
  atRiskCount: number;
  completedCount: number;
  averageCompletionRate: number;
  averageQuizScore: number | null;
  capabilities: Array<CapabilityMetric & { learnerCoverage: number }>;
}

interface NumericEvidence {
  score: number;
  label: string;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Quiz runtimes commonly persist either 0..1 or 0..100 values.
  const normalized = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
}

function confidenceForEvidence(count: number): EvidenceConfidence {
  if (count <= 0) return 'none';
  if (count === 1) return 'low';
  if (count <= 3) return 'medium';
  return 'high';
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Infer capability tags from explicit metadata first, then conservative keywords. */
export function inferSceneCapabilityIds(scene: AnalyticsScene): CapabilityDimensionId[] {
  if (scene.capabilityTags?.length) {
    return uniqueStrings(scene.capabilityTags).filter((id): id is CapabilityDimensionId =>
      DIMENSION_BY_ID.has(id as CapabilityDimensionId),
    );
  }

  const haystack = `${scene.title} ${scene.description ?? ''}`.toLocaleLowerCase('zh-CN');
  const inferred = CAPABILITY_DIMENSIONS.filter((dimension) =>
    dimension.keywords.some((keyword) => haystack.includes(keyword.toLocaleLowerCase('zh-CN'))),
  ).map((dimension) => dimension.id);

  // Interactive/PBL work provides process evidence even when an old lesson
  // has no explicit tags. Slides alone do not establish capability mastery.
  if (scene.type === 'pbl') {
    inferred.push('human-ai-coordination', 'complex-problem-solving', 'paradigm-innovation');
  } else if (scene.type === 'interactive') {
    inferred.push('systems-thinking', 'complex-problem-solving');
  }

  return uniqueStrings(inferred) as CapabilityDimensionId[];
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findScene(snapshot: LearningProgressSnapshot, sceneId: string): AnalyticsScene | undefined {
  return snapshot.scenes.find((scene) => scene.id === sceneId);
}

function buildCapabilityMetrics(snapshots: readonly LearningProgressSnapshot[]): CapabilityMetric[] {
  const evidence = new Map<CapabilityDimensionId, NumericEvidence[]>();
  for (const dimension of CAPABILITY_DIMENSIONS) evidence.set(dimension.id, []);

  for (const snapshot of snapshots) {
    const completed = new Set(snapshot.completedSceneIds);

    for (const sceneId of completed) {
      const scene = findScene(snapshot, sceneId);
      if (!scene) continue;
      for (const dimensionId of inferSceneCapabilityIds(scene)) {
        evidence.get(dimensionId)?.push({ score: 70, label: `完成：${scene.title}` });
      }
    }

    for (const [sceneId, rawScore] of Object.entries(snapshot.quizScores)) {
      const scene = findScene(snapshot, sceneId);
      const dimensionIds: CapabilityDimensionId[] = scene
        ? inferSceneCapabilityIds(scene)
        : ['complex-problem-solving'];
      const label = scene?.title ?? `测验 ${sceneId}`;
      for (const dimensionId of dimensionIds) {
        evidence.get(dimensionId)?.push({ score: clampScore(rawScore), label: `测验：${label}` });
      }
    }
  }

  return CAPABILITY_DIMENSIONS.map((dimension) => {
    const items = evidence.get(dimension.id) ?? [];
    const score = mean(items.map((item) => item.score));
    return {
      id: dimension.id,
      label: dimension.label,
      shortLabel: dimension.shortLabel,
      description: dimension.description,
      color: dimension.color,
      score: score == null ? null : Math.round(score),
      confidence: confidenceForEvidence(items.length),
      evidenceCount: items.length,
      evidenceLabels: uniqueStrings(items.map((item) => item.label)).slice(0, 5),
    };
  });
}

function nextIncompleteScene(
  snapshots: readonly LearningProgressSnapshot[],
): { classroomId: string; scene: AnalyticsScene } | null {
  for (const snapshot of snapshots) {
    const completed = new Set(snapshot.completedSceneIds);
    const scene = snapshot.scenes.find((candidate) => !completed.has(candidate.id));
    if (scene) return { classroomId: snapshot.classroomId, scene };
  }
  return null;
}

function lowestQuiz(
  snapshots: readonly LearningProgressSnapshot[],
): { classroomId: string; sceneId: string; title: string; score: number } | null {
  let lowest: { classroomId: string; sceneId: string; title: string; score: number } | null = null;
  for (const snapshot of snapshots) {
    for (const [sceneId, rawScore] of Object.entries(snapshot.quizScores)) {
      const score = clampScore(rawScore);
      if (lowest && lowest.score <= score) continue;
      lowest = {
        classroomId: snapshot.classroomId,
        sceneId,
        title: findScene(snapshot, sceneId)?.title ?? '课堂测验',
        score,
      };
    }
  }
  return lowest;
}

/** Build a learner profile from one or more classrooms. No evidence means no score. */
export function buildLearnerInsight(
  snapshots: readonly LearningProgressSnapshot[],
  now = Date.now(),
): LearnerInsight {
  const totalScenes = snapshots.reduce((sum, snapshot) => sum + Math.max(0, snapshot.totalScenes), 0);
  const completedScenes = snapshots.reduce(
    (sum, snapshot) => sum + Math.min(snapshot.totalScenes, new Set(snapshot.completedSceneIds).size),
    0,
  );
  const completionRate = totalScenes > 0 ? completedScenes / totalScenes : 0;
  const quizScores = snapshots.flatMap((snapshot) => Object.values(snapshot.quizScores).map(clampScore));
  const averageQuizScore = mean(quizScores);
  const latestActivity = snapshots.reduce<number | null>((latest, snapshot) => {
    if (!snapshot.updatedAt) return latest;
    return latest == null ? snapshot.updatedAt : Math.max(latest, snapshot.updatedAt);
  }, null);

  const hasEvidence = completedScenes > 0 || quizScores.length > 0;
  const inactiveForSevenDays = latestActivity != null && now - latestActivity > 7 * 24 * 60 * 60 * 1000;
  const atRisk = hasEvidence && completionRate < 0.85 && ((averageQuizScore ?? 100) < 60 || inactiveForSevenDays);
  const state: LearnerState = !hasEvidence
    ? 'not-started'
    : completionRate >= 0.999 && (averageQuizScore == null || averageQuizScore >= 60)
      ? 'completed'
      : atRisk
        ? 'at-risk'
        : 'on-track';

  const capabilities = buildCapabilityMetrics(snapshots);
  const scoredCapabilities = capabilities.filter(
    (metric): metric is CapabilityMetric & { score: number } => metric.score != null,
  );
  const weakestCapability = scoredCapabilities.length
    ? scoredCapabilities.reduce((lowest, metric) => metric.score < lowest.score ? metric : lowest)
    : null;

  const weakQuiz = lowestQuiz(snapshots);
  const next = nextIncompleteScene(snapshots);
  let nextAction: LearnerInsight['nextAction'];
  if (weakQuiz && weakQuiz.score < 60) {
    nextAction = {
      kind: 'remediate',
      title: `复习「${weakQuiz.title}」`,
      reason: `最近测验 ${Math.round(weakQuiz.score)} 分，建议先补齐关键概念再继续。`,
      classroomId: weakQuiz.classroomId,
      sceneId: weakQuiz.sceneId,
    };
  } else if (next) {
    nextAction = {
      kind: hasEvidence ? 'continue' : 'start',
      title: `${hasEvidence ? '继续' : '开始'}「${next.scene.title}」`,
      reason: hasEvidence ? '这是当前学习路径中的下一个未完成场景。' : '从课程的第一个学习场景建立基线。',
      classroomId: next.classroomId,
      sceneId: next.scene.id,
    };
  } else {
    nextAction = {
      kind: 'extend',
      title: '进入进阶对抗任务',
      reason: '当前已发布内容已完成，可根据薄弱能力选择延伸挑战。',
    };
  }

  return {
    state,
    completionRate,
    completedScenes,
    totalScenes,
    averageQuizScore: averageQuizScore == null ? null : Math.round(averageQuizScore),
    quizAttemptCount: quizScores.length,
    capabilities,
    weakestCapability,
    nextAction,
    lastActiveAt: latestActivity,
  };
}

export function buildCohortInsight(insights: readonly LearnerInsight[]): CohortInsight {
  const averageCompletionRate = mean(insights.map((insight) => insight.completionRate)) ?? 0;
  const quizScores = insights
    .map((insight) => insight.averageQuizScore)
    .filter((score): score is number => score != null);

  const capabilities = CAPABILITY_DIMENSIONS.map((definition) => {
    const learnerMetrics = insights
      .map((insight) => insight.capabilities.find((metric) => metric.id === definition.id))
      .filter((metric): metric is CapabilityMetric & { score: number } => metric?.score != null);
    const score = mean(learnerMetrics.map((metric) => metric.score));
    const evidenceCount = learnerMetrics.reduce((sum, metric) => sum + metric.evidenceCount, 0);
    return {
      id: definition.id,
      label: definition.label,
      shortLabel: definition.shortLabel,
      description: definition.description,
      color: definition.color,
      score: score == null ? null : Math.round(score),
      confidence: confidenceForEvidence(evidenceCount),
      evidenceCount,
      evidenceLabels: uniqueStrings(learnerMetrics.flatMap((metric) => metric.evidenceLabels)).slice(0, 5),
      learnerCoverage: insights.length ? learnerMetrics.length / insights.length : 0,
    };
  });

  return {
    learnerCount: insights.length,
    atRiskCount: insights.filter((insight) => insight.state === 'at-risk').length,
    completedCount: insights.filter((insight) => insight.state === 'completed').length,
    averageCompletionRate,
    averageQuizScore: quizScores.length ? Math.round(mean(quizScores) ?? 0) : null,
    capabilities,
  };
}

export function safeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value.filter((item): item is string => typeof item === 'string'));
  if (typeof value !== 'string') return [];
  try {
    return safeStringArray(JSON.parse(value));
  } catch {
    return [];
  }
}

export function safeQuizScores(value: unknown): Record<string, number> {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return {};
    }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return Object.fromEntries(
    Object.entries(candidate)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
      .map(([key, score]) => [key, clampScore(score)]),
  );
}
