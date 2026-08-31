import sanitizeHtml from 'sanitize-html';
import type { PPTElement, PPTTextElement, QuizQuestion } from '@openmaic/dsl';
import type { GeneratedQuizContent, GeneratedSlideContent } from '@/lib/types/generation';
import type { LessonArtifact } from '@/lib/types/lesson';

const MAX_TITLE_LENGTH = 160;
const MAX_CONTENT_BYTES = 2_000_000;
const MAX_SLIDE_ELEMENTS = 300;
const MAX_QUESTIONS = 100;
const MAX_OPTIONS = 26;
const MAX_TEXT_LENGTH = 100_000;

const SAFE_STYLE_VALUE =
  /^(?!.*(?:\\|\/\*|@|url\s*\(|expression\s*\(|javascript\s*:|data\s*:|[{}]))[\s\S]+$/i;

const SAFE_RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'div',
    'br',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'sub',
    'sup',
    'code',
    'pre',
    'blockquote',
    'ul',
    'ol',
    'li',
    'a',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel', 'style'],
    div: ['style'],
    p: ['style'],
    span: ['style'],
    ol: ['start', 'reversed', 'type', 'style'],
    ul: ['style'],
    li: ['value', 'style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      color: [SAFE_STYLE_VALUE],
      'background-color': [SAFE_STYLE_VALUE],
      'font-family': [SAFE_STYLE_VALUE],
      'font-size': [SAFE_STYLE_VALUE],
      'font-weight': [SAFE_STYLE_VALUE],
      'font-style': [SAFE_STYLE_VALUE],
      'text-decoration': [SAFE_STYLE_VALUE],
      'text-align': [SAFE_STYLE_VALUE],
      'line-height': [SAFE_STYLE_VALUE],
      'letter-spacing': [SAFE_STYLE_VALUE],
    },
  },
};

type UpdateSuccess = { ok: true; artifact: LessonArtifact };
type UpdateFailure = { ok: false; error: string };
export type LessonArtifactUpdateResult = UpdateSuccess | UpdateFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validBoundedString(value: unknown, max = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.length <= max;
}

function serializedSize(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return null;
  }
}

function normalizeSlideContent(value: unknown): GeneratedSlideContent | UpdateFailure {
  if (!isRecord(value) || !Array.isArray(value.elements)) {
    return { ok: false, error: 'Slide content must contain an elements array' };
  }
  if (value.elements.length > MAX_SLIDE_ELEMENTS) {
    return { ok: false, error: `Slide cannot contain more than ${MAX_SLIDE_ELEMENTS} elements` };
  }
  if (value.remark !== undefined && !validBoundedString(value.remark, 20_000)) {
    return { ok: false, error: 'Slide remark is invalid or too long' };
  }

  const elements: PPTElement[] = [];
  for (const rawElement of value.elements) {
    if (
      !isRecord(rawElement) ||
      !validBoundedString(rawElement.id, 200) ||
      !validBoundedString(rawElement.type, 80)
    ) {
      return { ok: false, error: 'Slide contains an invalid element' };
    }
    const element = structuredClone(rawElement);
    if (element.type === 'text') {
      if (!validBoundedString(element.content)) {
        return { ok: false, error: 'Slide contains invalid or oversized rich text' };
      }
      element.content = sanitizeHtml(element.content, SAFE_RICH_TEXT_OPTIONS);
    }
    elements.push(element as unknown as PPTElement);
  }

  const content: GeneratedSlideContent = {
    elements,
    ...(isRecord(value.background)
      ? {
          background: structuredClone(
            value.background,
          ) as unknown as GeneratedSlideContent['background'],
        }
      : {}),
    ...(typeof value.remark === 'string' ? { remark: value.remark } : {}),
  };
  return content;
}

