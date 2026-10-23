export class ModelCapacityError extends Error { name = 'ModelCapacityError'; }

/** One runtime process owns a FIFO queue shared by every teaching job. */
export class ModelCallGate {
  private active = 0;
  private readonly pending: Array<() => void> = [];
  constructor(private readonly limit: number, private readonly maxPending = 256) {}

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const start = () => {
        signal?.removeEventListener('abort', cancel);
        this.active++;
        resolve();
      };
      const cancel = () => {
        const index = this.pending.indexOf(start);
        if (index >= 0) this.pending.splice(index, 1);
        reject(signal?.reason);
      };
      if (this.active < this.limit) start();
      else if (this.pending.length >= this.maxPending) reject(new ModelCapacityError('Model queue is full; retry later'));
      else {
        this.pending.push(start);
        signal?.addEventListener('abort', cancel, { once: true });
      }
    });
    try {
      signal?.throwIfAborted();
      return await operation();
    } finally {
      this.active--;
      this.pending.shift()?.();
    }
  }
}

const configured = Number(process.env.AISECEDU_MODEL_CONCURRENCY || 4);
const runtime = globalThis as typeof globalThis & { __aiseceduModelCallGate?: ModelCallGate };
export const modelCallGate = runtime.__aiseceduModelCallGate ??= new ModelCallGate(Number.isFinite(configured) ? Math.max(1, Math.min(16, Math.floor(configured))) : 4);
