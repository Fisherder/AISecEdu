import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getLessonStore, resolvePrincipal } from '@/lib/server/stores';
import type { Lesson } from '@/lib/types/lesson';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import { isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';
import { listLessons as listIntegratedLessons } from '@/lib/server/lesson-storage';

export async function GET(req: NextRequest) {
  if (isAISecEduIntegrated()) {
    return apiSuccess({ lessons: await listIntegratedLessons() });
  }
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!isTeachingStaff(principal)) return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const store = getLessonStore();
  const lessons = await store.list(principal);
  return apiSuccess({ lessons });
}

export async function POST(req: NextRequest) {
  if (isAISecEduIntegrated()) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Create content through the 玄甲 candidate workflow',
    );
  }
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!isTeachingStaff(principal)) return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const store = getLessonStore();
  const body = await req.json().catch(() => ({}));
  const title = (body.title || '').toString().trim();
  if (!title) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: title');
  }
  const now = Date.now();
  const lesson: Lesson = {
    id: nanoid(10),
    title,
    ...(body.description ? { description: String(body.description) } : {}),
    ...(body.subjectProfile ? { subjectProfile: body.subjectProfile } : {}),
    ...(body.courseId ? { courseId: String(body.courseId) } : {}),
    artifacts: [],
    createdAt: now,
    updatedAt: now,
  };
  await store.write(principal, lesson);
  return apiSuccess({ id: lesson.id }, 201);
}
