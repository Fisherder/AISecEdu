export function rethrowStudentTurnAbort(signal: AbortSignal | undefined, error: unknown) {
  signal?.throwIfAborted();
  if (error instanceof Error && error.name === 'AbortError') throw error;
}
