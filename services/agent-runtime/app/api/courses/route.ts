/** Course CRUD + enrollment + content publish. */
import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { resolvePrincipal } from '@/lib/server/auth/session';

/** GET /api/courses — list teacher's courses (or student's enrolled courses). */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  const db = await getDb();
  await ensureAppSchema(db);

  if (principal.role === 'student') {
    const r = await db.query(
      `SELECT c.id, c.title, c.description, c.course_code, c.owner_key, e.enrolled_at
       FROM course_enrollments e JOIN app_courses c ON e.course_id = c.id
       WHERE e.learner_key = $1 ORDER BY e.enrolled_at DESC`, [principal.learnerKey]);
    return apiSuccess({ courses: r.rows });
  }

  const r = await db.query(
    `SELECT c.*, (SELECT count(*) FROM course_enrollments WHERE course_id = c.id) as student_count
     FROM app_courses c WHERE c.owner_key = $1 ORDER BY c.updated_at DESC`, [principal.learnerKey]);
  return apiSuccess({ courses: r.rows });
}

/** POST /api/courses — create a course. */
export async function POST(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }
  const { title, description, courseCode } = await req.json().catch(() => ({}));
  if (!title) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: title');

  const db = await getDb();
  await ensureAppSchema(db);
  const id = nanoid(10); const now = Date.now();
  await db.query(
    'INSERT INTO app_courses (id, owner_key, title, description, course_code, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, principal.learnerKey, title, description ?? null, courseCode ?? null, now, now]);
  return apiSuccess({ id }, 201);
}
