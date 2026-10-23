import type { Lesson, LessonArtifact } from '@/lib/types/lesson';
import type { PPTElement, SlideBackground } from '@openmaic/dsl';
import { coursewareSlideDataSchema, type CoursewareSlideData } from '@/lib/courseware/schema';
import { compileCoursewareSlide } from '@/lib/courseware/compiler';
import { applyCoursewareCanvasEdits } from '@/lib/courseware/edits';

export type StudioLesson = Lesson & { __aiseceduRevision: number };
export type EditScope = { pageIds: string[]; elementId?: string };
export type Patch = { path: string; value: unknown };
export type PageProposal = { pageId: string; summary: string; changes: Patch[] };
export type NativeContent = {
  elements: PPTElement[];
  background?: SlideBackground;
  studio?: CoursewareSlideData;
  speakerNotes?: string;
  remark?: string;
  [key: string]: unknown;
};
export type Revision = { revision: number; instruction: string; created: string };
export type StudioInfo = {
  lesson: StudioLesson;
  revisions: Revision[];
  status: string;
  sourceRefs: unknown[];
  ownerId: number;
  canPublish: boolean;
};
export type AgentRun = {
  id: string;
  lessonId: string;
  ownerId: number;
  requestId: string;
  instruction: string;
  scope: EditScope;
  baseRevision: number;
  baseDigest: string;
  status: 'running' | 'ready' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  messages: string[];
  proposals: PageProposal[];
  error?: string;
  model?: string;
  processed: number;
  total: number;
};

