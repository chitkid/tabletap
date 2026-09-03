import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleDemoReset } from './demo-reset';

describe('scheduleDemoReset', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const log = { error: vi.fn() };

  it('runs on every interval and stops when asked', async () => {
    const run = vi.fn(async () => undefined);
    const stop = scheduleDemoReset({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(2500);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('never overlaps runs and logs failures without dying', async () => {
    let resolveFirst!: () => void;
    const run = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            resolveFirst = r;
          }),
      )
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const stop = scheduleDemoReset({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(2500);
    expect(run).toHaveBeenCalledTimes(1);
    resolveFirst();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });
});
