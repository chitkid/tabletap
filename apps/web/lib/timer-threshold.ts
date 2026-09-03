import type { OrderDto } from '@tabletap/shared';

export const WARN_AFTER_MS = 5 * 60_000;
export const LATE_AFTER_MS = 10 * 60_000;
export type Threshold = 'ok' | 'warn' | 'late';

export const thresholdFor = (elapsedMs: number): Threshold =>
  elapsedMs >= LATE_AFTER_MS ? 'late' : elapsedMs >= WARN_AFTER_MS ? 'warn' : 'ok';

/** m:ss, or h:mm:ss past an hour. A clock slightly behind the server never shows a negative age. */
export function formatTimer(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, elapsedMs) / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** The timer restarts at each step: waiting, then cooking, then ready. */
export function timerStartOf(order: OrderDto): string {
  const fallback = order.placedAt ?? order.createdAt;
  if (order.status === 'cooking') return order.cookingAt ?? fallback;
  if (order.status === 'ready') return order.readyAt ?? fallback;
  return fallback;
}
