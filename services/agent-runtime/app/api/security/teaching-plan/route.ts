import { NextRequest } from 'next/server';
import { apiError, apiSuccess, API_ERROR_CODES } from '@/lib/server/api-response';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import { resolvePrincipal } from '@/lib/server/stores';
import { planTeachingPackage } from '@/lib/server/teaching-plan';

const MAX_TOPIC_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 8_000;

export async function POST(req: NextRequest) {
  const principal = await resolvePrincipal(req);
  if (!principal) {
    return apiError(API_ERROR_CODES.INVALID_CREDENTIALS, 401, 'Not authenticated');
  }
  if (!isTeachingStaff(principal)) {
    return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  }

  const body = await req.json().catch(() => ({}));
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const courseId = typeof body.courseId === 'string' ? body.courseId.trim() : '';
  if (!topic) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: topic');
  }
  if (topic.length > MAX_TOPIC_LENGTH || description.length > MAX_DESCRIPTION_LENGTH) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Teaching requirement is too long');
  }

  const plan = await planTeachingPackage({
    topic,
    ...(description ? { description } : {}),
    ...(courseId ? { courseId } : {}),
  });
  return apiSuccess({ plan });
}
