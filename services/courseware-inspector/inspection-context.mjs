export function inspectionContextLifecycle(context, { signal, timeoutMs } = {}) {
  let closing, timeoutError;
  const close = () => closing ??= Promise.resolve().then(() => context.close()).catch(() => {});
  const aborted = () => { void close(); };
  signal?.addEventListener('abort', aborted, {once: true});
  if (signal?.aborted) aborted();
  const timer = timeoutMs ? setTimeout(() => {
    timeoutError = new Error('Browser inspection execution deadline exceeded');
    void close();
  }, timeoutMs) : undefined;
  return {
    throwIfStopped() { signal?.throwIfAborted(); if (timeoutError) throw timeoutError; },
    async dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      await close();
    },
  };
}