function validateQuizQuestion(rawQuestion: unknown, index: number): string | null {
  if (!isRecord(rawQuestion)) return `Question ${index + 1} is invalid`;
  if (!validBoundedString(rawQuestion.id, 200) || !rawQuestion.id.trim()) {
    return `Question ${index + 1} has no valid id`;
  }
  if (!validBoundedString(rawQuestion.question, 20_000) || !rawQuestion.question.trim()) {
    return `Question ${index + 1} is empty`;
  }
  if (!['single', 'multiple', 'short_answer'].includes(String(rawQuestion.type))) {
    return `Question ${index + 1} has an unsupported type`;
  }
  if (
    rawQuestion.points !== undefined &&
    (typeof rawQuestion.points !== 'number' ||
      !Number.isFinite(rawQuestion.points) ||
      rawQuestion.points < 0 ||
      rawQuestion.points > 10_000)
  ) {
    return `Question ${index + 1} has invalid points`;
  }
  for (const key of ['analysis', 'commentPrompt'] as const) {
    if (rawQuestion[key] !== undefined && !validBoundedString(rawQuestion[key], 20_000)) {
      return `Question ${index + 1} has invalid ${key}`;
    }
  }

  if (rawQuestion.type === 'short_answer') return null;
  if (!Array.isArray(rawQuestion.options) || rawQuestion.options.length < 2) {
    return `Question ${index + 1} needs at least two options`;
  }
  if (rawQuestion.options.length > MAX_OPTIONS) {
    return `Question ${index + 1} cannot have more than ${MAX_OPTIONS} options`;
  }
  const values = new Set<string>();
  for (const option of rawQuestion.options) {
    if (
      !isRecord(option) ||
      !validBoundedString(option.value, 40) ||
      !option.value.trim() ||
      !validBoundedString(option.label, 10_000) ||
      !option.label.trim() ||
      values.has(option.value)
    ) {
      return `Question ${index + 1} contains an invalid option`;
    }
    values.add(option.value);
  }
  if (!Array.isArray(rawQuestion.answer)) {
    return `Question ${index + 1} needs a correct answer`;
  }
  const answers = rawQuestion.answer.filter(
    (answer): answer is string => typeof answer === 'string',
  );
  if (
    answers.length !== rawQuestion.answer.length ||
    answers.some((answer) => !values.has(answer))
  ) {
    return `Question ${index + 1} has an answer that is not one of its options`;
  }
  if (rawQuestion.type === 'single' && answers.length !== 1) {
    return `Question ${index + 1} must have exactly one correct answer`;
  }
  if (rawQuestion.type === 'multiple' && answers.length < 1) {
    return `Question ${index + 1} needs at least one correct answer`;
  }
  return null;
}

function normalizeQuizContent(value: unknown): GeneratedQuizContent | UpdateFailure {
  if (!isRecord(value) || !Array.isArray(value.questions)) {
    return { ok: false, error: 'Quiz content must contain a questions array' };
  }
  if (value.questions.length === 0 || value.questions.length > MAX_QUESTIONS) {
    return { ok: false, error: `Quiz must contain 1-${MAX_QUESTIONS} questions` };
  }
  for (let index = 0; index < value.questions.length; index += 1) {
    const error = validateQuizQuestion(value.questions[index], index);
    if (error) return { ok: false, error };
  }
  return { questions: structuredClone(value.questions) as QuizQuestion[] };
}

/**
 * Apply a teacher-authored structured edit while keeping artifact type and
 * generated-content shape intact. This deliberately supports slide + quiz;
 * interactive HTML continues to use the separately sandboxed AI-edit route.
 */
export function applyLessonArtifactUpdate(
  artifact: LessonArtifact,
  input: unknown,
): LessonArtifactUpdateResult {
  if (!isRecord(input)) return { ok: false, error: 'Invalid update payload' };
  if (input.title === undefined && input.content === undefined) {
    return { ok: false, error: 'Nothing to update' };
  }

  const next = structuredClone(artifact);
  if (input.title !== undefined) {
    if (!validBoundedString(input.title, MAX_TITLE_LENGTH) || !input.title.trim()) {
      return { ok: false, error: `Title must be 1-${MAX_TITLE_LENGTH} characters` };
    }
    next.title = input.title.trim();
    next.outline = { ...next.outline, title: next.title };
  }

  if (input.content !== undefined) {
    const size = serializedSize(input.content);
    if (size === null || size > MAX_CONTENT_BYTES) {
      return { ok: false, error: 'Artifact content is invalid or too large' };
    }
    if (next.type === 'slide') {
      const normalized = normalizeSlideContent(input.content);
      if ('ok' in normalized) return normalized;
      next.content = normalized;
    } else if (next.type === 'quiz') {
      const normalized = normalizeQuizContent(input.content);
      if ('ok' in normalized) return normalized;
      next.content = normalized;
    } else {
      return {
        ok: false,
        error: 'Structured editing is only available for slide and quiz artifacts',
      };
    }
  }

  return { ok: true, artifact: next };
}

export function isEditableSlideTextElement(element: PPTElement): element is PPTTextElement {
  return element.type === 'text';
}
