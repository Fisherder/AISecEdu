/** Student enrollment: enroll in a classroom, list enrolled classrooms. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { resolvePrincipal } from '@/lib/server/auth/session';

/** GET /api/classrooms/enrolled — list classrooms the student is enrolled in. */
export async function GET(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student') return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');

  const db = await getDb();
  await ensureAppSchema(db);
  const result = await db.query(
    `SELECT c.id, c.lesson_id, c.stage->>'name' as title, e.enrolled_at
     FROM classroom_enrollments e
     JOIN app_classrooms c ON e.classroom_id = c.id
     WHERE e.learner_key = $1
     ORDER BY e.enrolled_at DESC`,
    [principal.learnerKey],
  );
  return apiSuccess({ classrooms: result.rows });
}

/** POST /api/classrooms/enroll — enroll in a classroom by ID. */
export async function POST(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student') return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');

  const { classroomId } = await req.json().catch(() => ({}));
  if (!classroomId) return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing: classroomId');

  const db = await getDb();
  await ensureAppSchema(db);

  // Verify classroom exists
  const cr = await db.query('SELECT id FROM app_classrooms WHERE id = $1', [classroomId]);
  if (cr.rows.length === 0) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');

  // Enroll (idempotent)
  await db.query(
    `INSERT INTO classroom_enrollments (classroom_id, learner_key, enrolled_at) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [classroomId, principal.learnerKey, Date.now()],
  );

  return apiSuccess({ enrolled: true, classroomId });
}
