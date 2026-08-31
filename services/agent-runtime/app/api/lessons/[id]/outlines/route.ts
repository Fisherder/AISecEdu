import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getLessonStore, resolvePrincipal } from '@/lib/server/stores';
import { buildLessonAiCall } from '@/lib/server/lesson-generation';
import {
  buildFallbackOutlines,
  generateSceneOutlinesFromRequirements,
} from '@/lib/generation/outline-generator';
import { buildCurriculumContext } from '@/lib/curriculum';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import { isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

type Ctx = { params: Promise<{ id: string }> };

/** Batch step 1: propose a mixed outline from a topic. */
export async function POST(req: NextRequest, context: Ctx) {
  if (isAISecEduIntegrated()) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Generate candidates through the 玄甲 durable job workflow',
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
  const requirement = (body.requirement || '').toString().trim();
  if (!requirement) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Missing required field: requirement',
    );
  }
  const courseId = body.courseId || lesson.courseId;
  const subjectProfile = lesson.subjectProfile;
  let aiCall: Awaited<ReturnType<typeof buildLessonAiCall>>['aiCall'];
  try {
    aiCall = (await buildLessonAiCall()).aiCall;
  } catch {
    aiCall = async () => {
      throw new Error('Lesson outline model unavailable; use deterministic fallback');
    };
  }
  const requirements = { requirement, subjectProfile, courseId };
  const result = await generateSceneOutlinesFromRequirements(
    requirements,
    undefined,
    undefined,
    aiCall,
    {
      subjectProfile: subjectProfile === 'cybersecurity',
      curriculumContext: buildCurriculumContext(courseId),
    },
  );
  const data =
    result.success && result.data?.outlines?.length
      ? result.data
      : buildFallbackOutlines(requirements, {
          subjectProfile: subjectProfile === 'cybersecurity',
        });
  return apiSuccess({
    outlines: data.outlines,
    languageDirective: data.languageDirective,
    ...(result.success ? {} : { generationFallback: true }),
  });
}
