export const CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS = 1_170_000;
export const CINEMATIC_3D_EXECUTION_TIMEOUT_MS = 1_770_000;
export const CINEMATIC_EXECUTION_TIMEOUT_MS = CINEMATIC_3D_EXECUTION_TIMEOUT_MS;
export const CINEMATIC_MODEL_CALL_TIMEOUT_MS = 480_000;
export type CinematicCallOptions = { recoverableTimeout?: boolean; timeoutMs?: number };
export type CinematicExecutionMode = 'non-3d' | 'three-dimensional';

export function cinematicExecutionBudget(mode: CinematicExecutionMode) {
  return mode === 'three-dimensional'
    ? CINEMATIC_3D_EXECUTION_TIMEOUT_MS
    : CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS;
}

export class CinematicExecutionError extends Error {
  constructor(public readonly reason: 'budget-exhausted' | 'model-timeout' | 'model-truncated' | 'disconnected' | 'closed') {
    super(`Cinematic execution stopped: ${reason}`);
    this.name = 'CinematicExecutionError';
  }
}

export class CinematicExecution {
  private readonly controller = new AbortController();
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private mode: CinematicExecutionMode = 'non-3d';
  private readonly disconnect = () => this.stop('disconnected');

  constructor(private readonly parent?: AbortSignal, private readonly startedAt = Date.now()) {
    this.scheduleDeadline();
    parent?.addEventListener('abort', this.disconnect, { once: true });
    if (parent?.aborted) this.disconnect();
  }

  private scheduleDeadline() {
    if (this.deadline) clearTimeout(this.deadline);
    const remaining = this.startedAt + cinematicExecutionBudget(this.mode) - Date.now();
    if (remaining <= 0) this.stop('budget-exhausted');
    else this.deadline = setTimeout(() => this.stop('budget-exhausted'), remaining);
  }

  setMode(mode: CinematicExecutionMode) {
    if (this.mode === mode || this.controller.signal.aborted) return;
    this.mode = mode;
    this.scheduleDeadline();
  }

  get budget() {
    return {
      mode: this.mode,
      budgetMs: cinematicExecutionBudget(this.mode),
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
    };
  }

  private stop(reason: CinematicExecutionError['reason']) {
    if (!this.controller.signal.aborted) this.controller.abort(new CinematicExecutionError(reason));
  }

  throwIfStopped() {
    this.controller.signal.throwIfAborted();
  }

  get signal() {
    return this.controller.signal;
  }

  async call<T>(operation: (signal: AbortSignal) => Promise<T>, options: CinematicCallOptions = {}): Promise<T> {
    this.throwIfStopped();
    const local = new AbortController();
    const stopLocal = () => local.abort(this.controller.signal.reason);
    this.controller.signal.addEventListener('abort', stopLocal, { once: true });
    const signal = local.signal;
    const timeout = Math.max(1, Math.min(CINEMATIC_MODEL_CALL_TIMEOUT_MS, options.timeoutMs ?? CINEMATIC_MODEL_CALL_TIMEOUT_MS));
    const timer = setTimeout(() => options.recoverableTimeout
      ? local.abort(new CinematicExecutionError('model-timeout')) : this.stop('model-timeout'), timeout);
    let rejectOnAbort: (() => void) | undefined;
    try {
      const interrupted = new Promise<never>((_, reject) => {
        rejectOnAbort = () => reject(signal.reason);
        signal.addEventListener('abort', rejectOnAbort, { once: true });
      });
      const result = await Promise.race([operation(signal), interrupted]);
      this.throwIfStopped();
      return result;
    } finally {
      clearTimeout(timer);
      this.controller.signal.removeEventListener('abort', stopLocal);
      if (rejectOnAbort) signal.removeEventListener('abort', rejectOnAbort);
    }
  }

  dispose() {
    if (this.deadline) clearTimeout(this.deadline);
    this.parent?.removeEventListener('abort', this.disconnect);
    this.stop('closed');
  }
}
