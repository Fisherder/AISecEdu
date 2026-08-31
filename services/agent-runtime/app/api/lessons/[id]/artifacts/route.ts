import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getLessonStore, resolvePrincipal } from '@/lib/server/stores';
import {
  buildLessonAiCall,
  buildDeterministicFallbackForOutline,
  generateSingleArtifact,
  generateArtifactContent,
} from '@/lib/server/lesson-generation';
import { isLessonArtifactType, type LessonArtifact } from '@/lib/types/lesson';
import type { SceneOutline } from '@/lib/types/generation';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import { isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

type Ctx = { params: Promise<{ id: string }> };

/** Generate artifact(s): single (from params) or batch (from outlines[]). */
export async function POST(req: NextRequest, context: Ctx) {
  if (isAISecEduIntegrated()) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      409,
      'Generate revisions through the 玄甲 durable job workflow',
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
  const quality = body.quality === 'rich' ? 'rich' : 'fast';
  const subjectProfile = lesson.subjectProfile === 'cybersecurity';
  const useWorkflow = quality === 'fast';
  const languageDirective = lesson.courseId
    ? `使用中文教学，并与“${lesson.courseId}”课程目标保持一致。`
    : '使用中文教学。';

  let nextOrder = lesson.artifacts.length + 1;

  if (body.mode === 'batch' && Array.isArray(body.outlines)) {
    let aiCall: Awaited<ReturnType<typeof buildLessonAiCall>>['aiCall'];
    try {
      aiCall = (await buildLessonAiCall(quality)).aiCall;
    } catch {
      aiCall = async () => {
        throw new Error('Lesson artifact model unavailable; use deterministic fallback');
      };
    }
    const created: LessonArtifact[] = [];
    for (const outline of body.outlines as SceneOutline[]) {
      let effectiveOutline = outline;
      let content;
      try {
        content = await generateArtifactContent(outline, aiCall, {
          languageDirective,
          subjectProfile,
          useWorkflow,
        });
      } catch (error) {
        console.warn(
          `Batch artifact generation failed for "${outline.title}"; using fallback`,
          error,
        );
      }
      if (!content) {
        const fallback = buildDeterministicFallbackForOutline(outline);
        effectiveOutline = fallback.outline;
        content = fallback.content;
      }
      created.push({
        id: nanoid(),
        type: (effectiveOutline.widgetType ||
          (effectiveOutline.type === 'quiz'
            ? 'quiz'
            : effectiveOutline.type)) as LessonArtifact['type'],
        title: effectiveOutline.title,
        outline: effectiveOutline,
        content,
        order: nextOrder++,
        createdAt: Date.now(),
      });
    }
    lesson.artifacts.push(...created);
    await store.write(principal, lesson);
    return apiSuccess({ artifacts: created });
  }

  // single
  if (!body.type || !body.title) {
    return apiError(
      API_ERROR_CODES.MISSING_REQUIRED_FIELD,
      400,
      'Single mode requires type + title',
    );
  }
  if (!isLessonArtifactType(body.type)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Unsupported artifact type');
  }
  // Debate briefing generation is deterministic; its autonomous agents are
  // attached on publish, so it remains available even if no model is configured.
  let aiCall: Awaited<ReturnType<typeof buildLessonAiCall>>['aiCall'];
  if (body.type === 'debate') {
    aiCall = async () => '';
  } else {
    try {
      aiCall = (await buildLessonAiCall(quality)).aiCall;
    } catch {
      aiCall = async () => {
        throw new Error('Lesson artifact model unavailable; use deterministic fallback');
      };
    }
  }
  const artifact = await generateSingleArtifact(
    {
      type: body.type,
      title: body.title,
      keyPoints: body.keyPoints,
      description: body.description,
    },
    nextOrder,
    aiCall,
    { languageDirective, subjectProfile, useWorkflow },
  );
  if (!artifact) {
    return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Artifact generation failed');
  }
  lesson.artifacts.push(artifact);
  await store.write(principal, lesson);
  return apiSuccess({ artifact }, 201);
}
