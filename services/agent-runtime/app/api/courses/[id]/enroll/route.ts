/** Course enrollment + lesson management. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getDb } from '@/lib/server/db';
import { ensureAppSchema } from '@/lib/server/schema';
import { resolvePrincipal } from '@/lib/server/auth/session';

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/courses/[id]/enroll — student joins course (by course code or direct). */
export async function POST(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student') return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');
  const db = await getDb(); await ensureAppSchema(db);

  const cr = await db.query('SELECT id FROM app_courses WHERE id = $1', [id]);
  if (cr.rows.length === 0) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Course not found');

  await db.query(
    'INSERT INTO course_enrollments (course_id, learner_key, enrolled_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [id, principal.learnerKey, Date.now()]);
  return apiSuccess({ enrolled: true });
}

/** DELETE /api/courses/[id]/enroll — leave course. */
export async function DELETE(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'student') return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Student role required');
  const db = await getDb();
  await db.query('DELETE FROM course_enrollments WHERE course_id = $1 AND learner_key = $2', [id, principal.learnerKey]);
  return apiSuccess({ left: true });
}
