'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { elapsedSince } from '../../lib/elapsed';

/**
 * The one thing on the order page that changes on its own. It is announced politely so a guest
 * listening to the page is told the ticket is ageing without being interrupted mid-sentence.
 *
 * The tick is flushed rather than scheduled: a clock that React is free to defer behind other
 * work can read a minute stale, and this one word is the difference between the live region
 * announcing the time it was rendered at and the time it says.
 */
export function ElapsedSince({ iso, intervalMs = 30_000 }: { iso: string; intervalMs?: number }) {
  const t = useTranslations('guest');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => flushSync(() => setNow(Date.now())), intervalMs);
    return () => clearInterval(tick);
  }, [intervalMs]);
  // Four shapes, four messages, and the union narrows to exactly the numbers each one needs — so
  // an age can neither be worded with a figure it does not have nor lose one it does.
  const age = elapsedSince(iso, now);
  const elapsed =
    age.unit === 'now'
      ? t('elapsed.now')
      : age.unit === 'minutes'
        ? t('elapsed.minutes', { n: age.minutes })
        : age.unit === 'hours'
          ? t('elapsed.hours', { h: age.hours })
          : t('elapsed.hoursMinutes', { h: age.hours, m: age.minutes });
  return (
    <p role="status" aria-live="polite" className="text-muted-foreground">
      {t('order.placedAgo', { elapsed })}
    </p>
  );
}
