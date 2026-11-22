import type { NextRequest } from 'next/server';
import {
  AISECEDU_SESSION_COOKIE,
  aiseceduRequest,
  isAISecEduIntegrated,
  type AISecEduRequestSession,
} from '@/lib/server/aisecedu-integration';
import { apiError } from '@/lib/server/api-response';
import type { StatelessChatRequest } from '@/lib/types/chat';

export type OrdinaryClassroomChatContext = { topic: string; slideText: string };

export async function resolveOrdinaryClassroomChat(req: NextRequest, body: StatelessChatRequest) {
  const classroomId = body.storeState.stage?.id;
  if (!isAISecEduIntegrated()) return { kind: 'legacy' } as const;

  const sceneId = body.storeState.currentSceneId;
  if (
    typeof classroomId !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(classroomId) ||
    (sceneId != null && (typeof sceneId !== 'string' || sceneId.length > 320))
  ) {
    return {
      kind: 'error',
      response: apiError('INVALID_REQUEST', 400, '课堂或页面标识无效。'),
    } as const;
  }

  const token = req.cookies.get(AISECEDU_SESSION_COOKIE)?.value;
  if (!token) {
    return {
      kind: 'error',
      response: apiError('INVALID_CREDENTIALS', 401, '请重新登录后进入课堂。'),
    } as const;
  }
  const capturedSession: AISecEduRequestSession = {
    token,
    traceId: req.headers.get('pwn-trace-id') || req.headers.get('x-trace-id') || undefined,
  };

  try {
    const context = await aiseceduRequest<{
      ordinary?: unknown;
      topic?: unknown;
      slideText?: unknown;
    }>(
      '/pwncollege_api/v1/teaching/runtime/classrooms/' +
        encodeURIComponent(classroomId) + '/ordinary-chat-context?sceneId=' +
        encodeURIComponent(sceneId ?? ''),
      { signal: AbortSignal.any([req.signal, AbortSignal.timeout(10_000)]) },
      { capturedSession },
    );
    if (context?.ordinary === false) return { kind: 'legacy' } as const;
    if (
      context?.ordinary === true && typeof context.topic === 'string' && context.topic.trim() &&
      typeof context.slideText === 'string' && context.slideText.trim()
    ) {
      return {
        kind: 'ordinary',
        context: { topic: context.topic, slideText: context.slideText },
        capturedSession,
      } as const;
    }
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401 || status === 403 || status === 404) {
      return {
        kind: 'error',
        response: apiError('FORBIDDEN', status, '无法访问此课堂页面。'),
      } as const;
    }
    if (status === 400 || status === 422) {
      return {
        kind: 'error',
        response: apiError('INVALID_REQUEST', status, '当前页面不支持课堂对话。'),
      } as const;
    }
  }
  return {
    kind: 'error',
    response: apiError('UPSTREAM_ERROR', 502, '暂时无法核验课堂页面。'),
  } as const;
}
