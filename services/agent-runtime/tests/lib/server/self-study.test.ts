import { describe, expect, it } from 'vitest';
import { buildLearnerInsight } from '@/lib/security/learning-analytics';
import { buildSelfStudyPlanningInput, selectSelfStudyItems } from '@/lib/server/self-study';
import type { TeachingPackagePlan } from '@/lib/types/teaching-plan';

const plan: TeachingPackagePlan = {
  title: 'SQL 注入自学',
  summary: 'summary',
  audience: 'student',
  learningObjectives: ['理解根因'],
  decisionSummary: 'decision',
  safetyNotes: [],
  totalMinutes: 70,
  source: 'ai',
  items: [
    {
      id: '1',
      type: 'slide',
      title: '概念',
      purpose: 'p',
      reason: 'r',
      keyPoints: [],
      estimatedMinutes: 15,
      quality: 'fast',
    },
    {
      id: '2',
      type: 'vulnerable-lab',
      title: '实验',
      purpose: 'p',
      reason: 'r',
      keyPoints: [],
      estimatedMinutes: 40,
      quality: 'rich',
    },
    {
      id: '3',
      type: 'quiz',
      title: '自检',
      purpose: 'p',
      reason: 'r',
      keyPoints: [],
      estimatedMinutes: 15,
      quality: 'fast',
    },
    {
      id: '4',
      type: 'debate',
      title: '讨论',
      purpose: 'p',
      reason: 'r',
      keyPoints: [],
      estimatedMinutes: 20,
      quality: 'fast',
    },
  ],
};

describe('self-study planning', () => {
  it('caps the generated package at three items and respects a lightweight budget', () => {
    const selected = selectSelfStudyItems(plan, 30);
    expect(selected.map((item) => item.type)).toEqual(['slide', 'quiz']);
    expect(selected.every((item) => item.quality === 'fast')).toBe(true);
  });

  it('includes learner evidence in the planning request without inventing a score', () => {
    const input = buildSelfStudyPlanningInput(
      { goal: '理解 SQL 注入', level: 'beginner', durationMinutes: 30, preference: 'auto' },
      buildLearnerInsight([]),
    );
    expect(input.topic).toBe('理解 SQL 注入');
    expect(input.description).toContain('暂无');
    expect(input.description).toContain('2到3项');
  });
});
