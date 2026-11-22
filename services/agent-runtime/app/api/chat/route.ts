/**
 * Stateless Chat API Endpoint
 *
 * POST /api/chat - Send message, receive SSE stream
 *
 * This endpoint:
 * 1. Receives full state from client (messages + storeState)
 * 2. Runs single-pass generation
 * 3. Streams events as SSE (text deltas + tool calls)
 *
 * Fully stateless: interruption is handled by the client aborting
 * the fetch request, which triggers req.signal on the server side.
 */

import { NextRequest } from 'next/server';
import { statelessGenerate } from '@/lib/orchestration/stateless-generate';
import type { StatelessChatRequest } from '@/lib/types/chat';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { createClassroomTurn } from '@/lib/server/agent-harness/classroom-turn';
import { resolveOrdinaryClassroomChat } from '@/lib/server/ordinary-classroom-chat';
import { streamChatEvents } from './stream';
import { streamOrdinaryClassroomChat } from './ordinary';
const log = createLogger('Chat API');

// Allow Harness to finish and report usage after its 150s dialogue deadline.
export const maxDuration = 170;

/**
 * POST /api/chat
 * Send a message and receive SSE stream of generation events
 *
 * Request body: StatelessChatRequest
 * {
 *   messages: UIMessage[],
 *   storeState: { stage, scenes, currentSceneId, mode },
 *   config: { agentIds, sessionType? }
 * }
 *
 * Response: SSE stream of StatelessEvent
 */
export async function POST(req: NextRequest) {
  let chatMessageCount: number | undefined;

  try {
    const body: StatelessChatRequest = await req.json();
    chatMessageCount = body.messages?.length;

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: messages');
    }

    if (!body.storeState) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: storeState');
    }

    if (!Array.isArray(body.config?.agentIds) || body.config.agentIds.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: config.agentIds');
    }

    const authority = await resolveOrdinaryClassroomChat(req, body);
    if (authority.kind === 'error') return authority.response;

    if (authority.kind === 'ordinary') return streamOrdinaryClassroomChat(req, body, authority);

    const runTurn = createClassroomTurn();
    if (!runTurn) return apiError('UPSTREAM_ERROR', 503, '课堂对话服务尚未配置。');
    return streamChatEvents((deadline) => statelessGenerate(body, deadline, runTurn), req.signal, 55_000);
  } catch (error) {
    log.error(`Chat request failed [messages=${chatMessageCount ?? 0}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process request',
    );
  }
}
