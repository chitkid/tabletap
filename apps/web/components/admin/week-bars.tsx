import type { DashboardResponse } from '@tabletap/shared';
import { useTranslations } from 'next-intl';

/**
 * The week's days arrive as `YYYY-MM-DD` in the restaurant's own calendar, so they are read back
 * as UTC and printed as UTC: parsing them in the browser's zone would slide a bar a day sideways
 * for anyone west of the restaurant. A day that is not that shape is printed as it arrived rather
 * than as `Invalid Date` — the strip stays legible and the wrong value is visible.
 *
 * **`ru-RU`, and it was `en-US` until this milestone.** Dates are the one thing on this surface no
 * dictionary holds — `Intl` writes them — so a translated screen went on printing «Sun, Aug 30»
 * under its Russian heading, with the weekday as the visible part. Anything on this surface that
 * ever prints a time of day belongs in the same formatter, with `hour12: false`: nothing does
 * today, which is why there is no time format here to copy.
 */
const FULL = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const WEEKDAY = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });

function labelsFor(date: string): { full: string; weekday: string } {
  const [year, month, day] = date.split('-');
  const at = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (!Number.isFinite(at)) return { full: date, weekday: date };
  const when = new Date(at);
  return { full: FULL.format(when), weekday: WEEKDAY.format(when) };
}

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
  const t = useTranslations('admin');
  const days = [...week].sort((a, b) => a.date.localeCompare(b.date));
  const busiest = days.reduce((top, day) => Math.max(top, day.orders), 0);

  return (
    <section aria-labelledby="week-bars-heading" className="flex flex-col gap-4">
      <h2 id="week-bars-heading" className="font-display text-xl font-semibold">
        {t('week.heading')}
      </h2>
      {busiest === 0 ? (
        // An invitation rather than a statement of absence, per the copy contract's editorial
        // rules: an owner reading this cannot place an order themselves, so the line says what
        // will fill the chart instead of reporting that nothing has.
        <p className="text-sm text-muted-foreground">{t('week.empty')}</p>
      ) : (
        <ol className="flex items-end gap-2 rounded-lg border border-border/60 bg-card p-4 pt-6 shadow-sm">
          {days.map((day) => {
            const { full, weekday } = labelsFor(day.date);
            return (
              <li
                key={day.date}
                aria-label={t('week.day', {
                  date: full,
                  orders: t('dayOrders', { n: day.orders }),
                })}
                className="flex min-w-0 flex-1 flex-col gap-2"
              >
                {/* The track is the definite height the bar's percentage resolves against. */}
                <div className="flex h-40 items-end">
                  <div
                    data-slot="bar"
                    style={{ height: `${Math.round((day.orders / busiest) * 100)}%` }}
                    className="relative min-h-1 w-full rounded-t-sm bg-primary"
                  >
                    {/* Seven numbers do not need a y axis to be read against: each count rides on
                        top of its own bar, so nothing has to be estimated from a height and a
                        quiet day's zero is not left floating where a busy day's number would be.
                        The list's extra top padding is the room the tallest bar's count sits in. */}
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 -top-4 text-center text-xs font-semibold tabular-nums"
                    >
                      {day.orders}
                    </span>
                  </div>
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
