/** Student progress projection + append-only learning evidence. */
import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb, type Queryable } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { resolvePrincipal, type Principal } from '@/lib/server/auth/session';
import { safeQuizScores, safeStringArray } from '@/lib/security/learning-analytics';

const ALLOWED_EVENT_TYPES = new Set([
  'classroom.opened',
  'scene.viewed',
  'quiz.submitted',
  'progress.sync',
]);

async function resolveClassroomAccess(
  db: Queryable,
  classroomId: string,
  principal: Principal,
): Promise<{ allowed: boolean; lessonId: string | null }> {
  const classroom = await db.query('SELECT lesson_id FROM app_classrooms WHERE id = $1', [classroomId]);
  let lessonId = (classroom.rows[0]?.lesson_id as string | null | undefined) ?? null;
  if (!lessonId) {
    const lesson = await db.query('SELECT id FROM app_lessons WHERE published_classroom_id = $1', [classroomId]);
    lessonId = (lesson.rows[0]?.id as string | undefined) ?? null;
  }

  const direct = await db.query(
    'SELECT 1 FROM classroom_enrollments WHERE classroom_id = $1 AND learner_key = $2',
    [classroomId, principal.learnerKey],
  );
  if (direct.rows.length > 0) return { allowed: true, lessonId };
  if (!lessonId) return { allowed: false, lessonId: null };

  const viaCourse = await db.query(
    `SELECT 1
     FROM course_lessons cl
     JOIN course_enrollments ce ON ce.course_id = cl.course_id
     WHERE cl.lesson_id = $1 AND ce.learner_key = $2
     LIMIT 1`,
    [lessonId, principal.learnerKey],
  );
  return { allowed: viaCourse.rows.length > 0, lessonId };
}

function validSceneIds(value: unknown): string[] {
  return safeStringArray(value)
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 160)
    .slice(0, 500);
}

/** POST /api/classrooms/progress — merge progress and append an idempotent event. */
export async function POST(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student') return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');

  const body = await req.json().catch(() => ({}));
  const classroomId = typeof body.classroomId === 'string' ? body.classroomId.trim() : '';
  if (!classroomId) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: classroomId');

  const db = await getDb();
  await ensureAppSchema(db);
  const access = await resolveClassroomAccess(db, classroomId, principal);
  if (!access.allowed) return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Classroom enrollment required');

  const current = await db.query(
    'SELECT completed_scenes, quiz_scores, lesson_id FROM student_progress WHERE classroom_id = $1 AND learner_key = $2',
    [classroomId, principal.learnerKey],
  );
  const currentRow = current.rows[0];
  const completedScenes = [...new Set([
    ...safeStringArray(currentRow?.completed_scenes),
    ...validSceneIds(body.completedScenes),
    ...(typeof body.completedSceneId === 'string' ? [body.completedSceneId.trim().slice(0, 160)] : []),
  ])].filter(Boolean).slice(0, 500);
  const quizScores = {
    ...safeQuizScores(currentRow?.quiz_scores),
    ...safeQuizScores(body.quizScores),
  };
  const lastSceneId = typeof body.lastSceneId === 'string' ? body.lastSceneId.slice(0, 160) : null;
  const lessonId = access.lessonId
    ?? (typeof body.lessonId === 'string' ? body.lessonId.slice(0, 160) : null)
    ?? (currentRow?.lesson_id as string | null | undefined)
    ?? null;
  const now = Date.now();

  await db.query(
    `INSERT INTO student_progress (classroom_id, learner_key, lesson_id, last_scene_id, completed_scenes, quiz_scores, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (classroom_id, learner_key) DO UPDATE SET
       lesson_id = COALESCE($3, student_progress.lesson_id),
       last_scene_id = COALESCE($4, student_progress.last_scene_id),
       completed_scenes = $5,
       quiz_scores = $6,
       updated_at = $7`,
    [
      classroomId,
      principal.learnerKey,
      lessonId,
      lastSceneId,
      JSON.stringify(completedScenes),
      JSON.stringify(quizScores),
      now,
    ],
  );

  const requestedEventType = typeof body.eventType === 'string' ? body.eventType : 'progress.sync';
  const eventType = ALLOWED_EVENT_TYPES.has(requestedEventType) ? requestedEventType : 'progress.sync';
  const sceneId = typeof body.sceneId === 'string'
    ? body.sceneId.slice(0, 160)
    : lastSceneId;
  const eventId = typeof body.eventId === 'string' && /^[\w:.-]{1,220}$/.test(body.eventId)
    ? body.eventId
    : `evt_${nanoid(18)}`;
  await db.query(
    `INSERT INTO learning_events (id, classroom_id, learner_key, lesson_id, scene_id, event_type, source, payload, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,'web',$7,$8)
     ON CONFLICT (id) DO NOTHING`,
    [
      eventId,
      classroomId,
      principal.learnerKey,
      lessonId,
      sceneId,
      eventType,
      JSON.stringify({ completedSceneCount: completedScenes.length, quizKeys: Object.keys(quizScores) }),
      now,
    ],
  );

  return apiSuccess({
    saved: true,
    eventId,
    progress: {
      classroom_id: classroomId,
      lesson_id: lessonId,
      last_scene_id: lastSceneId,
      completed_scenes: completedScenes,
      quiz_scores: quizScores,
      updated_at: now,
    },
  });
}

/** GET /api/classrooms/progress?classroomId=... — current student's projection. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student') return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');

  const classroomId = req.nextUrl.searchParams.get('classroomId');
  if (!classroomId) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: classroomId');

  const db = await getDb();
  await ensureAppSchema(db);
  const access = await resolveClassroomAccess(db, classroomId, principal);
  if (!access.allowed) return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Classroom enrollment required');

  const result = await db.query(
    'SELECT * FROM student_progress WHERE classroom_id = $1 AND learner_key = $2',
    [classroomId, principal.learnerKey],
  );
  const row = result.rows[0];
  return apiSuccess({
    progress: row ? {
      ...row,
      completed_scenes: safeStringArray(row.completed_scenes),
      quiz_scores: safeQuizScores(row.quiz_scores),
    } : null,
  });
}
