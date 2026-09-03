export interface DemoResetLog {
  info(msg: string): void;
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
      .then(() => input.log.info('demo data reset'))
      .catch((err: unknown) => input.log.error({ err }, 'demo reset failed'))
      .finally(() => {
        running = false;
      });
  }, input.intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
