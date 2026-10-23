import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CinematicExecution,
  CinematicExecutionError,
  CINEMATIC_3D_EXECUTION_TIMEOUT_MS,
  CINEMATIC_EXECUTION_TIMEOUT_MS,
  CINEMATIC_MODEL_CALL_TIMEOUT_MS,
  CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS,
  cinematicExecutionBudget,
} from '@/lib/server/cinematic-execution';

describe('bounded cinematic execution', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('propagates a real abort signal and releases timers after completion', async () => {
    const parent = new AbortController();
    const execution = new CinematicExecution(parent.signal);
    const operation = vi.fn(async (signal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      return 'complete';
    });
    expect(await execution.call(operation)).toBe('complete');
    expect(vi.getTimerCount()).toBe(1);
    execution.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the provider and prevents subsequent calls after a per-call timeout', async () => {
    const execution = new CinematicExecution();
    let signal: AbortSignal | undefined;
    const pending = execution.call((s) => {
      signal = s;
      return new Promise(() => {});
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'CinematicExecutionError',
      reason: 'model-timeout',
    });
    await vi.advanceTimersByTimeAsync(CINEMATIC_MODEL_CALL_TIMEOUT_MS);
    await rejected;
    expect(signal?.aborted).toBe(true);
    const next = vi.fn(async () => 'must not run');
    await expect(execution.call(next)).rejects.toBeInstanceOf(CinematicExecutionError);
    expect(next).not.toHaveBeenCalled();
    execution.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a fresh provider call after a recoverable per-call timeout', async () => {
    const execution = new CinematicExecution();
    let signal: AbortSignal | undefined;
    const pending = execution.call(
      (current) => {
        signal = current;
        return new Promise(() => {});
      },
      { recoverableTimeout: true, timeoutMs: 100 },
    );
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'model-timeout' });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(signal?.aborted).toBe(true);
    await expect(execution.call(async () => 'recovered')).resolves.toBe('recovered');
    execution.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('enforces one absolute non-3D budget across otherwise successful calls', async () => {
    expect(CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS).toBeLessThan(1_200_000);
    const execution = new CinematicExecution();
    const successfulCalls = Math.floor(CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS / 110_000);
    for (let n = 0; n < successfulCalls; n++) {
      const pending = execution.call(
        () => new Promise((resolve) => setTimeout(() => resolve('ok'), 110_000)),
      );
      await vi.advanceTimersByTimeAsync(110_000);
      await expect(pending).resolves.toBe('ok');
    }
    const pending = execution.call(() => new Promise(() => {}));
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'budget-exhausted' });
    await vi.advanceTimersByTimeAsync(CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS - successfulCalls * 110_000);
    await rejected;
    execution.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('extends the same absolute request deadline only after verified 3D routing', async () => {
    expect(CINEMATIC_EXECUTION_TIMEOUT_MS).toBe(CINEMATIC_3D_EXECUTION_TIMEOUT_MS);
    expect(cinematicExecutionBudget('three-dimensional')).toBeLessThan(1_800_000);
    const execution = new CinematicExecution();
    await vi.advanceTimersByTimeAsync(CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS - 10_000);
    execution.setMode('three-dimensional');
    expect(execution.budget).toMatchObject({ mode: 'three-dimensional', budgetMs: CINEMATIC_3D_EXECUTION_TIMEOUT_MS });
    for (let index = 0; index < 3; index += 1) {
      const completed = execution.call(() => new Promise((resolve) => setTimeout(() => resolve('ok'), 170_000)));
      await vi.advanceTimersByTimeAsync(170_000);
      await expect(completed).resolves.toBe('ok');
    }
    const pending = execution.call(() => new Promise(() => {}));
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'budget-exhausted' });
    await vi.advanceTimersByTimeAsync(CINEMATIC_3D_EXECUTION_TIMEOUT_MS - CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS + 10_000 - 510_000);
    await rejected;
    execution.dispose();
  });

  it('counts routing and queue setup time against the request budget', async () => {
    const startedAt = Date.now() - CINEMATIC_NON_3D_EXECUTION_TIMEOUT_MS + 2_000;
    const execution = new CinematicExecution(undefined, startedAt);
    const pending = execution.call(() => new Promise(() => {}));
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'budget-exhausted' });
    await vi.advanceTimersByTimeAsync(2_000);
    await rejected;
    execution.dispose();
  });

  it('disconnecting aborts parallel calls without another provider request', async () => {
    const parent = new AbortController();
    const execution = new CinematicExecution(parent.signal);
    const pending = [
      execution.call(() => new Promise(() => {})),
      execution.call(() => new Promise(() => {})),
    ];
    const rejected = pending.map((item) =>
      expect(item).rejects.toMatchObject({ reason: 'disconnected' }),
    );
    parent.abort();
    await Promise.all(rejected);
    execution.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not call a provider for an already disconnected request', async () => {
    const parent = new AbortController();
    parent.abort();
    const execution = new CinematicExecution(parent.signal);
    const operation = vi.fn(async () => 'unused');
    await expect(execution.call(operation)).rejects.toMatchObject({ reason: 'disconnected' });
    expect(operation).not.toHaveBeenCalled();
    execution.dispose();
  });

  it('disposal stops outstanding sibling work and detaches the parent listener', async () => {
    const parent = new AbortController();
    const remove = vi.spyOn(parent.signal, 'removeEventListener');
    const execution = new CinematicExecution(parent.signal);
    const pending = execution.call(() => new Promise(() => {}));
    const rejected = expect(pending).rejects.toMatchObject({ reason: 'closed' });
    execution.dispose();
    await rejected;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
