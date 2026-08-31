import { nanoid } from 'nanoid';
import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { evaluateLearningTask, normalizeTaskCompletionRule } from '@/lib/server/learning-tasks';
import { readClassroomForAnalytics } from '@/lib/server/learning-dashboard';
import { ensureAppSchema } from '@/lib/server/schema';

function optionalTimestamp(value: unknown): number | null {
  if (value == null || value === '') return null;
  const timestamp = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function teacherRequired(principal: Awaited<ReturnType<typeof resolvePrincipal>>) {
  return principal && (principal.role === 'teacher' || principal.role === 'admin');
}

/** GET /api/teacher/tasks?courseId=... — assignments plus per-student evidence state. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!teacherRequired(principal))
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');

  const courseId = req.nextUrl.searchParams.get('courseId')?.trim() || null;
  const db = await getDb();
  await ensureAppSchema(db);
  const tasksResult = await db.query(
    `SELECT t.*, c.title AS course_title, l.title AS lesson_title
     FROM learning_tasks t
     JOIN app_courses c ON c.id = t.course_id
     LEFT JOIN app_lessons l ON l.id = t.lesson_id
     WHERE t.owner_key = $1 AND ($2::text IS NULL OR t.course_id = $2)
     ORDER BY t.created_at DESC`,
    [principal.learnerKey, courseId],
  );

  const rosterResult = await db.query(
    `SELECT t.id AS task_id, ce.learner_key, ce.enrolled_at, u.username, u.display_name,
            sp.completed_scenes, sp.quiz_scores, sp.updated_at,
            a.started_at, a.completed_at, a.last_checked_at
     FROM learning_tasks t
     JOIN course_enrollments ce ON ce.course_id = t.course_id
     LEFT JOIN users u ON ce.learner_key = ('acct:' || u.id)
     LEFT JOIN student_progress sp
       ON sp.classroom_id = t.classroom_id AND sp.learner_key = ce.learner_key
     LEFT JOIN learning_task_attempts a
       ON a.task_id = t.id AND a.learner_key = ce.learner_key
     WHERE t.owner_key = $1 AND ($2::text IS NULL OR t.course_id = $2)
     ORDER BY ce.enrolled_at`,
    [principal.learnerKey, courseId],
  );
  const rosterByTask = new Map<string, Record<string, unknown>[]>();
  for (const row of rosterResult.rows) {
    const key = row.task_id as string;
    const current = rosterByTask.get(key) ?? [];
    current.push(row);
    rosterByTask.set(key, current);
  }

  const tasks = await Promise.all(
    tasksResult.rows.map(async (row) => {
      const classroom = await readClassroomForAnalytics(row.classroom_id as string);
      const sceneIds = classroom?.scenes.map((scene) => scene.id) ?? [];
      const students = (rosterByTask.get(row.id as string) ?? []).map((student) => {
        const progress = evaluateLearningTask({
          sceneIds,
          progressRow: student,
          attemptRow: student,
          rule: row.completion_rule,
          dueAt: optionalTimestamp(row.due_at),
        });
        return {
          learnerKey: student.learner_key,
          username: student.username,
          displayName:
            student.display_name ||
            student.username ||
            String(student.learner_key).replace('acct:', '学生 '),
          enrolledAt: student.enrolled_at,
          progress,
        };
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
        dueAt: optionalTimestamp(row.due_at),
        status: row.status,
        completionRule: normalizeTaskCompletionRule(row.completion_rule),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        summary: {
          learnerCount: students.length,
          notStartedCount: students.filter((item) => item.progress.state === 'not-started').length,
          inProgressCount: students.filter((item) => item.progress.state === 'in-progress').length,
          completedCount: students.filter((item) => item.progress.state === 'completed').length,
          overdueCount: students.filter((item) => item.progress.overdue).length,
        },
        students,
      };
    }),
  );

  return apiSuccess({ tasks });
}

/** POST /api/teacher/tasks — assign one published course lesson to the cohort. */
export async function POST(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!teacherRequired(principal))
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const body = await req.json().catch(() => ({}));
  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
  const lessonId = typeof body.lessonId === 'string' ? body.lessonId.trim() : '';
  if (!courseId || !lessonId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: courseId or lessonId');
  }

  const db = await getDb();
  await ensureAppSchema(db);
  const lessonResult = await db.query(
    `SELECT l.id, l.title, l.published_classroom_id
     FROM app_courses c
     JOIN course_lessons cl ON cl.course_id = c.id
     JOIN app_lessons l ON l.id = cl.lesson_id
     WHERE c.id = $1 AND c.owner_key = $2 AND l.id = $3`,
    [courseId, principal.learnerKey, lessonId],
  );
  const lesson = lessonResult.rows[0];
  if (!lesson) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course lesson not found');
  if (!lesson.published_classroom_id) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Publish the lesson before assigning it');
  }

  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : (lesson.title as string);
  const instructions =
    typeof body.instructions === 'string' ? body.instructions.trim().slice(0, 2000) : '';
  const dueAt = optionalTimestamp(body.dueAt);
  if (body.dueAt != null && body.dueAt !== '' && dueAt == null) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid dueAt');
  }
  const completionRule = normalizeTaskCompletionRule({
    requireAllScenes: true,
    minQuizScore: body.minQuizScore,
  });
  const id = `task_${nanoid(12)}`;
  const now = Date.now();
  await db.query(
    `INSERT INTO learning_tasks
       (id, owner_key, course_id, lesson_id, classroom_id, title, instructions, due_at, completion_rule, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$10)`,
    [
      id,
      principal.learnerKey,
      courseId,
      lessonId,
      lesson.published_classroom_id,
      title,
      instructions || null,
      dueAt,
      JSON.stringify(completionRule),
      now,
    ],
  );
  return apiSuccess({ id }, 201);
}
