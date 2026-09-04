import type { DashboardResponse } from '@tabletap/shared';

const EMPTY = 'No orders yet.';

/**
 * The week's days arrive as `YYYY-MM-DD` in the restaurant's own calendar, so they are read back
 * as UTC and printed as UTC: parsing them in the browser's zone would slide a bar a day sideways
 * for anyone west of the restaurant. A day that is not that shape is printed as it arrived rather
 * than as `Invalid Date` — the strip stays legible and the wrong value is visible.
 */
const FULL = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

function labelsFor(date: string): { full: string; weekday: string } {
  const [year, month, day] = date.split('-');
  const at = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (!Number.isFinite(at)) return { full: date, weekday: date };
  const when = new Date(at);
  return { full: FULL.format(when), weekday: WEEKDAY.format(when) };
}

const counted = (orders: number) => `${orders} paid ${orders === 1 ? 'order' : 'orders'}`;

/**
 * Seven days of paid orders as plain CSS bars — a list of days, each a percentage of the busiest
 * one. No chart library and no canvas: seven numbers do not need a rendering engine, and a list
 * with a label per item is readable by a screen reader, which a canvas is not.
 *
 * The days are sorted here rather than trusted in the order they arrived. The API answers oldest
 * first, but `DashboardResponseSchema` types the date as a bare string, so nothing but this line
 * would stop a change at the far end from silently drawing the week backwards.
 */
export function WeekBars({ week }: { week: DashboardResponse['week'] }) {
  const days = [...week].sort((a, b) => a.date.localeCompare(b.date));
  const busiest = days.reduce((top, day) => Math.max(top, day.orders), 0);

  return (
    <section aria-labelledby="week-bars-heading" className="flex flex-col gap-4">
      <h2 id="week-bars-heading" className="font-display text-xl font-semibold">
        Paid orders, last seven days
      </h2>
      {busiest === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY}</p>
      ) : (
        <ol className="flex items-end gap-2 rounded-lg border border-border/60 bg-card p-4 shadow-sm">
          {days.map((day) => {
            const { full, weekday } = labelsFor(day.date);
            return (
              <li
                key={day.date}
                aria-label={`${full}: ${counted(day.orders)}`}
                className="flex min-w-0 flex-1 flex-col gap-2"
              >
                {/* Seven numbers do not need a y axis to be read against: each count is written
                    where it belongs, so nothing has to be estimated from a height. */}
                <span aria-hidden="true" className="text-center text-xs font-semibold tabular-nums">
                  {day.orders}
                </span>
                {/* The track is the definite height the bar's percentage resolves against. */}
                <div className="flex h-40 items-end">
                  <div
                    data-slot="bar"
                    style={{ height: `${Math.round((day.orders / busiest) * 100)}%` }}
                    className="min-h-1 w-full rounded-t-sm bg-primary"
                  />
                </div>
                <span
                  aria-hidden="true"
                  className="truncate text-center text-xs text-muted-foreground"
                >
                  {weekday}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
