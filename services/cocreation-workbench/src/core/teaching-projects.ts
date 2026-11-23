import type { Artifact, WorkspaceState } from './types';

export const teachingProjects = [
  { title: '平台教案', subtitle: '比较候选，生成平台成品', prompt: '请生成普通教案候选：' },
  { title: '课堂辩论', subtitle: '设计辩题、立场与流程', prompt: '请生成普通课堂辩论候选方案：' },
  { title: '交互课件', subtitle: '生成可演示、可编辑的课件', prompt: '请制作可以分步演示的交互课件：' },
];

export function isGeneratedCourseware(artifact: Artifact) {
  return artifact.type === 'slide-deck' &&
    artifact.revision?.content?.ordinaryCourseware === 'teaching-courseware-v1';
}

export function canStartTeachingProject({ context, thread }: Pick<WorkspaceState, 'context' | 'thread'>) {
  const courses: number[] = context.ordinaryProjectCourseIds || [];
  return thread?.dojoId == null ? courses.length === 1 : courses.includes(thread.dojoId);
}

export function teachingProjectDraft(prefix: string, draft: string) {
  const current = draft.trim();
  const selected = teachingProjects.find(({ prompt }) => current.startsWith(prompt));
  return prefix + (selected ? current.slice(selected.prompt.length) : current);
}

export function displayTeachingReply(text: string) {
  return text.replace(/(^|[。！？\n]\s*)当前(?:我|这条对话)只支持文字问答[。.]?(?=\s*(?:$|\n))/gu,
    (_match, boundary: string) => boundary.trimEnd()).trimEnd();
}