export function contentOf(page: LessonArtifact): NativeContent {
  return page.content as unknown as NativeContent;
}
export function studioOf(page: LessonArtifact): CoursewareSlideData | undefined {
  const studio = contentOf(page).studio;
  return studio?.page?.schema === 'courseware-page-v2' ? studio : undefined;
}
export function nativeOf(page: LessonArtifact) {
  const content = contentOf(page),
    studio = studioOf(page);
  if (studio) {
    const compiled = compileCoursewareSlide(studio, studio.page.beats.length - 1);
    return applyCoursewareCanvasEdits(
      studio,
      compiled,
      Array.isArray(content.elements) ? content : undefined,
    );
  }
  return { elements: content.elements || [], background: content.background };
}
export function notesOf(page: LessonArtifact): string {
  return (
    studioOf(page)?.page.speakerNotes ||
    contentOf(page).speakerNotes ||
    contentOf(page).remark ||
    ''
  );
}
export function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}
export function textHtml(text: string): string {
  return (
    '<p>' +
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('\n')
      .join('</p><p>') +
    '</p>'
  );
}
export function ordered(lesson: Lesson): LessonArtifact[] {
  return [...lesson.artifacts].sort((a, b) => a.order - b.order);
}
export function documentKey(lesson: Lesson): string {
  return JSON.stringify({ title: lesson.title, artifacts: lesson.artifacts });
}
export function updatePage(
  lesson: StudioLesson,
  id: string,
  update: (page: LessonArtifact) => LessonArtifact,
): StudioLesson {
  return {
    ...lesson,
    artifacts: lesson.artifacts.map((p) => (p.id === id ? update(structuredClone(p)) : p)),
  };
}
export function setNativeElement(
  page: LessonArtifact,
  id: string,
  fields: Record<string, unknown>,
): LessonArtifact {
  const native = nativeOf(page);
  const next = {
    ...contentOf(page),
    ...native,
    elements: native.elements.map((e) => {
      if (e.id !== id) return e;
      const patched = { ...e, ...fields };
      if (e.type === 'text' && typeof e.content === 'string' && !('content' in fields)) {
        let html = e.content;
        if (typeof fields.defaultFontSize === 'number')
          html = html.replace(
            /font-size\s*:\s*[\d.]+px/gi,
            `font-size:${fields.defaultFontSize}px`,
          );
        if (typeof fields.defaultColor === 'string')
          html = html.replace(/(^|[;"'])color\s*:\s*[^;"']+/gi, `$1color:${fields.defaultColor}`);
        Object.assign(patched, { content: html });
      }
      return patched;
    }),
  };
  return { ...page, content: next as unknown as LessonArtifact['content'] };
}
export function updateStudio(page: LessonArtifact, studio: CoursewareSlideData): LessonArtifact {
  const old = studioOf(page);
  const native = old
    ? applyCoursewareCanvasEdits(
        old,
        compileCoursewareSlide(studio, studio.page.beats.length - 1),
        contentOf(page),
      )
    : compileCoursewareSlide(studio);
  return {
    ...page,
    title: studio.page.title,
    content: {
      ...contentOf(page),
      studio,
      elements: native.elements,
      background: native.background,
      speakerNotes: studio.page.speakerNotes,
    } as unknown as LessonArtifact['content'],
  };
}

const banned = new Set(['__proto__', 'constructor', 'prototype']);
const elementFields = new Set([
  'content',
  'left',
  'top',
  'width',
  'height',
  'rotate',
  'opacity',
  'defaultFontSize',
  'defaultColor',
  'defaultFontName',
  'fill',
  'outline',
  'shadow',
  'bold',
  'align',
  'lineHeight',
  'wordSpace',
  'vertical',
]);
function pathParts(path: string): string[] {
  if (!path.startsWith('/') || path.length > 300) throw new Error('修改路径无效');
  const parts = path
    .slice(1)
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (parts.some((p) => !p || banned.has(p))) throw new Error('修改路径不安全');
  return parts;
}
function assign(target: Record<string, unknown>, parts: string[], value: unknown) {
  let obj = target;
  for (const part of parts.slice(0, -1)) {
    if (!Object.hasOwn(obj, part) || !obj[part] || typeof obj[part] !== 'object')
      throw new Error('修改目标已不存在');
    obj = obj[part] as Record<string, unknown>;
  }
  obj[parts.at(-1)!] = structuredClone(value);
}
function safeValue(value: unknown) {
  const text = JSON.stringify(value);
  if (!text || text.length > 100000) throw new Error('单项修改过大');
  if (
    /<\s*\/?\s*(script|iframe|object|embed|style|link|svg|math|img)|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:|url\s*\(/i.test(
      text,
    )
  )
    throw new Error('修改包含不支持的可执行内容');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('数值无效');
}
export function applyProposal(
  lesson: StudioLesson,
  proposal: PageProposal,
  scope: EditScope,
): StudioLesson {
  if (!scope.pageIds.includes(proposal.pageId)) throw new Error('Agent 超出了指定的页面范围');
  if (!Array.isArray(proposal.changes) || !proposal.changes.length || proposal.changes.length > 100)
    throw new Error('修改建议格式无效');
  const source = lesson.artifacts.find((p) => p.id === proposal.pageId);
  if (!source || source.type !== 'slide') throw new Error('课件页不存在');
  let page = structuredClone(source);
  let semantic = false;
  for (const change of proposal.changes) {
    const parts = pathParts(change.path);
    safeValue(change.value);
    const native =
      parts[0] === 'elements' &&
      /^\d+$/.test(parts[1] || '') &&
      elementFields.has(parts[2]) &&
      parts.length >= 3;
    const semanticPath =
      parts[0] === 'studio' && ['page', 'theme'].includes(parts[1]) && parts.length >= 3;
    if (scope.elementId) {
      if (!native || nativeOf(source).elements[Number(parts[1])]?.id !== scope.elementId)
        throw new Error('Agent 超出了选中对象范围');
    }
    if (native) {
      if (!Array.isArray(contentOf(page).elements))
        page = {
          ...page,
          content: {
            ...contentOf(page),
            ...nativeOf(page),
          } as unknown as LessonArtifact['content'],
        };
    } else if (semanticPath) {
      if (
        parts.includes('id') ||
        parts.includes('schema') ||
        parts.includes('evidence') ||
        parts.includes('sourceId')
      )
        throw new Error('不能改写页面标识或资料来源');
      semantic = true;
    } else if (!['speakerNotes', 'remark'].includes(parts[0]) || parts.length !== 1) {
      throw new Error('不支持的修改字段');
    }
    assign(contentOf(page), parts, change.value);
  }
  if (semantic && studioOf(page)) {
    const studio = coursewareSlideDataSchema.parse(studioOf(page));
    page = updateStudio(
      {
        ...page,
        content: {
          ...contentOf(page),
          studio: studioOf(source),
        } as unknown as LessonArtifact['content'],
      },
      studio,
    );
  }
  validatePage(page);
  return updatePage(lesson, page.id, () => page);
}

export function validatePage(page: LessonArtifact) {
  if (
    page.type !== 'slide' ||
    !page.id ||
    typeof page.title !== 'string' ||
    page.title.length > 240
  )
    throw new Error('课件页无效');
  const studio = studioOf(page);
  if (studio) coursewareSlideDataSchema.parse(studio);
  const elements = contentOf(page).elements;
  if (!Array.isArray(elements) || elements.length > 600) throw new Error('课件元素无效');
  if (new Set(elements.map((e) => e.id)).size !== elements.length)
    throw new Error('课件元素标识重复');
  for (const element of elements) {
    if (typeof element.id !== 'string' || !element.id) throw new Error('课件元素缺少标识');
    if (
      ![element.left, element.top, element.width].every(
        (n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 20000,
      )
    )
      throw new Error('课件元素位置无效');
    if ('content' in element && typeof element.content === 'string') safeValue(element.content);
  }
}
export function validateDocument(lesson: StudioLesson, source: StudioLesson) {
  if (lesson.id !== source.id || lesson.__aiseceduRevision !== source.__aiseceduRevision)
    throw new Error('课件版本已改变，请重新载入');
  if (typeof lesson.title !== 'string' || !lesson.title.trim() || lesson.title.length > 240)
    throw new Error('课件名称必须为 1–240 字');
  if (!Array.isArray(lesson.artifacts) || !lesson.artifacts.length || lesson.artifacts.length > 200)
    throw new Error('课件需要 1–200 页');
  if (new Set(lesson.artifacts.map((p) => p.id)).size !== lesson.artifacts.length)
    throw new Error('页面标识重复');
  if (JSON.stringify(lesson).length > 8 * 1024 * 1024) throw new Error('课件超过保存大小限制');
  lesson.artifacts.forEach(validatePage);
}

export type DocumentHistory = {
  past: StudioLesson[];
  present: StudioLesson;
  future: StudioLesson[];
};
export function historyChange(state: DocumentHistory, next: StudioLesson): DocumentHistory {
  if (documentKey(next) === documentKey(state.present)) return state;
  return { past: [...state.past, state.present].slice(-40), present: next, future: [] };
}
export function historyMove(state: DocumentHistory, direction: 'undo' | 'redo'): DocumentHistory {
  if (direction === 'undo' && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1)!,
      future: [state.present, ...state.future],
    };
  if (direction === 'redo' && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
