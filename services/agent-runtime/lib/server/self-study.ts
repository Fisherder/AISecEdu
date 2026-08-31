import type { LearnerInsight } from '@/lib/security/learning-analytics';
import type {
  TeachingPackagePlan,
  TeachingPlanInput,
  TeachingPlanItem,
} from '@/lib/types/teaching-plan';

export interface SelfStudyRequest {
  goal: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  durationMinutes: number;
  preference: 'auto' | 'explain' | 'practice' | 'challenge';
}

export function buildSelfStudyPlanningInput(
  request: SelfStudyRequest,
  insight: LearnerInsight,
): TeachingPlanInput {
  const levelLabel = { beginner: '入门', intermediate: '进阶', advanced: '挑战' }[request.level];
  const preferenceLabel = {
    auto: '由智能体自行判断最合适的形式',
    explain: '偏重讲解与可视化，但仍由智能体判断是否需要练习',
    practice: '偏重练习与即时反馈，但仍由智能体判断内容组合',
    challenge: '偏重代码、仿真、实验或辩论等挑战活动',
  }[request.preference];
  const weak = insight.weakestCapability
    ? `${insight.weakestCapability.label}（现有证据 ${insight.weakestCapability.score ?? '不足'}）`
    : '暂无足够证据判断薄弱维度';
  return {
    topic: request.goal,
    description: [
      '这是学生自主学习包，不是教师整门课程。',
      `学习者自报基础：${levelLabel}。可用时间：${request.durationMinutes}分钟。偏好：${preferenceLabel}。`,
      `系统已有证据：总进度${Math.round(insight.completionRate * 100)}%，测验均分${insight.averageQuizScore ?? '暂无'}，优先关注${weak}。`,
      '自主选择2到3项最有价值的内容并按学习顺序组织；不要机械包含所有类型，也不要超过可用时间。',
      '内容必须可在浏览器课堂中独立学习，并包含清晰目标、反馈或自检方式。',
    ].join('\n'),
  };
}

/** Keep the autonomous plan lightweight and within the student's time budget. */
export function selectSelfStudyItems(
  plan: TeachingPackagePlan,
  durationMinutes: number,
): TeachingPlanItem[] {
  const budget = Math.max(10, Math.min(90, durationMinutes));
  const selected: TeachingPlanItem[] = [];
  let used = 0;
  for (const item of plan.items) {
    if (selected.length >= 3) break;
    const next = used + item.estimatedMinutes;
    if (selected.length >= 1 && next > budget * 1.2) continue;
    selected.push({ ...item, quality: 'fast' });
    used = next;
  }
  if (selected.length === 0 && plan.items[0]) selected.push({ ...plan.items[0], quality: 'fast' });
  return selected;
}
