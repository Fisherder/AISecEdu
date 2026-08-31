import { describe, expect, it } from 'vitest';
import {
  buildCohortInsight,
  buildLearnerInsight,
  inferSceneCapabilityIds,
  safeQuizScores,
  safeStringArray,
  type LearningProgressSnapshot,
} from '@/lib/security/learning-analytics';

const snapshot = (overrides: Partial<LearningProgressSnapshot> = {}): LearningProgressSnapshot => ({
  classroomId: 'classroom-1',
  totalScenes: 3,
  scenes: [
    { id: 's1', title: '企业网络拓扑与威胁模型', type: 'interactive' },
    { id: 's2', title: '多智能体红蓝协同演练', type: 'pbl' },
    { id: 's3', title: '授权边界与漏洞披露', type: 'quiz' },
  ],
  completedSceneIds: [],
  quizScores: {},
  ...overrides,
});

describe('learning analytics', () => {
  it('uses explicit and conservative inferred capability tags', () => {
    expect(inferSceneCapabilityIds({
      id: 'x',
      title: 'ignored',
      capabilityTags: ['responsible-ethics'],
    })).toEqual(['responsible-ethics']);

    const inferred = inferSceneCapabilityIds({ id: 'y', title: '网络攻击面拓扑分析', type: 'interactive' });
    expect(inferred).toContain('systems-thinking');
    expect(inferred).toContain('complex-problem-solving');
  });

  it('does not fabricate capability scores when there is no evidence', () => {
    const insight = buildLearnerInsight([snapshot()]);
    expect(insight.state).toBe('not-started');
    expect(insight.capabilities.every((metric) => metric.score === null)).toBe(true);
    expect(insight.nextAction.kind).toBe('start');
  });

  it('builds traceable scores and remediation from scene and quiz evidence', () => {
    const insight = buildLearnerInsight([
      snapshot({
        completedSceneIds: ['s1', 's3'],
        quizScores: { s3: 0.45 },
        updatedAt: Date.now(),
      }),
    ]);

    expect(insight.completionRate).toBeCloseTo(2 / 3);
    expect(insight.averageQuizScore).toBe(45);
    expect(insight.state).toBe('at-risk');
    expect(insight.nextAction.kind).toBe('remediate');
    const ethics = insight.capabilities.find((metric) => metric.id === 'responsible-ethics');
    expect(ethics?.score).not.toBeNull();
    expect(ethics?.evidenceLabels.some((label) => label.includes('授权边界'))).toBe(true);
  });

  it('aggregates a cohort without treating missing dimensions as zero', () => {
    const active = buildLearnerInsight([
      snapshot({ completedSceneIds: ['s1'], updatedAt: Date.now() }),
    ]);
    const untouched = buildLearnerInsight([snapshot()]);
    const cohort = buildCohortInsight([active, untouched]);

    const systems = cohort.capabilities.find((metric) => metric.id === 'systems-thinking');
    expect(systems?.score).toBe(70);
    expect(systems?.learnerCoverage).toBe(0.5);
  });

  it('normalizes persisted JSON shapes safely', () => {
    expect(safeStringArray('["a","a","b"]')).toEqual(['a', 'b']);
    expect(safeStringArray('{bad json')).toEqual([]);
    expect(safeQuizScores('{"q1":0.8,"q2":75,"bad":"x"}')).toEqual({ q1: 80, q2: 75 });
  });
});
