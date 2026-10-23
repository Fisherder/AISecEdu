import { describe, expect, it } from 'vitest';
import {
  validateCinematicLearnerReview,
  type CinematicLearnerCopy,
} from '@/lib/server/cinematic-learner-copy';

describe('cinematic learner review', () => {
  it('canonicalizes complete node review IDs copied from language unit IDs', () => {
    const copy: CinematicLearnerCopy = {
      version: 'cinematic-learner-copy-v1',
      title: '闸阀演示',
      audience: '初次学习闸阀的学生',
      overview: '观察闸板、阀杆和流道，理解闸阀怎样控制介质通过。',
      modelNote: '',
      chapters: Array.from({ length: 4 }, (_, index) => ({
        index,
        goalIds: ['g1'],
        title: `知识${index + 1}`,
        observation: '画面中可以看到闸板、阀杆和流道的相对位置。',
        explanation: '闸板升降会改变流道是否畅通，从而控制介质通过。',
        question: '闸板升起后，流道会发生什么变化？',
      })),
      nodes: [{ id: 'gate_disc', label: '闸板', explanation: '升降后打开或封住流道的启闭件。' }],
      connections: [],
    };
    const unitIds = ['introduction', 'chapter-0', 'chapter-1', 'chapter-2', 'chapter-3', 'node-gate_disc'];
    const result = validateCinematicLearnerReview(copy, {
      learningGoalsFaithful: true,
      scientificallySound: true,
      chapterChecks: copy.chapters.map(({ index }) => ({
        index,
        goalAligned: true,
        questionChecksUnderstanding: true,
        meaningExplained: true,
        grounded: true,
      })),
      nodeChecks: [
        { id: 'node-gate_disc', explainsMeaning: true },
        { id: 'gate_disc', explainsMeaning: true },
        { id: 'connections', explainsMeaning: true },
      ],
      issues: [],
      languageReview: {
        version: 'plain-teaching-v1',
        checks: unitIds.map((unitId) => ({
          unitId,
          direct: true,
          concrete: true,
          termsExplained: true,
          natural: true,
          faithful: true,
        })),
        issues: [],
      },
    });

    expect(result.review.nodeChecks).toEqual([{ id: 'gate_disc', explainsMeaning: true }]);
    expect(result.issues).toEqual([]);
  });
});
