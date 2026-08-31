'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Lets a sandboxed, null-origin iframe request the authenticated code-runner
 * through its trusted parent. Only this narrow message shape is proxied; the
 * server still authenticates, rate-limits and validates the complete payload.
 */
export function useCodeRunnerIframeBridge(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  documentKey: unknown,
): void {
  useEffect(() => {
    const controllers = new Set<AbortController>();
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as
        | {
            __openmaicCodeRunner?: boolean;
            kind?: string;
            requestId?: unknown;
            payload?: unknown;
          }
        | undefined;
      if (
        !data ||
        data.__openmaicCodeRunner !== true ||
        data.kind !== 'run-request' ||
        typeof data.requestId !== 'string' ||
        data.requestId.length > 160
      ) {
        return;
      }

      const requestId = data.requestId;
      const controller = new AbortController();
      controllers.add(controller);
      void fetch('/api/code/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.payload),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json().catch(() => ({
            success: false,
            error: '代码运行服务返回了无效响应。',
          }))) as Record<string, unknown>;
          iframeRef.current?.contentWindow?.postMessage(
            {
              __openmaicCodeRunner: true,
              kind: 'run-result',
              requestId,
              response: payload,
            },
            '*',
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          iframeRef.current?.contentWindow?.postMessage(
            {
              __openmaicCodeRunner: true,
              kind: 'run-result',
              requestId,
              response: {
                success: false,
                error: error instanceof Error ? error.message : '代码运行服务不可用。',
              },
            },
            '*',
          );
        })
        .finally(() => controllers.delete(controller));
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      controllers.forEach((controller) => controller.abort());
    };
  }, [documentKey, iframeRef]);
}
