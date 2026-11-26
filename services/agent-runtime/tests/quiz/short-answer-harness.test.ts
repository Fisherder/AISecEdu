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
    'First {"score":3,"comment":"A"} and second {"score":2,"comment":"B"}',
    '```json\n{"score":3,"comment":"A"}\n```\n```json\n{"score":2,"comment":"B"}\n```',
    '{"score":"3","comment":"Feedback"}',
    '{"score":null,"comment":"Feedback"}',
    '{"score":1e999,"comment":"Feedback"}',
    '{"score":7,"comment":"Feedback"}',
  ])('keeps an invalid provider response pending', async (text) => {
    harness.runTurn.mockResolvedValue({ ...response, text });
    const result = await POST(request({ question, userAnswer, points }));
    expect(result.status).toBe(503);
    expect(await result.json()).not.toHaveProperty('score');
    expect(harness.recordHarnessUsage).toHaveBeenCalledOnce();
  });

  it('extracts a single JSON grade object wrapped in brief prose', async () => {
    harness.runTurn.mockResolvedValue({
      ...response,
      text: `Here is the grade: {"score":3,"comment":"${feedback}"}`,
    });
    const result = await POST(request({ question, userAnswer, points }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, score: 3, comment: feedback });
    expect(harness.recordHarnessUsage).toHaveBeenCalledOnce();
  });

  it('rejects a restricted model comment without returning feedback or giving a score', async () => {
    harness.runTurn.mockResolvedValue({ ...response, text: '{"score":3,"comment":"Answer key: FIXTURE_ONLY"}' });
    const result = await POST(request({ question, userAnswer, points }));
    expect(result.status).toBe(422);
    const payload = await result.json();
    expect(payload).not.toHaveProperty('score');
    expect(JSON.stringify(payload)).not.toContain('FIXTURE_ONLY');
    expect(harness.recordHarnessUsage).toHaveBeenCalledOnce();
  });

  it('reports explicit provider abstention as unsupported and preserves the submitted answer', async () => {
    harness.runTurn.mockResolvedValue({ ...response, text: '{"score":null,"comment":""}' });
    const answers = { concept: userAnswer };
    const questions: QuizQuestion[] = [{ id: 'concept', type: 'short_answer', question, points }];
    const grader = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const result = await POST(request(JSON.parse(String(init?.body))));
      expect(result.status).toBe(422);
      expect(await result.clone().json()).not.toHaveProperty('score');
      return result;
    });
    vi.stubGlobal('fetch', grader);
    try {
      expect(await gradeQuizForReview(questions, answers, 'en-US')).toEqual({ status: 'unsupported' });
      expect(answers).toEqual({ concept: userAnswer });
      expect(harness.recordHarnessUsage).toHaveBeenCalledOnce();
      expect(grader).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports temporarily unavailable when the grader is disabled', async () => {
    harness.createHarnessTurn.mockReturnValue(undefined);
    expect((await POST(request({ question, userAnswer, points }))).status).toBe(503);
    expect(harness.runTurn).not.toHaveBeenCalled();
    expect(harness.recordHarnessUsage).not.toHaveBeenCalled();
  });

  it.each([
    { question: 'Explain this classroom example flag{PRIVATE_CLASSROOM_TEXT}.' },
    { userAnswer: 'The label was FLAG {PRIVATE_CLASSROOM_TEXT}.' },
    { question: 'Explain the provided answer key: PRIVATE_CLASSROOM_TEXT.' },
    { userAnswer: 'The reference answer is PRIVATE_CLASSROOM_TEXT.' },
    { question: 'Name: PRIVATE_CLASSROOM_TEXT' },
    { userAnswer: 'Student ID: PRIVATE_CLASSROOM_TEXT' },
  ])('returns a nonretryable response before contacting Harness for ineligible text', async (input) => {
    const result = await POST(request({ question, userAnswer, points, ...input }));
    expect(result.status).toBe(422);
    const payload = await result.json();
    expect(payload).toMatchObject({ success: false, errorCode: 'CONTENT_SENSITIVE' });
    expect(JSON.stringify(payload)).not.toContain('PRIVATE_CLASSROOM_TEXT');
    expect(harness.createHarnessTurn).not.toHaveBeenCalled();
    expect(harness.runTurn).not.toHaveBeenCalled();
    expect(harness.recordHarnessUsage).not.toHaveBeenCalled();
  });

  it('redacts identifying text in otherwise valid feedback', async () => {
    harness.runTurn.mockResolvedValue({
      ...response,
      text: JSON.stringify({ score: 3, comment: `Name: PRIVATE_CLASSROOM_TEXT\n${feedback}` }),
    });
    expect(await (await POST(request({ question, userAnswer, points }))).json()).toMatchObject({
      score: 3, comment: `[redacted]\n${feedback}`,
    });
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
    const pending = quizViewStateFromAttempt({ sessionId: 'attempt-1', status: 'active', phase: 'submitted', answers }, questions);
    expect(pending).toEqual({ phase: 'grading_pending', answers, results: [] });
    expect(await gradeQuizForReview(questions, pending.answers, 'en-US')).toEqual({ status: 'unavailable' });
    expect(await gradeQuizForReview(questions, pending.answers, 'en-US')).toEqual({
      status: 'graded',
      results: [
        { questionId: 'choice', correct: true, status: 'correct', earned: 1 },
        { questionId: 'short', correct: false, status: 'incorrect', earned: 3, aiComment: feedback },
      ],
    });
    expect(fetchGrade).toHaveBeenCalledTimes(2);
    for (const [url, config] of fetchGrade.mock.calls) {
      expect(url).toBe('/api/quiz-grade');
      expect(JSON.parse(config.body)).toEqual({ question, userAnswer, points, language: 'en-US' });
      expect(config.headers).toEqual({ 'Content-Type': 'application/json' });
    }
    expect(readShortAnswerGrade({ score: NaN, comment: feedback }, points)).toBeNull();
  });

  it.each([undefined, '', '   '])('grades a blank concept answer locally as zero without blocking a choice', async (blank) => {
    const questions: QuizQuestion[] = [
      { id: 'choice', type: 'single', question: 'Pick A', answer: ['A'], points: 1 },
      { id: 'short', type: 'short_answer', question, points },
    ];
    const answers = { choice: 'A', ...(blank === undefined ? {} : { short: blank }) };
    const grader = vi.fn();
    vi.stubGlobal('fetch', grader);
    expect(await gradeQuizForReview(questions, answers, 'en-US', undefined, { allowBlankShortAnswers: true })).toEqual({
      status: 'graded',
      results: [
        { questionId: 'choice', correct: true, status: 'correct', earned: 1 },
        { questionId: 'short', correct: false, status: 'incorrect', earned: 0 },
      ],
    });
    expect(grader).not.toHaveBeenCalled();
  });

  it('keeps ineligible submissions saved and skips grading on submit and hydration', async () => {
    const questions: QuizQuestion[] = [
      { id: 'ordinary', type: 'short_answer', question, points },
      { id: 'second', type: 'short_answer', question, points },
    ];
    const answers = { ordinary: userAnswer, second: 'Student ID: PRIVATE_CLASSROOM_TEXT' };
    const fetchGrade = vi.fn();
    vi.stubGlobal('fetch', fetchGrade);
    expect(await gradeQuizForReview(questions, answers, 'en-US')).toEqual({ status: 'unsupported' });
    const submitted = { sessionId: 'attempt-2', status: 'active', phase: 'submitted', answers } as const;
    expect(quizViewStateFromAttempt(submitted, questions)).toEqual({ phase: 'grading_unsupported', answers, results: [] });
    expect(fetchGrade).not.toHaveBeenCalled();
  });

  it('recognizes a 422 response and sends only redacted classroom text', async () => {
    const questions: QuizQuestion[] = [{ id: 'short', type: 'short_answer', question, points }];
    const answers = { short: `Student ID: PRIVATE_CLASSROOM_TEXT\n${userAnswer}` };
    const fetchGrade = vi.fn().mockResolvedValue(new Response(null, { status: 422 }));
    vi.stubGlobal('fetch', fetchGrade);
    expect(await gradeQuizForReview(questions, answers, 'en-US')).toEqual({ status: 'unsupported' });
    expect(JSON.parse(fetchGrade.mock.calls[0][1].body).userAnswer).toBe(`[redacted]\n${userAnswer}`);
    expect(answers.short).toContain('PRIVATE_CLASSROOM_TEXT');
  });
});
