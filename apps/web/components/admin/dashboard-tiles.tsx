import type { DashboardResponse } from '@tabletap/shared';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { formatCents } from '../../lib/money';

/**
 * The four figures the day is judged on. The money is formatted in the restaurant's own currency,
 * which is why `currency` is a required prop rather than a default: an admin screen that quietly
 * prints dollars over a rouble restaurant's takings is worse than one that will not compile.
 */
export function DashboardTiles({
  today,
  currency,
}: {
  today: DashboardResponse['today'];
  currency: string;
}) {
  const t = useTranslations('admin.today');

  /**
   * A duration an operator reads at a glance: seconds alone under a minute, minutes and seconds
   * above it. Never hours — a kitchen whose average time to ready has passed sixty minutes has a
   * problem this tile is not the place to describe.
   *
   * The units are two dictionary messages rather than a suffix glued on here, because «мин» and
   * «с» are words: the same reason `lib/elapsed.ts` stopped wording its own output in Task 5.
   * Both bind the number to its unit with U+00A0, per docs/design/02b-copy-ru.md.
   */
  const formatDuration = (ms: number): string => {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return t('seconds', { s: seconds });
    return t('minutesSeconds', { m: Math.floor(seconds / 60), s: seconds % 60 });
  };

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-4">
      <h1 id="today-heading" className="font-display text-2xl font-semibold">
        {t('heading')}
      </h1>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={t('orders')}>{today.orders}</Tile>
        <Tile label={t('revenue')}>{formatCents(today.revenueCents, currency)}</Tile>
        <Tile label={t('averageReady')}>
          {today.averageReadyMs === null ? (
            // Not a zero: nothing was measured, and a `0 с` average would read as a kitchen that
            // plates instantly. The dash is for the eye; the sentence is what is announced.
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{t('nothingReady')}</span>
            </>
          ) : (
            formatDuration(today.averageReadyMs)
          )}
        </Tile>
        <Tile label={t('openTickets')}>{today.openTickets}</Tile>
      </dl>
    </section>
  );
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card px-4 py-4 shadow-sm">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
