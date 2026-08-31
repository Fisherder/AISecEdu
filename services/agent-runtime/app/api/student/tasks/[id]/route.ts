import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { evaluateLearningTask, taskEvidenceSnapshot } from '@/lib/server/learning-tasks';
import { readClassroomForAnalytics } from '@/lib/server/learning-dashboard';
import { ensureAppSchema } from '@/lib/server/schema';

type Ctx = { params: Promise<{ id: string }> };

/** POST starts an assignment or synchronizes its evidence-derived state. */
export async function POST(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student')
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');
  const db = await getDb();
  await ensureAppSchema(db);
  const taskResult = await db.query(
    `SELECT t.*
     FROM learning_tasks t
     JOIN course_enrollments ce ON ce.course_id = t.course_id
     WHERE t.id = $1 AND t.status = 'active' AND ce.learner_key = $2`,
    [id, principal.learnerKey],
  );
  const task = taskResult.rows[0];
  if (!task) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Task not found');
  const [progressResult, attemptResult, classroom] = await Promise.all([
    db.query('SELECT * FROM student_progress WHERE classroom_id = $1 AND learner_key = $2', [
      task.classroom_id,
      principal.learnerKey,
    ]),
    db.query('SELECT * FROM learning_task_attempts WHERE task_id = $1 AND learner_key = $2', [
      id,
      principal.learnerKey,
    ]),
    readClassroomForAnalytics(task.classroom_id as string),
  ]);
  const now = Date.now();
  const existingAttempt = attemptResult.rows[0];
  const progress = evaluateLearningTask({
    sceneIds: classroom?.scenes.map((scene) => scene.id) ?? [],
    progressRow: progressResult.rows[0],
    attemptRow: existingAttempt ?? { started_at: now },
    rule: task.completion_rule,
    dueAt: typeof task.due_at === 'number' ? task.due_at : null,
    now,
  });
  const startedAt =
    typeof existingAttempt?.started_at === 'number' ? existingAttempt.started_at : now;
  await db.query(
    `INSERT INTO learning_task_attempts
       (task_id, learner_key, started_at, completed_at, last_checked_at, evidence)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (task_id, learner_key) DO UPDATE SET
       started_at = COALESCE(learning_task_attempts.started_at, $3),
       completed_at = COALESCE(learning_task_attempts.completed_at, $4),
       last_checked_at = $5,
       evidence = $6`,
    [
      id,
      principal.learnerKey,
      startedAt,
      progress.completedAt,
      now,
      JSON.stringify(taskEvidenceSnapshot(progress)),
    ],
  );
  return apiSuccess({
    taskId: id,
    classroomId: task.classroom_id,
    progress: { ...progress, startedAt },
  });
}
