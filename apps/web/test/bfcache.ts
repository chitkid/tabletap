import { act } from '@testing-library/react';

/**
 * Simulates the browser handing a page back from the back-forward cache, which is what happens
 * when a guest presses Back. The JS heap survives, so every component is restored with the state
 * it navigated away with — `persisted` is the only thing that distinguishes this from a load.
 * jsdom fires no such event on its own and does not implement `PageTransitionEvent`, so the flag
 * is defined onto a plain event.
 */
export function restoreFromBackForwardCache(): void {
  const event = new Event('pageshow');
  Object.defineProperty(event, 'persisted', { value: true });
  act(() => {
    window.dispatchEvent(event);
  });
}
