import { describe, expect, it } from 'vitest';
import { evaluateLearningTask, normalizeTaskCompletionRule } from '@/lib/server/learning-tasks';

describe('learning task evidence evaluation', () => {
  it('stays not-started without a marker or classroom evidence', () => {
    const result = evaluateLearningTask({ sceneIds: ['s1', 's2'] });
    expect(result.state).toBe('not-started');
    expect(result.completionRate).toBe(0);
  });

  it('ignores unknown scene ids and derives in-progress from real evidence', () => {
    const result = evaluateLearningTask({
      sceneIds: ['s1', 's2'],
      progressRow: { completed_scenes: ['s1', 'not-in-classroom'], updated_at: 100 },
      now: 200,
    });
    expect(result.state).toBe('in-progress');
    expect(result.completedScenes).toBe(1);
    expect(result.completionRate).toBe(0.5);
  });

  it('requires both all scenes and the configured quiz average', () => {
    const below = evaluateLearningTask({
      sceneIds: ['s1', 'quiz'],
      progressRow: { completed_scenes: ['s1', 'quiz'], quiz_scores: { quiz: 0.59 } },
      rule: { requireAllScenes: true, minQuizScore: 60 },
    });
    expect(below.state).toBe('in-progress');
    expect(below.completionRate).toBeGreaterThanOrEqual(0.98);
    expect(below.completionRate).toBeLessThan(1);

    const passed = evaluateLearningTask({
      sceneIds: ['s1', 'quiz'],
      progressRow: { completed_scenes: ['s1', 'quiz'], quiz_scores: { quiz: 80 }, updated_at: 123 },
      rule: { requireAllScenes: true, minQuizScore: 60 },
      now: 500,
    });
    expect(passed.state).toBe('completed');
    expect(passed.completionRate).toBe(1);
    expect(passed.completedAt).toBe(123);
  });

  it('marks an unfinished task overdue without changing its learning state', () => {
    const result = evaluateLearningTask({ sceneIds: ['s1'], dueAt: 99, now: 100 });
    expect(result.state).toBe('not-started');
    expect(result.overdue).toBe(true);
  });

  it('normalizes unsafe completion rule values', () => {
    expect(normalizeTaskCompletionRule('{"requireAllScenes":false,"minQuizScore":120}')).toEqual({
      requireAllScenes: false,
      minQuizScore: 100,
    });
    expect(normalizeTaskCompletionRule('{bad')).toEqual({
      requireAllScenes: true,
      minQuizScore: null,
    });
  });
});
