/** Add/remove lessons to a course (teacher only). */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { resolvePrincipal } from '@/lib/server/auth/session';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/courses/[id]/lessons — add lesson to course. */
export async function POST(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }
  const { lessonId } = await req.json().catch(() => ({}));
  if (!lessonId) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: lessonId');
  const db = await getDb(); await ensureAppSchema(db);

  const owned = await db.query('SELECT 1 FROM app_courses WHERE id = $1 AND owner_key = $2', [id, principal.learnerKey]);
  const ownedLesson = await db.query('SELECT 1 FROM app_lessons WHERE id = $1 AND owner_key = $2', [lessonId, principal.learnerKey]);
  if (owned.rows.length === 0 || ownedLesson.rows.length === 0) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course or lesson not found');
  }

  const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order),0) as m FROM course_lessons WHERE course_id = $1', [id]);
  const order = (maxOrder.rows[0]!.m as number) + 1;
  await db.query(
    'INSERT INTO course_lessons (course_id, lesson_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [id, lessonId, order]);
  return apiSuccess({ added: true });
}

/** GET /api/courses/[id]/lessons — list lessons in course (for enrolled students). */
export async function GET(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  const db = await getDb(); await ensureAppSchema(db);

  const course = await db.query('SELECT owner_key FROM app_courses WHERE id = $1', [id]);
  if (course.rows.length === 0) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
  const isOwner = course.rows[0]!.owner_key === principal.learnerKey;
  const enrolled = principal.role === 'student'
    ? await db.query('SELECT 1 FROM course_enrollments WHERE course_id = $1 AND learner_key = $2', [id, principal.learnerKey])
    : { rows: [] };
  if (!isOwner && principal.role !== 'admin' && enrolled.rows.length === 0) {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Course enrollment required');
  }

  const lessons = await db.query(
    `SELECT l.id, l.title, l.published_classroom_id, cl.sort_order
     FROM course_lessons cl JOIN app_lessons l ON cl.lesson_id = l.id
     WHERE cl.course_id = $1
       AND ($2::boolean OR l.published_classroom_id IS NOT NULL)
     ORDER BY cl.sort_order`, [id, isOwner || principal.role === 'admin']);
  return apiSuccess({ lessons: lessons.rows });
}

/** DELETE /api/courses/[id]/lessons — remove a lesson link, not the lesson itself. */
export async function DELETE(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }
  const { lessonId } = await req.json().catch(() => ({}));
  if (!lessonId) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: lessonId');
  const db = await getDb(); await ensureAppSchema(db);
  const course = await db.query('SELECT 1 FROM app_courses WHERE id = $1 AND owner_key = $2', [id, principal.learnerKey]);
  if (course.rows.length === 0) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
  await db.query('DELETE FROM course_lessons WHERE course_id = $1 AND lesson_id = $2', [id, lessonId]);
  return apiSuccess({ removed: true, lessonId });
}
