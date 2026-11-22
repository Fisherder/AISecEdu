import { containsRestrictedTeachingSecret } from '@/lib/teaching/ordinary-text';
import type { QuizQuestion } from '@/lib/types/stage';
import { gradeChoiceQuestions, isShortAnswer, type QuestionResult } from './grading';

export const MAX_SHORT_ANSWER_TEXT_LENGTH = 8000;
const PROTECTED_TEXT =
  /\b(?:user[_ -]?id|learner[_ -]?id|student[_ -]?(?:id|number)|candidate[_ -]?id|name|email)\s*[:=]\s*[^\n,;]+|(?:学号|考号|姓名|用户编号)\s*[:：=]\s*[^\n，。；]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu;
const RESTRICTED_TEXT =
  /(?:answer key|reference answer|private solution|hidden answer|exploit payload|exploit chain|reverse shell|reproduce (?:an? |the )?(?:exploit|attack))|(?:标准答案|参考答案|验证答案|私有解法)\s*[:：=]|(?:利用链|攻击复现|复现.{0,8}(?:漏洞|攻击)|执行.{0,8}(?:命令|载荷))|```/iu;

export function containsRestrictedQuizText(value: string): boolean {
  return containsRestrictedTeachingSecret(value) || RESTRICTED_TEXT.test(value);
}

export function redactQuizText(value: string): string {
  return value.replace(PROTECTED_TEXT, '[redacted]');
}

export function prepareShortAnswerText(question: string, answer: string) {
  if (containsRestrictedQuizText(question) || containsRestrictedQuizText(answer)) return null;
  const prepared = {
    question: redactQuizText(question.trim()),
    userAnswer: redactQuizText(answer.trim()),
  };
  return Object.values(prepared).some((value) => !value.replaceAll('[redacted]', '').trim())
    ? null
    : prepared;
}

export interface ShortAnswerGrade {
  score: number;
  comment: string;
}

export function readShortAnswerGrade(value: unknown, points: number): ShortAnswerGrade | null {
  if (
    !Number.isFinite(points) ||
    points <= 0 ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  )
    return null;
  const { score, comment } = value as Record<string, unknown>;
  if (
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    score < 0 ||
    score > points ||
    typeof comment !== 'string' ||
    !comment.trim() ||
    comment.length > 500
  ) {
    return null;
  }
  return { score, comment: comment.trim() };
}

type ShortAnswerInput = {
  questionId: string;
  question: string;
  userAnswer: string;
  points: number;
};
type GradingFailure = { status: 'unsupported' | 'unavailable' };

function prepareQuizShortAnswers(
  questions: QuizQuestion[],
  answers: Record<string, string | string[]>,
) {
  const maxima = questions.map((question) => question.points ?? 1);
  if (
    maxima.some((points) => !Number.isFinite(points) || points <= 0) ||
    !Number.isFinite(maxima.reduce((sum, points) => sum + points, 0))
  )
    return null;
  const shortAnswers: ShortAnswerInput[] = [];
  for (const question of questions.filter(isShortAnswer)) {
    const answer = answers[question.id];
    if (
      typeof answer !== 'string' ||
      typeof question.question !== 'string' ||
      question.question.length > MAX_SHORT_ANSWER_TEXT_LENGTH ||
      answer.length > MAX_SHORT_ANSWER_TEXT_LENGTH
    )
      return null;
    const text = prepareShortAnswerText(question.question, answer);
    if (!text || Object.values(text).some((value) => value.length > MAX_SHORT_ANSWER_TEXT_LENGTH))
      return null;
    shortAnswers.push({ ...text, questionId: question.id, points: question.points ?? 1 });
  }
  return shortAnswers;
}

export function isQuizGradingUnsupported(
  questions: QuizQuestion[],
  answers: Record<string, string | string[]>,
) {
  return prepareQuizShortAnswers(questions, answers) === null;
}

async function gradeShortAnswer(
  { questionId, question, userAnswer, points }: ShortAnswerInput,
  language: string,
  signal?: AbortSignal,
): Promise<{ status: 'graded'; result: QuestionResult } | GradingFailure> {
  try {
    const response = await fetch('/api/quiz-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, userAnswer, points, language }),
      signal,
    });
    if (!response.ok) {
      return { status: response.status === 422 ? 'unsupported' : 'unavailable' };
    }
    const grade = readShortAnswerGrade(await response.json(), points);
    if (!grade) return { status: 'unavailable' };
    const correct = grade.score >= points * 0.8;
    return {
      status: 'graded',
      result: {
        questionId,
        correct,
        status: correct ? 'correct' : 'incorrect',
        earned: grade.score,
        aiComment: grade.comment,
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function gradeQuizForReview(
  questions: QuizQuestion[],
  answers: Record<string, string | string[]>,
  language: string,
  signal?: AbortSignal,
): Promise<{ status: 'graded'; results: QuestionResult[] } | GradingFailure> {
  const shortAnswers = prepareQuizShortAnswers(questions, answers);
  if (!shortAnswers) return { status: 'unsupported' };
  const results = new Map(
    gradeChoiceQuestions(questions, answers).map((result) => [result.questionId, result]),
  );
  const graded = await Promise.all(
    shortAnswers.map((answer) => gradeShortAnswer(answer, language, signal)),
  );
  if (graded.some(({ status }) => status === 'unsupported')) return { status: 'unsupported' };
  for (const grade of graded) {
    if (grade.status !== 'graded') return grade;
    results.set(grade.result.questionId, grade.result);
  }
  return { status: 'graded', results: questions.map((question) => results.get(question.id)!) };
}
