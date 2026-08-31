import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { getLessonStore, resolvePrincipal } from '@/lib/server/stores';
import { publishLesson } from '@/lib/server/lesson-publish';
import { isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

type Ctx = { params: Promise<{ id: string }> };

/** Publish a lesson as a shareable classroom; records publishedClassroomId on the lesson. */
export async function POST(req: NextRequest, context: Ctx) {
  if (isAISecEduIntegrated()) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 409, 'Publish through 玄甲 validation and explicit approval');
  }
  const { id } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (principal.role !== 'teacher' && principal.role !== 'admin') {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }
  const store = getLessonStore();
  const lesson = await store.read(principal, id);
  if (!lesson) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Lesson not found');
  if (lesson.artifacts.length === 0) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Cannot publish a lesson with no artifacts');
  }
  const baseUrl = buildRequestOrigin(req);
  const { classroomId, url } = await publishLesson(lesson, baseUrl, principal.learnerKey);
  lesson.publishedClassroomId = classroomId;
  await store.write(principal, lesson);
  return apiSuccess({ classroomId, url });
}
