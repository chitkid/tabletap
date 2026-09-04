'use client';
import { useEffect, useRef } from 'react';

/**
 * Runs whenever the browser hands this page back from the back-forward cache.
 *
 * A control that starts something and then navigates away — the Pay button, the demo terminal —
 * has to stay busy through the navigation, or a second press would open a second attempt while
 * the first is still loading. But a bfcache restore does not re-run the module, re-mount the
 * tree or reset a single `useState`: the whole JS heap comes back exactly as it left. So Back,
 * the likeliest gesture on a payment screen, returns a page whose only control is disabled for
 * good, and nothing short of a reload frees it.
 *
 * `pageshow` fires on an ordinary load too, which is why `persisted` is the condition: this must
 * mean "restored", not "shown". The callback is held in a ref — written in an effect, never
 * during render — so an inline arrow at the call site does not re-subscribe on every render.
 */
export function usePageRestore(onRestore: () => void): void {
  const latest = useRef(onRestore);
  useEffect(() => {
    latest.current = onRestore;
  }, [onRestore]);
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) latest.current();
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);
}
