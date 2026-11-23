import { FileText, Layers, Presentation, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { Artifact, WorkspaceState } from './types';

export const teachingProjects: ReadonlyArray<{
  title: string;
  subtitle: string;
  prompt: string;
  icon: LucideIcon;
}> = [
  { title: '平台教案', icon: FileText, subtitle: '比较候选，生成平台成品', prompt: '请生成普通教案候选：' },
  { title: '课堂辩论', icon: Layers, subtitle: '设计辩题、立场与流程', prompt: '请生成普通课堂辩论候选方案：' },
  { title: '制作课件', icon: Presentation, subtitle: '生成可编辑的原生幻灯片', prompt: '请制作一份课件：' },
  { title: '动态仿真', icon: SlidersHorizontal, subtitle: '设计可调节、可比较的模拟', prompt: '请制作一个动态仿真：' },
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
