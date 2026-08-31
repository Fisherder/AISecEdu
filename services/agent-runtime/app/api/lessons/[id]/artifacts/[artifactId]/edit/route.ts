/** Edit an artifact's HTML via natural language instruction. */
import { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { getLessonStore, resolvePrincipal } from '@/lib/server/stores';
import { buildLessonAiCall } from '@/lib/server/lesson-generation';
import { createLogger } from '@/lib/logger';
import { isTeachingStaff } from '@/lib/server/auth/authorization';
import { isAISecEduIntegrated } from '@/lib/server/aisecedu-integration';

const log = createLogger('ArtifactEdit');

type Ctx = { params: Promise<{ id: string; artifactId: string }> };

function extractHtml(raw: string): string | null {
  const lower = raw.toLowerCase();
  const start = lower.indexOf('<!doctype');
  const start2 = start < 0 ? lower.indexOf('<html') : start;
  if (start2 < 0) return null;
  const end = lower.lastIndexOf('</html>');
  if (end < start2) return null;
  return raw.slice(start2, end + 7);
}

export async function POST(req: NextRequest, context: Ctx) {
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
  if (!isTeachingStaff(principal)) return apiError(API_ERROR_CODES.FORBIDDEN, 403, 'Teacher role required');
  const store = getLessonStore();
  const lesson = await store.read(principal, id);
  if (!lesson) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Lesson not found');

  const artifact = lesson.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Artifact not found');

  const body = await req.json().catch(() => ({}));
  const instruction = (body.instruction || '').toString().trim();
  if (!instruction) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing required field: instruction');
  }

  const content = artifact.content as unknown as Record<string, unknown>;
  const currentHtml = typeof content.html === 'string' ? content.html : null;
  if (!currentHtml) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'This artifact type does not support HTML editing');
  }

  const { aiCall } = await buildLessonAiCall('rich');

  const system = [
    'You are given an existing interactive HTML document for education.',
    'The user requests a specific modification. Apply ONLY the requested change.',
    'Return the COMPLETE modified HTML document (<!doctype html>...</html>).',
    'Keep all existing content and functionality intact; only add/modify what the user asked for.',
    'No markdown fences, no explanation outside the HTML.',
  ].join('\n');

  const user = `修改请求：${instruction}\n\n当前 HTML：\n${currentHtml}`;

  let newHtml: string | null = null;
  try {
    const raw = await aiCall(system, user);
    newHtml = extractHtml(raw);
  } catch (e) {
    log.error('Edit generation failed:', e);
    return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Edit generation failed');
  }

  if (!newHtml) {
    return apiError(API_ERROR_CODES.GENERATION_FAILED, 500, 'Failed to extract modified HTML');
  }

  // Update the artifact content
  (content as Record<string, unknown>).html = newHtml;
  // Also update the title from the new HTML if it changed
  const titleMatch = newHtml.match(/<title>(.*?)<\/title>/i);
  if (titleMatch?.[1]?.trim()) {
    artifact.title = titleMatch[1].trim();
  }
  artifact.content = content as unknown as typeof artifact.content;

  await store.write(principal, lesson);
  return apiSuccess({ artifactId, htmlLength: newHtml.length });
}
