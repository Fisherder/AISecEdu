import { readClassroom } from '@/lib/server/classroom-storage';
import { pgReadClassroom } from '@/lib/server/stores/pg-classroom-store';
import {
  safeQuizScores,
  safeStringArray,
  type AnalyticsScene,
  type LearningProgressSnapshot,
} from '@/lib/security/learning-analytics';
import type { PersistedClassroomData } from '@/lib/server/classroom-storage';

/** File is the portable classroom artifact; PG is the control-plane projection. */
export async function readClassroomForAnalytics(id: string): Promise<PersistedClassroomData | null> {
  return (await readClassroom(id)) ?? pgReadClassroom(id);
}

export function classroomScenesForAnalytics(classroom: PersistedClassroomData | null): AnalyticsScene[] {
  if (!classroom) return [];
  return classroom.scenes.map((scene) => ({
    id: scene.id,
    title: scene.title,
    type: scene.type,
  }));
}

export function progressRowToSnapshot(args: {
  classroomId: string;
  lessonId?: string;
  classroom: PersistedClassroomData | null;
  row?: Record<string, unknown> | null;
}): LearningProgressSnapshot {
  const scenes = classroomScenesForAnalytics(args.classroom);
  return {
    classroomId: args.classroomId,
    ...(args.lessonId ? { lessonId: args.lessonId } : {}),
    totalScenes: scenes.length,
    scenes,
    completedSceneIds: safeStringArray(args.row?.completed_scenes),
    quizScores: safeQuizScores(args.row?.quiz_scores),
    ...(typeof args.row?.updated_at === 'number' ? { updatedAt: args.row.updated_at } : {}),
  };
}
