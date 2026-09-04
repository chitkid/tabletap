import type { DashboardResponse } from '@tabletap/shared';
import type { ReactNode } from 'react';
import { formatCents } from '../../lib/money';

const NOTHING_READY = 'No order reached ready today.';

/**
 * A duration an operator reads at a glance: seconds alone under a minute, minutes and seconds
 * above it. Never hours — a kitchen whose average time to ready has passed sixty minutes has a
 * problem this tile is not the place to describe.
 */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/**
 * The four figures the day is judged on. The money is formatted in the restaurant's own currency,
 * which is why `currency` is a required prop rather than a default: an admin screen that quietly
 * prints dollars over a euro restaurant's takings is worse than one that will not compile.
 */
export function DashboardTiles({
  today,
  currency,
}: {
  today: DashboardResponse['today'];
  currency: string;
}) {
  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-4">
      <h1 id="today-heading" className="font-display text-2xl font-semibold">
        Today
      </h1>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Orders">{today.orders}</Tile>
        <Tile label="Revenue">{formatCents(today.revenueCents, currency)}</Tile>
        <Tile label="Average time to ready">
          {today.averageReadyMs === null ? (
            // Not a zero: nothing was measured, and a `0s` average would read as a kitchen that
            // plates instantly. The dash is for the eye; the sentence is what is announced.
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{NOTHING_READY}</span>
            </>
          ) : (
            formatDuration(today.averageReadyMs)
          )}
        </Tile>
        <Tile label="Open tickets">{today.openTickets}</Tile>
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
