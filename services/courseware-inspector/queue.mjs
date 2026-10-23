export class InspectionQueueError extends Error {
  constructor(message, status = 429) { super(message); this.status = status; }
}

// FIFO admission prevents one deck's consecutive frames from starving another deck.
// Only admitted work allocates a browser context. Both queue length and waiting time are bounded.
export class InspectionQueue {
  #active = 0;
  #waiting = [];
  constructor({ concurrency = 1, maxQueued = 12, waitTimeoutMs = 45000 } = {}) {
    if (![concurrency, maxQueued, waitTimeoutMs].every(Number.isInteger) || concurrency < 1 || maxQueued < 0 || waitTimeoutMs < 1) throw new Error('Invalid inspection capacity');
    this.concurrency = concurrency; this.maxQueued = maxQueued; this.waitTimeoutMs = waitTimeoutMs;
  }
  get active() { return this.#active; }
  get queued() { return this.#waiting.length; }
  run(work, { signal, waitTimeoutMs = this.waitTimeoutMs } = {}) {
    if (!Number.isInteger(waitTimeoutMs) || waitTimeoutMs < 1 || waitTimeoutMs > this.waitTimeoutMs)
      return Promise.reject(new InspectionQueueError('Invalid inspection wait budget', 400));
    if (signal?.aborted) return Promise.reject(new InspectionQueueError('Inspection canceled', 499));
    if (this.#active >= this.concurrency && this.#waiting.length >= this.maxQueued) return Promise.reject(new InspectionQueueError('Inspector queue is full'));
    return new Promise((resolve, reject) => {
      const item = { work, resolve, reject, signal, cleanup: () => {} };
      if (this.#active < this.concurrency) return this.#start(item);
      const remove = error => {
        const index = this.#waiting.indexOf(item);
        if (index < 0) return;
        this.#waiting.splice(index, 1); item.cleanup(); reject(error);
      };
      const abort = () => remove(new InspectionQueueError('Inspection canceled', 499));
      const timer = setTimeout(() => remove(new InspectionQueueError('Inspector queue wait expired')), waitTimeoutMs);
      item.cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      this.#waiting.push(item);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  #start(item) {
    item.cleanup(); this.#active++;
    Promise.resolve().then(() => {
      if (item.signal?.aborted) throw new InspectionQueueError('Inspection canceled', 499);
      return item.work();
    }).then(item.resolve, item.reject).finally(() => {
      this.#active--;
      const next = this.#waiting.shift();
      if (next) this.#start(next);
    });
  }
}
