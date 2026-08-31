import type {
  SceneOutline,
  GeneratedSlideContent,
  GeneratedInteractiveContent,
  GeneratedQuizContent,
} from '@/lib/types/generation';
import type { ValidationReport } from '@/lib/security/validator';
import type { LabSolvabilityReport } from '@/lib/security/lab-solvability';

/**
 * 可独立生成并进入课程编排的教学产物类型。
 *
 * slide/quiz 会发布为原生场景；其余类型发布为 interactive 场景。
 * debate 在发布时还会挂载一组专用的多智能体辩论角色。
 */
export const LESSON_ARTIFACT_TYPES = [
  'slide',
  'quiz',
  'diagram',
  'simulation',
  'code',
  'procedural-skill',
  'game',
  'visualization3d',
  'vulnerable-lab',
  'debate',
] as const;

export type LessonArtifactType = (typeof LESSON_ARTIFACT_TYPES)[number];

export function isLessonArtifactType(value: unknown): value is LessonArtifactType {
  return typeof value === 'string' && (LESSON_ARTIFACT_TYPES as readonly string[]).includes(value);
}

/** 一个产物 = 生成时用的 outline + 生成结果 content。保存 outline 以便重新生成。 */
export interface LessonArtifact {
  id: string;
  type: LessonArtifactType;
  title: string;
  outline: SceneOutline;
  content: GeneratedSlideContent | GeneratedInteractiveContent | GeneratedQuizContent;
  /** 生成后安全内容校验报告（仅含 HTML 的产物有）。 */
  validation?: ValidationReport;
  /** 交互题是否具备可观察线索、有效判题入口和完成反馈。 */
  solvability?: LabSolvabilityReport;
  order: number;
  createdAt: number;
}

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  /** 网安学科画像（沿用 MVP）；为空则通用模式。 */
  subjectProfile?: 'cybersecurity';
  courseId?: string;
  artifacts: LessonArtifact[];
  /** 发布后产生的课堂 id（未发布则空）。 */
  publishedClassroomId?: string;
  createdAt: number;
  updatedAt: number;
}

/** lesson 列表项（轻量，不含 artifact content）。 */
export interface LessonSummary {
  id: string;
  title: string;
  artifactCount: number;
  publishedClassroomId?: string;
  updatedAt: number;
}
