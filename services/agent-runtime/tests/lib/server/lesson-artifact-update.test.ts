import { describe, expect, it } from 'vitest';
import type { LessonArtifact } from '@/lib/types/lesson';
import { applyLessonArtifactUpdate } from '@/lib/server/lesson-artifact-update';

const slideArtifact = (): LessonArtifact => ({
  id: 'slide-1',
  type: 'slide',
  title: 'Old slide',
  outline: {
    id: 'outline-slide',
    type: 'slide',
    title: 'Old slide',
    description: 'demo',
    keyPoints: ['one'],
    order: 0,
  },
  content: {
    elements: [
      {
        id: 'text-1',
        type: 'text',
        left: 10,
        top: 10,
        width: 200,
        height: 50,
        rotate: 0,
        defaultFontName: 'Inter',
        defaultColor: '#111',
        content: '<p style="font-size:24px">Old</p>',
      },
    ],
    remark: 'before',
  },
  order: 0,
  createdAt: 1,
});

const quizArtifact = (): LessonArtifact => ({
  id: 'quiz-1',
  type: 'quiz',
  title: 'Quiz',
  outline: {
    id: 'outline-quiz',
    type: 'quiz',
    title: 'Quiz',
    description: 'demo',
    keyPoints: ['one'],
    order: 1,
  },
  content: {
    questions: [
      {
        id: 'q-1',
        type: 'single',
        question: 'Old question?',
        options: [
          { value: 'A', label: 'A' },
          { value: 'B', label: 'B' },
        ],
        answer: ['A'],
      },
    ],
  },
  order: 1,
  createdAt: 1,
});

describe('applyLessonArtifactUpdate', () => {
  it('updates a slide title, outline title, rich text and remark', () => {
    const artifact = slideArtifact();
    const content = structuredClone(artifact.content) as unknown as {
      elements: Array<Record<string, unknown>>;
      remark: string;
    };
    content.elements[0]!.content = '<p style="font-size:28px">New<script>alert(1)</script></p>';
    content.remark = 'after';

    const result = applyLessonArtifactUpdate(artifact, { title: 'New slide', content });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.title).toBe('New slide');
    expect(result.artifact.outline.title).toBe('New slide');
    expect((result.artifact.content as { remark?: string }).remark).toBe('after');
    const html = (result.artifact.content as { elements: Array<{ content: string }> }).elements[0]!
      .content;
    expect(html).toContain('font-size:28px');
    expect(html).not.toContain('<script>');
  });

  it('accepts a valid structured quiz update', () => {
    const artifact = quizArtifact();
    const content = structuredClone(artifact.content) as unknown as {
      questions: Array<Record<string, unknown>>;
    };
    content.questions[0]!.question = 'Parameterized queries do what?';
    content.questions[0]!.answer = ['B'];

    const result = applyLessonArtifactUpdate(artifact, { content });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const question = (
      result.artifact.content as { questions: Array<{ question: string; answer: string[] }> }
    ).questions[0]!;
    expect(question.question).toBe('Parameterized queries do what?');
    expect(question.answer).toEqual(['B']);
  });

  it('rejects a malformed slide update', () => {
    expect(
      applyLessonArtifactUpdate(slideArtifact(), { content: { remark: 'missing elements' } }),
    ).toEqual({
      ok: false,
      error: 'Slide content must contain an elements array',
    });
  });

  it('rejects a quiz whose answer does not reference an option', () => {
    const artifact = quizArtifact();
    const content = structuredClone(artifact.content) as unknown as {
      questions: Array<Record<string, unknown>>;
    };
    content.questions[0]!.answer = ['Z'];

    expect(applyLessonArtifactUpdate(artifact, { content })).toEqual({
      ok: false,
      error: 'Question 1 has an answer that is not one of its options',
    });
  });
});
