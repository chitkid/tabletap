/** Only failures: a successful run reports itself, with its counts (plugins/demo-reset.ts). */
export interface DemoResetLog {
  error(obj: unknown, msg: string): void;
}

/** Fires `run` every `intervalMs`, skipping a tick while the previous run is still going. */
export function scheduleDemoReset(input: {
  intervalMs: number;
  run: () => Promise<void>;
  log: DemoResetLog;
}): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    input
      .run()
      .catch((err: unknown) => input.log.error({ err }, 'demo reset failed'))
      .finally(() => {
        running = false;
      });
  }, input.intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
