import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/quiz-grade/route';
import { gradeQuizForReview, readShortAnswerGrade } from '@/lib/quiz/short-answer';
import { quizViewStateFromAttempt } from '@/lib/quiz/view-state';
import type { QuizQuestion } from '@/lib/types/stage';

const harness = vi.hoisted(() => ({
  createHarnessTurn: vi.fn(),
  runTurn: vi.fn(),
  recordHarnessUsage: vi.fn(),
}));
vi.mock('@/lib/server/agent-harness/classroom-turn', () => ({
  createHarnessTurn: harness.createHarnessTurn,
  recordHarnessUsage: harness.recordHarnessUsage,
}));

const points = 4;
const question = 'Explain why observations and conclusions are distinct.';
const userAnswer = 'An observation records what happened; a conclusion explains it.';
const feedback = 'The distinction is clear.';
const response = { text: JSON.stringify({ score: 3, comment: feedback }), model: 'actual-model', usage: { prompt_tokens: 30, completion_tokens: 12 } };

function request(body: Record<string, unknown>) {
  return new NextRequest('http://runtime.test/api/quiz-grade', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-model': 'UNTRUSTED_PROVIDER', 'x-api-key': 'NEVER_SEND_PROVIDER_KEY' },
  });
}

describe('concept short-answer grading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    harness.createHarnessTurn.mockReturnValue(harness.runTurn);
    harness.runTurn.mockResolvedValue(response);
  });

  it('reports actual usage and sends public text without the grading note, answer key, or learner ID', async () => {
    const result = await POST(request({
      question, userAnswer: `Student ID: NEVER_SEND_PERSON\n${userAnswer}`, points,
      commentPrompt: 'NEVER_SEND_TEACHER_KEY', answer: 'NEVER_SEND_TEACHER_ANSWER',
      learnerKey: 'NEVER_SEND_ACCOUNT', language: 'en-US',
    }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, score: 3, comment: feedback });
    const [messages, signal] = harness.runTurn.mock.calls[0];
    expect(JSON.stringify(messages)).not.toContain('NEVER_SEND');
    expect(JSON.parse(messages[1].content)).toEqual({
      question, userAnswer: `[redacted]\n${userAnswer}`, points, feedbackLanguage: 'English',
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(harness.recordHarnessUsage).toHaveBeenCalledOnce();
    expect(harness.recordHarnessUsage).toHaveBeenCalledWith(response, 'quiz-grade');
  });

  it.each([
    'model did not return JSON',
    '{"score":"3","comment":"Feedback"}',
    '{"score":null,"comment":"Feedback"}',
    '{"score":1e999,"comment":"Feedback"}',
    '{"score":7,"comment":"Feedback"}',
    '{"score":3,"comment":"Answer key: hidden text"}',
  ])('keeps an invalid or unsafe provider response pending', async (text) => {
    harness.runTurn.mockResolvedValue({ ...response, text });
    const result = await POST(request({ question, userAnswer, points }));
    expect(result.status).toBe(503);
    expect(await result.json()).not.toHaveProperty('score');
    expect(harness.recordHarnessUsage).toHaveBeenCalledOnce();
  });

  it('keeps disabled and task-specific private grading pending without a model call', async () => {
    harness.createHarnessTurn.mockReturnValue(undefined);
    expect((await POST(request({ question, userAnswer, points }))).status).toBe(503);
    harness.createHarnessTurn.mockReturnValue(harness.runTurn);
    expect((await POST(request({ question: 'Explain the provided answer key: secret.', userAnswer, points }))).status).toBe(503);
    expect(harness.runTurn).not.toHaveBeenCalled();
    expect(harness.recordHarnessUsage).not.toHaveBeenCalled();
  });

  it('accepts an explicitly assessed zero', async () => {
    harness.runTurn.mockResolvedValue({ ...response, text: '{"score":0,"comment":"The answer does not address the concept."}' });
    expect(await (await POST(request({ question, userAnswer, points }))).json()).toMatchObject({ score: 0 });
  });
});

describe('learner short-answer submit and retry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retains the original submitted answer and only produces a review on a valid retry', async () => {
    const questions: QuizQuestion[] = [
      { id: 'choice', type: 'single', question: 'Pick A', answer: ['A'], points: 1 },
      { id: 'short', type: 'short_answer', question, answer: ['PRIVATE_ANSWER'], commentPrompt: 'PRIVATE_RUBRIC', points },
    ];
    const answers = { choice: 'A', short: userAnswer };
    const fetchGrade = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ score: null }), { status: 503 }))
      .mockResolvedValueOnce(Response.json({ score: 3, comment: feedback }));
    vi.stubGlobal('fetch', fetchGrade);
    const pending = quizViewStateFromAttempt({ sessionId: 'attempt-1', status: 'active', phase: 'submitted', answers });
    expect(pending).toEqual({ phase: 'grading_pending', answers, results: [] });
    expect(await gradeQuizForReview(questions, pending.answers, 'en-US')).toBeNull();
    expect(await gradeQuizForReview(questions, pending.answers, 'en-US')).toEqual([
      { questionId: 'choice', correct: true, status: 'correct', earned: 1 },
      { questionId: 'short', correct: false, status: 'incorrect', earned: 3, aiComment: feedback },
    ]);
    expect(fetchGrade).toHaveBeenCalledTimes(2);
    for (const [url, config] of fetchGrade.mock.calls) {
      expect(url).toBe('/api/quiz-grade');
      expect(JSON.parse(config.body)).toEqual({ question, userAnswer, points, language: 'en-US' });
      expect(config.headers).toEqual({ 'Content-Type': 'application/json' });
    }
    expect(readShortAnswerGrade({ score: NaN, comment: feedback }, points)).toBeNull();
  });
});
