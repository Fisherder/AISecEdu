/** Course detail: GET info + lessons + students; DELETE course. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { resolvePrincipal } from '@/lib/server/auth/session';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  const db = await getDb(); await ensureAppSchema(db);

  const cr = await db.query('SELECT * FROM app_courses WHERE id = $1', [id]);
  if (cr.rows.length === 0) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
  const course = cr.rows[0]!;
  const isOwner = course.owner_key === principal.learnerKey;

  if (principal.role !== 'student' && !isOwner && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
  }

  const enrollment = principal.role === 'student'
    ? await db.query(
        'SELECT 1 FROM course_enrollments WHERE course_id = $1 AND learner_key = $2',
        [id, principal.learnerKey],
      )
    : { rows: [] };
  const isEnrolled = enrollment.rows.length > 0;

  // Lessons in this course
  const lessons = await db.query(
    `SELECT l.id, l.title, l.published_classroom_id, cl.sort_order
     FROM course_lessons cl JOIN app_lessons l ON cl.lesson_id = l.id
     WHERE cl.course_id = $1
       AND ($2::boolean OR l.published_classroom_id IS NOT NULL)
     ORDER BY cl.sort_order`, [id, isOwner || principal.role === 'admin']);

  if (principal.role === 'student') {
    return apiSuccess({
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        course_code: course.course_code,
      },
      lessons: isEnrolled ? lessons.rows : [],
      enrolled: isEnrolled,
      canEnroll: true,
    });
  }

  // Only the owner/admin receives the roster.
  const students = await db.query(
    `SELECT ce.learner_key, ce.enrolled_at, u.username, u.display_name
     FROM course_enrollments ce
     LEFT JOIN users u ON ce.learner_key = ('acct:' || u.id)
     WHERE ce.course_id = $1
     ORDER BY ce.enrolled_at DESC`, [id]);
  return apiSuccess({ course, lessons: lessons.rows, students: students.rows, studentCount: students.rows.length });
}

export async function DELETE(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }
  const db = await getDb();
  const deleted = await db.query('DELETE FROM app_courses WHERE id = $1 AND owner_key = $2 RETURNING id', [id, principal.learnerKey]);
  if (deleted.rows.length === 0) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');
  return apiSuccess({ deleted: true, id });
}
