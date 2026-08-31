import {
  buildLearnerInsight,
  type LearnerInsight,
  type LearningProgressSnapshot,
} from '@/lib/security/learning-analytics';
import { getDb, type Queryable } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { progressRowToSnapshot, readClassroomForAnalytics } from '@/lib/server/learning-dashboard';

export interface LearnerEvidenceEntry {
  lessonId: string;
  classroomId: string;
  title: string;
  origin: 'course' | 'self-study';
  snapshot: LearningProgressSnapshot;
}

export interface StudentLearningContext {
  entries: LearnerEvidenceEntry[];
  insight: LearnerInsight;
  evidenceEventCount: number;
}

interface LessonEvidenceRow extends Record<string, unknown> {
  lesson_id: string;
  classroom_id: string;
  title: string;
  origin: 'course' | 'self-study';
}

/** Load only evidence that belongs to an enrolled course or the learner's own package. */
export async function loadStudentLearningContext(
  learnerKey: string,
  providedDb?: Queryable,
): Promise<StudentLearningContext> {
  const db = providedDb ?? (await getDb());
  await ensureAppSchema(db);
  const [courseRows, selfStudyRows, progressRows, eventRows] = await Promise.all([
    db.query(
      `SELECT DISTINCT l.id AS lesson_id, l.published_classroom_id AS classroom_id, l.title, 'course' AS origin
       FROM course_enrollments ce
       JOIN course_lessons cl ON cl.course_id = ce.course_id
       JOIN app_lessons l ON l.id = cl.lesson_id
       WHERE ce.learner_key = $1 AND l.published_classroom_id IS NOT NULL`,
      [learnerKey],
    ),
    db.query(
      `SELECT lesson_id, classroom_id, title, 'self-study' AS origin
       FROM self_study_sessions
       WHERE learner_key = $1 AND status = 'ready' AND classroom_id IS NOT NULL AND lesson_id IS NOT NULL`,
      [learnerKey],
    ),
    db.query('SELECT * FROM student_progress WHERE learner_key = $1', [learnerKey]),
    db.query('SELECT COUNT(*) AS event_count FROM learning_events WHERE learner_key = $1', [
      learnerKey,
    ]),
  ]);

  const unique = new Map<string, LessonEvidenceRow>();
  for (const row of [...courseRows.rows, ...selfStudyRows.rows] as LessonEvidenceRow[]) {
    if (!row.classroom_id || unique.has(row.classroom_id)) continue;
    unique.set(row.classroom_id, row);
  }
  const progressByClassroom = new Map(
    progressRows.rows.map((row) => [row.classroom_id as string, row]),
  );
  const entries = await Promise.all(
    [...unique.values()].map(async (row) => {
      const classroom = await readClassroomForAnalytics(row.classroom_id);
      return {
        lessonId: row.lesson_id,
        classroomId: row.classroom_id,
        title: row.title,
        origin: row.origin,
        snapshot: progressRowToSnapshot({
          classroomId: row.classroom_id,
          lessonId: row.lesson_id,
          classroom,
          row: progressByClassroom.get(row.classroom_id),
        }),
      } satisfies LearnerEvidenceEntry;
    }),
  );

  return {
    entries,
    insight: buildLearnerInsight(entries.map((entry) => entry.snapshot)),
    evidenceEventCount: Number(eventRows.rows[0]?.event_count ?? 0),
  };
}
