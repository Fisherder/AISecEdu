import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getLessonStore, resolvePrincipal } from '@/lib/server/stores';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import { upgradeLegacyCodeWidgetHtml } from '@/lib/generation/widget-workflow';
import { isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';
import { readLesson as readIntegratedLesson } from '@/lib/server/lesson-storage';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  if (isAISecEduIntegrated()) {
    const lesson = await readIntegratedLesson(id);
    return lesson
      ? apiSuccess({ lesson })
      : apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Lesson not found');
  }
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!isTeachingStaff(principal))
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const store = getLessonStore();
  const lesson = await store.read(principal, id);
  if (!lesson) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Lesson not found');
  let upgradedCodeWidgets = false;
  for (const artifact of lesson.artifacts) {
    if (artifact.type !== 'code') continue;
    const content = artifact.content as unknown as Record<string, unknown>;
    if (typeof content.html !== 'string') continue;
    const html = upgradeLegacyCodeWidgetHtml(content.html);
    if (html === content.html) continue;
    artifact.content = { ...content, html } as typeof artifact.content;
    upgradedCodeWidgets = true;
  }
  if (upgradedCodeWidgets) await store.write(principal, lesson);
  return apiSuccess({ lesson });
}

export async function PATCH(req: NextRequest, context: Ctx) {
  if (isAISecEduIntegrated()) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Edit through the 玄甲 revision workflow',
    );
  }
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!isTeachingStaff(principal))
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const store = getLessonStore();
  const lesson = await store.read(principal, id);
  if (!lesson) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Lesson not found');
  const body = await req.json().catch(() => ({}));

  if (typeof body.title === 'string') lesson.title = body.title;
  if (typeof body.description === 'string') lesson.description = body.description;
  if (Array.isArray(body.orders)) {
    const orderMap = new Map<string, number>(
      body.orders.map((o: { id: string; order: number }) => [o.id, o.order]),
    );
    for (const a of lesson.artifacts) if (orderMap.has(a.id)) a.order = orderMap.get(a.id)!;
    lesson.artifacts.sort((x, y) => x.order - y.order);
  }
  await store.write(principal, lesson);
  return apiSuccess({ lesson });
}

export async function DELETE(req: NextRequest, context: Ctx) {
  if (isAISecEduIntegrated()) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Delete through a 玄甲 approved action',
    );
  }
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!isTeachingStaff(principal))
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const store = getLessonStore();
  await store.delete(principal, id);
  return apiSuccess({ deleted: true });
}
