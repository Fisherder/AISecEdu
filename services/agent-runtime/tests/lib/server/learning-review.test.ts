import { describe, expect, it } from 'vitest';
import {
  buildLearnerInsight,
  type LearningProgressSnapshot,
} from '@/lib/security/learning-analytics';
import {
  buildFallbackLearningReview,
  normalizeLearningReview,
  parseLearningReview,
} from '@/lib/server/learning-review';

const insight = buildLearnerInsight([
  {
    classroomId: 'classroom',
    totalScenes: 2,
    scenes: [
      { id: 'network', title: '网络拓扑与攻击面', type: 'interactive' },
      { id: 'ethics', title: '授权与责任边界', type: 'quiz' },
    ],
    completedSceneIds: ['network', 'ethics'],
    quizScores: { ethics: 55 },
    updatedAt: Date.now(),
  } satisfies LearningProgressSnapshot,
]);

describe('formative learning review', () => {
  it('builds an evidence-grounded local review', () => {
    const review = buildFallbackLearningReview(insight);
    expect(review.summary).toContain('2/2');
    expect(review.evidenceNote).toContain('1次测验');
    expect(review.disclaimer).toContain('不作为正式成绩');
  });

  it('normalizes model output while enforcing the platform disclaimer', () => {
    const review = normalizeLearningReview(
      {
        summary: '你已经完成本轮学习。',
        strengths: ['能识别攻击面。'],
        focusAreas: ['继续核查授权边界。'],
        nextSteps: ['订正低分测验。'],
        evidenceNote: '来自现有课堂证据。',
        disclaimer: '模型试图覆盖平台规则',
      },
      insight,
    );
    expect(review?.summary).toContain('完成');
    expect(review?.disclaimer).toContain('不作为正式成绩');
    expect(review?.disclaimer).not.toContain('覆盖平台规则');
  });

  it('rejects incomplete or malformed model output', () => {
    expect(normalizeLearningReview({ summary: 'only summary' }, insight)).toBeNull();
    expect(parseLearningReview('not json', insight)).toBeNull();
  });
});
