import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { resolvePrincipal } from '@/lib/server/auth/session';
import { getDb } from '@/lib/server/db';
import { normalizeTaskCompletionRule } from '@/lib/server/learning-tasks';
import { ensureAppSchema } from '@/lib/server/schema';

type Ctx = { params: Promise<{ id: string }> };

function dueAt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function owner(req: NextRequest, id: string) {
  const principal = await resolvePrincipal(req);
  if (!principal)
    return { response: apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated') };
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return { response: apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required') };
  }
  const db = await getDb();
  await ensureAppSchema(db);
  const task = await db.query('SELECT * FROM learning_tasks WHERE id = $1 AND owner_key = $2', [
    id,
    principal.learnerKey,
  ]);
  if (!task.rows[0])
    return { response: apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Task not found') };
  return { principal, db, task: task.rows[0] };
}

export async function PATCH(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await owner(req, id);
  if ('response' in access) return access.response;
  const body = await req.json().catch(() => ({}));
  const parsedDueAt = dueAt(body.dueAt);
  if (body.dueAt !== undefined && parsedDueAt === undefined) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid dueAt');
  }
  const currentRule = normalizeTaskCompletionRule(access.task.completion_rule);
  const rule = normalizeTaskCompletionRule({
    ...currentRule,
    ...(body.minQuizScore !== undefined ? { minQuizScore: body.minQuizScore } : {}),
  });
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 160)
      : access.task.title;
  const instructions =
    typeof body.instructions === 'string'
      ? body.instructions.trim().slice(0, 2000)
      : access.task.instructions;
  const status =
    body.status === 'archived' || body.status === 'active' ? body.status : access.task.status;
  await access.db.query(
    `UPDATE learning_tasks
     SET title = $1, instructions = $2, due_at = $3, completion_rule = $4, status = $5, updated_at = $6
     WHERE id = $7 AND owner_key = $8`,
    [
      title,
      instructions || null,
      parsedDueAt === undefined ? access.task.due_at : parsedDueAt,
      JSON.stringify(rule),
      status,
      Date.now(),
      id,
      access.principal.learnerKey,
    ],
  );
  return apiSuccess({ updated: true, id });
}

export async function DELETE(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await owner(req, id);
  if ('response' in access) return access.response;
  await access.db.query('DELETE FROM learning_tasks WHERE id = $1 AND owner_key = $2', [
    id,
    access.principal.learnerKey,
  ]);
  return apiSuccess({ deleted: true, id });
}
