'use client';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * The shared clock. Module load happens on the client moments before hydration, so the first
 * snapshot React reads after hydration is already a real time and it can correct the board in
 * the layout phase, before the first paint.
 */
let current = 0;
if (typeof window !== 'undefined') current = Date.now();

/**
 * One ticking clock for the whole board; every timer derives from it.
 *
 * The board is server-rendered, so the clock cannot be read during render: the server's time and
 * the client's differ by however long the response took, one second of that is a different
 * ticket timer, and React answers a hydration mismatch by discarding the server's HTML and
 * rendering the whole board again. Read as an external store, the server render and the
 * hydrating client render both take the same constant snapshot and agree.
 *
 * That constant is `serverNow`, the API's clock at render time. It used to be zero, which painted
 * every ticket at 0:00 and then grew all of them on hydration — a flash, and most of the page's
 * layout shift. With the real clock the server's HTML is already the truth.
 */
export function useNow(intervalMs = 1_000, serverNow = 0): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      current = Date.now();
      const t = setInterval(() => {
        current = Date.now();
        onChange();
      }, intervalMs);
      return () => clearInterval(t);
    },
    [intervalMs],
  );
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => serverNow,
  );
}
