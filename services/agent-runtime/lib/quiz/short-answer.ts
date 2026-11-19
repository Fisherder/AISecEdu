import type { QuizQuestion } from '@/lib/types/stage';
import { gradeChoiceQuestions, isShortAnswer, type QuestionResult } from './grading';

export interface ShortAnswerGrade {
  score: number;
  comment: string;
}

export function readShortAnswerGrade(value: unknown, points: number): ShortAnswerGrade | null {
  if (!Number.isFinite(points) || points <= 0 || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { score, comment } = value as Record<string, unknown>;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > points
      || typeof comment !== 'string' || !comment.trim() || comment.length > 500) {
    return null;
  }
  return { score, comment: comment.trim() };
}

async function gradeShortAnswer(
  question: QuizQuestion,
  answer: string,
  language: string,
  signal?: AbortSignal,
): Promise<QuestionResult | null> {
  const points = question.points ?? 1;
  try {
    const response = await fetch('/api/quiz-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.question, userAnswer: answer, points, language }),
      signal,
    });
    if (!response.ok) return null;
    const grade = readShortAnswerGrade(await response.json(), points);
    if (!grade) return null;
    const correct = grade.score >= points * 0.8;
    return {
      questionId: question.id,
      correct,
      status: correct ? 'correct' : 'incorrect',
      earned: grade.score,
      aiComment: grade.comment,
    };
  } catch {
    return null;
  }
}

export async function gradeQuizForReview(
  questions: QuizQuestion[],
  answers: Record<string, string | string[]>,
  language: string,
  signal?: AbortSignal,
): Promise<QuestionResult[] | null> {
  const maxima = questions.map((question) => question.points ?? 1);
  if (maxima.some((points) => !Number.isFinite(points) || points <= 0)
      || !Number.isFinite(maxima.reduce((sum, points) => sum + points, 0))) return null;
  const results = new Map(gradeChoiceQuestions(questions, answers).map((result) => [result.questionId, result]));
  const graded = await Promise.all(questions.filter(isShortAnswer).map((question) => {
    const answer = answers[question.id];
    return typeof answer === 'string' ? gradeShortAnswer(question, answer, language, signal) : null;
  }));
  for (const grade of graded) {
    if (!grade) return null;
    results.set(grade.questionId, grade);
  }
  return questions.map((question) => results.get(question.id)!);
}
