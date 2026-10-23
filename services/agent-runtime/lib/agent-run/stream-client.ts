import { isAgentRunEnvelope, isAgentRunEvent, type AgentRunEvent } from './protocol';

export async function readAgentRunNdjson<T>(
  response: Response,
  onEvent?: (event: AgentRunEvent) => void,
): Promise<T> {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (!contentType.includes('application/x-ndjson')) {
    return (await response.json()) as T;
  }
  if (!response.body) throw new Error('Agent run stream has no response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as unknown;
      const event = isAgentRunEnvelope(parsed)
        ? parsed.event
        : isAgentRunEvent(parsed)
          ? parsed
          : undefined;
      if (!event) continue;
      onEvent?.(event);
      if (event.type === 'run.completed') result = event.result as T;
      if (event.type === 'run.failed') {
        const error = new Error(event.error) as Error & { errorCode?: string; statusCode?: number };
        if (event.code) error.errorCode = event.code;
        if (event.statusCode != null) error.statusCode = event.statusCode;
        throw error;
      }
      if (event.type === 'run.cancelled') throw new DOMException('Aborted', 'AbortError');
    }
    if (done) break;
  }
  if (result === undefined) throw new Error('Agent run stream ended without a result');
  return result;
}
