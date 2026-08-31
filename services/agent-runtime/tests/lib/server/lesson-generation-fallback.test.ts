import { describe, expect, it, vi } from 'vitest';
import { generateSingleArtifact } from '@/lib/server/lesson-generation';

describe('deterministic materialization fallback', () => {
  it('keeps a slide usable when the model returns no renderable content', async () => {
    const artifact = await generateSingleArtifact(
      {
        type: 'slide',
        title: '输入边界',
        description: '解释输入、证据和验证之间的关系。',
        keyPoints: ['观察输入', '记录证据'],
      },
      1,
      vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
      { useWorkflow: true },
    );

    expect(artifact?.content).toMatchObject({
      layout: 'cover',
      generationFallback: true,
    });
    expect((artifact?.content as { elements: unknown[] }).elements.length).toBeGreaterThan(0);
  });

  it('keeps a quiz and interactive artifact renderable after a model outage', async () => {
    const fail = vi.fn(async () => {
      throw new Error('provider unavailable');
    });
    const quiz = await generateSingleArtifact(
      { type: 'quiz', title: '证据检查', keyPoints: ['解释依据'] },
      1,
      fail,
      {},
    );
    const diagram = await generateSingleArtifact(
      { type: 'diagram', title: '证据链', keyPoints: ['输入', '观察', '结论'] },
      2,
      fail,
      {},
    );

    expect(quiz?.content).toMatchObject({ generationFallback: true });
    expect((quiz?.content as { questions: unknown[] }).questions).toHaveLength(1);
    expect(diagram?.content).toMatchObject({
      widgetType: 'diagram',
      generationFallback: true,
    });
    expect((diagram?.content as { html: string }).html).toContain('data-aisecedu-fallback');
  });
});

it('enforces an exact single-choice contract and falls back when model output changes type', async () => {
  const quiz = await generateSingleArtifact(
    {
      type: 'quiz',
      title: '无线处置自检',
      keyPoints: ['建立基线', '验证恢复'],
      quizConfig: {
        questionCount: 2,
        difficulty: 'medium',
        questionTypes: ['single'],
      },
    },
    1,
    vi.fn(async () =>
      JSON.stringify([
        {
          type: 'multiple',
          question: '错误题型',
          options: ['甲', '乙'],
          answer: ['A'],
          analysis: '反馈',
        },
      ]),
    ),
    {},
  );

  const content = quiz?.content as {
    generationFallback?: boolean;
    questions: Array<{ type: string; options?: unknown[]; answer?: string[]; analysis?: string }>;
  };
  expect(content.generationFallback).toBe(true);
  expect(content.questions).toHaveLength(2);
  expect(content.questions.every((question) => question.type === 'single')).toBe(true);
  expect(content.questions.every((question) => question.options?.length === 3)).toBe(true);
  expect(content.questions.every((question) => question.answer?.length === 1)).toBe(true);
  expect(content.questions.every((question) => Boolean(question.analysis))).toBe(true);
});
