import { createLogger } from '@/lib/logger';
import type { StatelessEvent } from '@/lib/types/chat';

const log = createLogger('Chat API');

export function streamChatEvents(
  generate: (signal: AbortSignal) => AsyncGenerator<StatelessEvent>,
  requestSignal: AbortSignal,
  timeoutMs: number,
  headers?: Record<string, string>,
): Response {
  const encoder = new TextEncoder();
  // Create SSE stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const disconnected = new AbortController();
  void writer.closed.catch(() => disconnected.abort());
  const signal = AbortSignal.any([requestSignal, disconnected.signal]);

  // Stream generation in background with heartbeat to prevent connection timeout
  const HEARTBEAT_INTERVAL_MS = 15_000;
  (async () => {
    // Heartbeat: periodically send SSE comments to keep the connection alive.
    // Proxies / browsers may close idle SSE connections after 30-120s of silence.
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        try {
          writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => stopHeartbeat());
        } catch {
          stopHeartbeat();
        }
      }, HEARTBEAT_INTERVAL_MS);
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    try {
      startHeartbeat();

      const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
      const generator = generate(deadline);

      for await (const event of generator) {
        if (signal.aborted) {
          log.info('Request was aborted');
          break;
        }

        const data = `data: ${JSON.stringify(event)}\n\n`;
        await writer.write(encoder.encode(data));
      }

      stopHeartbeat();
      await writer.close();
    } catch (error) {
      stopHeartbeat();

      // If aborted, just close the writer silently
      if (signal.aborted) {
        log.info('Request aborted during streaming');
        try {
          await writer.close();
        } catch {
          /* already closed */
        }
        return;
      }

      log.error('Chat stream error:', error);

      // Try to send error event
      try {
        const errorEvent: StatelessEvent = {
          type: 'error',
          data: {
            message: error instanceof Error ? error.message : String(error),
          },
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
        await writer.close();
      } catch {
        // Writer may already be closed
      }
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...headers,
    },
  });
}
