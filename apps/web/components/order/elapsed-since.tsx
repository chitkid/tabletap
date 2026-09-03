'use client';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { formatElapsed } from '../../lib/elapsed';

/**
 * The one thing on the order page that changes on its own. It is announced politely so a guest
 * listening to the page is told the ticket is ageing without being interrupted mid-sentence.
 *
 * The tick is flushed rather than scheduled: a clock that React is free to defer behind other
 * work can read a minute stale, and this one word is the difference between the live region
 * announcing the time it was rendered at and the time it says.
 */
export function ElapsedSince({ iso, intervalMs = 30_000 }: { iso: string; intervalMs?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => flushSync(() => setNow(Date.now())), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return (
    <p role="status" aria-live="polite" className="text-muted-foreground">
      {`Placed ${formatElapsed(iso, now)}`}
    </p>
  );
}
