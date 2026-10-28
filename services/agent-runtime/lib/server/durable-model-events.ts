/** The receiver deduplicates each (attempt, type, callId) using its content hash. */
export async function persistDurableModelEvent(
  url: string,
  headers: Record<string, string>,
  event: Record<string, unknown>,
  options: {signal?: AbortSignal; timeoutMs?: number} = {},
): Promise<void> {
  const body = JSON.stringify(event);
  const deadline = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST', headers, body, cache: 'no-store', signal,
      });
      await response.arrayBuffer();
    } catch (error) {
      signal.throwIfAborted();
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
      continue;
    }
    if (response.ok) return;
    const error = new Error(`Model event persistence returned HTTP ${response.status}`);
    if (response.status < 500 || attempt === 2) throw error;
    await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
  }
}
