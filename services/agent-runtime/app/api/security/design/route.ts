/** Security Teaching Module — REST API: scenario design. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { designScenarios } from '@/lib/security/scenario-designer';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { topic, description } = body;

  if (!topic) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: topic');
  }

  try {
    const proposals = await designScenarios(topic, description);
    if (proposals.length === 0) {
      return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Failed to design scenarios');
    }
    return apiSuccess({ proposals });
  } catch (e) {
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, e instanceof Error ? e.message : 'Unknown error');
  }
}
