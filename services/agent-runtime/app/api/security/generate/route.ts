/** Security Teaching Module — REST API: generate artifact. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  generateSingleArtifact,
  buildLessonAiCall,
  isLessonArtifactType,
} from '@/lib/security/module';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { type, title, description, keyPoints, quality } = body;

  if (!type || !title) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Missing required fields: type, title',
    );
  }

  if (!isLessonArtifactType(type)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid artifact type');
  }

  const q = quality === 'rich' ? 'rich' : 'fast';
  try {
    let aiCall: Awaited<ReturnType<typeof buildLessonAiCall>>['aiCall'];
    if (type === 'debate') {
      aiCall = async () => '';
    } else {
      try {
        aiCall = (await buildLessonAiCall(q)).aiCall;
      } catch {
        aiCall = async () => {
          throw new Error('Security artifact model unavailable; use deterministic fallback');
        };
      }
    }
    const artifact = await generateSingleArtifact(
      { type, title, keyPoints, description },
      1,
      aiCall,
      { subjectProfile: true, useWorkflow: q === 'fast' },
    );
    if (!artifact) {
      return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Generation failed');
    }
    return apiSuccess({ artifact }, 201);
  } catch (e) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      e instanceof Error ? e.message : 'Unknown error',
    );
  }
}
