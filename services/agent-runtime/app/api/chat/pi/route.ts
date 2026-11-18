/**
 * Pi Director Chat API Endpoint
 *
 * POST /api/chat/pi - parallel PoC path for running the in-class multi-agent
 * chain through bounded Harness turns and classroom display actions.
 */

import { NextRequest } from 'next/server';
import { isPiChatEnabled } from '@/lib/config/feature-flags';
import { createLogger } from '@/lib/logger';
import {
  getPiMaxActionsPerAgent,
  getPiMaxAgentTurns,
  resolveAgentConfigs,
} from '@/lib/chat/pi/config';
import { runHarnessClassroom } from '@/lib/chat/pi/harness-classroom';
import type { SendEvent } from '@/lib/chat/pi/types';
import { createHarnessTurn } from '@/lib/server/agent-harness/classroom-turn';
import { apiError } from '@/lib/server/api-response';
import type { StatelessChatRequest } from '@/lib/types/chat';

const log = createLogger('Pi Chat API');

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!isPiChatEnabled()) {
    return apiError('INVALID_REQUEST', 404, 'Pi chat runtime is disabled');
  }

  const encoder = new TextEncoder();
  let chatMessageCount: number | undefined;

  try {
    const body: StatelessChatRequest = await req.json();
    chatMessageCount = body.messages?.length;

    if (!body.messages || !Array.isArray(body.messages)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: messages');
    }

    if (!body.storeState) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: storeState');
    }

    if (!body.config || body.config.agentIds == null) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: config.agentIds');
    }

    const agentIds = body.config.agentIds;
    if (
      !Array.isArray(agentIds) ||
      agentIds.length === 0 ||
      agentIds.some((id) => typeof id !== 'string' || id.trim().length === 0 || id !== id.trim()) ||
      new Set(agentIds).size !== agentIds.length
    ) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'config.agentIds must be a non-empty array of unique, non-empty strings',
      );
    }

    const agentConfigs = resolveAgentConfigs(body);
    const resolvedAgentIds = new Set(agentConfigs.map((agent) => agent.id));
    const unresolvedAgentIds = agentIds.filter((id) => !resolvedAgentIds.has(id));
    if (unresolvedAgentIds.length > 0) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `Unknown classroom agents in config.agentIds: ${unresolvedAgentIds.join(', ')}`,
      );
    }
    if (agentConfigs.length === 0) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `No valid classroom agents found for config.agentIds: ${body.config.agentIds.join(', ')}`,
      );
    }

    const runTurn = createHarnessTurn();
    if (!runTurn) return apiError('UPSTREAM_ERROR', 503, '课堂对话服务尚未配置。');

    const signal = req.signal;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(275_000)]);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const send: SendEvent = async (event) => {
      await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    };

    const maxAgentTurns = getPiMaxAgentTurns(body);
    const maxActionsPerAgent = getPiMaxActionsPerAgent(body);
    const enableWhiteboardTools = body.config.piEnableWhiteboardTools === true;

    log.info(
      `Pi request agents=${body.config.agentIds.join(', ')} messages=${body.messages.length} maxAgentTurns=${maxAgentTurns}`,
    );

    (async () => {
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const startHeartbeat = () => {
        heartbeatTimer = setInterval(() => {
          writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => stopHeartbeat());
        }, 15_000);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();

        await runHarnessClassroom({
          body,
          agentConfigs,
          send,
          runTurn,
          signal: deadline,
          maxAgentTurns,
          maxActionsPerAgent,
          enableWhiteboardTools,
        });

        if (signal.aborted) {
          stopHeartbeat();
          await writer.close();
          return;
        }

        stopHeartbeat();
        await writer.close();
      } catch (error) {
        stopHeartbeat();

        if (signal.aborted) {
          try {
            await writer.close();
          } catch {
            /* already closed */
          }
          return;
        }

        log.error('Pi chat stream error:', error);
        try {
          await send({
            type: 'error',
            data: { message: error instanceof Error ? error.message : String(error) },
          });
          await writer.close();
        } catch {
          /* writer may already be closed */
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error(`Pi chat request failed [messages=${chatMessageCount ?? 0}]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process request',
    );
  }
}
