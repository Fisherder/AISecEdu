import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { evaluateLearningTask, normalizeTaskCompletionRule } from '@/lib/server/learning-tasks';
import { readClassroomForAnalytics } from '@/lib/server/learning-dashboard';
import { ensureAppSchema } from '@/lib/server/schema';

/** GET /api/student/tasks — active assignments from enrolled courses. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student')
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');
  const db = await getDb();
  await ensureAppSchema(db);
  const result = await db.query(
    `SELECT t.*, c.title AS course_title, l.title AS lesson_title,
            sp.completed_scenes, sp.quiz_scores, sp.updated_at AS progress_updated_at,
            a.started_at, a.completed_at, a.last_checked_at
     FROM learning_tasks t
     JOIN course_enrollments ce ON ce.course_id = t.course_id AND ce.learner_key = $1
     JOIN app_courses c ON c.id = t.course_id
     LEFT JOIN app_lessons l ON l.id = t.lesson_id
     LEFT JOIN student_progress sp ON sp.classroom_id = t.classroom_id AND sp.learner_key = $1
     LEFT JOIN learning_task_attempts a ON a.task_id = t.id AND a.learner_key = $1
     WHERE t.status = 'active'
     ORDER BY CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at, t.created_at DESC`,
    [principal.learnerKey],
  );

  const tasks = await Promise.all(
    result.rows.map(async (row) => {
      const classroom = await readClassroomForAnalytics(row.classroom_id as string);
      const progress = evaluateLearningTask({
        sceneIds: classroom?.scenes.map((scene) => scene.id) ?? [],
        progressRow: {
          completed_scenes: row.completed_scenes,
          quiz_scores: row.quiz_scores,
          updated_at: row.progress_updated_at,
        },
        attemptRow: row,
        rule: row.completion_rule,
        dueAt: typeof row.due_at === 'number' ? row.due_at : null,
      });
      return {
        id: row.id,
        courseId: row.course_id,
        courseTitle: row.course_title,
        lessonId: row.lesson_id,
        lessonTitle: row.lesson_title,
        classroomId: row.classroom_id,
        title: row.title,
        instructions: row.instructions || '',
        dueAt: row.due_at,
        completionRule: normalizeTaskCompletionRule(row.completion_rule),
        createdAt: row.created_at,
        progress,
      };
    }),
  );
  return apiSuccess({
    tasks,
    summary: {
      taskCount: tasks.length,
      pendingCount: tasks.filter((task) => task.progress.state !== 'completed').length,
      completedCount: tasks.filter((task) => task.progress.state === 'completed').length,
      overdueCount: tasks.filter((task) => task.progress.overdue).length,
    },
  });
}
