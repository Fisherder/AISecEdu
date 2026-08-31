import type { LessonArtifactType } from '@/lib/types/lesson';

export type TeachingPlanSource = 'ai' | 'fallback';

export interface TeachingPlanInput {
  topic: string;
  description?: string;
  courseId?: string;
}

export interface TeachingPlanItem {
  /** Stable within one planning result; used by the review UI. */
  id: string;
  type: LessonArtifactType;
  title: string;
  purpose: string;
  /** A teacher-facing explanation of why the planner selected this medium. */
  reason: string;
  keyPoints: string[];
  estimatedMinutes: number;
  quality: 'fast' | 'rich';
}

export interface TeachingPackagePlan {
  title: string;
  summary: string;
  audience: string;
  learningObjectives: string[];
  /** Explanation of the package-level sequencing and modality choices. */
  decisionSummary: string;
  safetyNotes: string[];
  totalMinutes: number;
  items: TeachingPlanItem[];
  source: TeachingPlanSource;
}
