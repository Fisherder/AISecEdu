import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getLessonStore, resolvePrincipal } from '@/lib/server/stores';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import { applyLessonArtifactUpdate } from '@/lib/server/lesson-artifact-update';
import { isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

type Ctx = { params: Promise<{ id: string; artifactId: string }> };

/** PATCH — save structured slide/quiz edits from the teacher prep workbench. */
export async function PATCH(req: NextRequest, context: Ctx) {
  if (isAISecEduIntegrated()) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Edit through the 玄甲 revision workflow',
    );
  }
  const { id, artifactId } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!isTeachingStaff(principal))
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');

  const store = getLessonStore();
  const lesson = await store.read(principal, id);
  if (!lesson) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Lesson not found');
  const artifactIndex = lesson.artifacts.findIndex((artifact) => artifact.id === artifactId);
  if (artifactIndex < 0)
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Artifact not found');

  const body = await req.json().catch(() => null);
  const result = applyLessonArtifactUpdate(lesson.artifacts[artifactIndex]!, body);
  if (!result.ok) return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, result.error);

  lesson.artifacts[artifactIndex] = result.artifact;
  await store.write(principal, lesson);
  return apiSuccess({ artifact: result.artifact });
}

export async function DELETE(req: NextRequest, context: Ctx) {
  if (isAISecEduIntegrated()) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Delete through a 玄甲 approved action',
    );
  }
  const { id, artifactId } = await context.params;
  const principal = await resolvePrincipal(req);
  if (!principal) return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  if (!isTeachingStaff(principal))
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const store = getLessonStore();
  const lesson = await store.read(principal, id);
  if (!lesson) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Lesson not found');
  const before = lesson.artifacts.length;
  lesson.artifacts = lesson.artifacts.filter((a) => a.id !== artifactId);
  // re-index order
  lesson.artifacts.forEach((a, i) => (a.order = i + 1));
  await store.write(principal, lesson);
  return apiSuccess({ deleted: lesson.artifacts.length < before });
}
