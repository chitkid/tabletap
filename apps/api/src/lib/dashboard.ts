import { and, eq, sql, type SQL } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import type { DashboardResponse } from '@tabletap/shared';
import { AppError } from './errors';

/**
 * Local midnight in the restaurant's own timezone, `daysAgo` calendar days before `now`'s local
 * day (negative looks forward instead of back), expressed as the UTC instant Postgres needs for a
 * `timestamptz` comparison.
 *
 * A restaurant's day is not UTC's - two guests paying five minutes apart, either side of midnight
 * UTC, can belong to the same local day if the restaurant's clock has not crossed midnight yet, or
 * to different ones. Every boundary in this file is therefore computed from the restaurant's
 * `timezone` column, never from UTC directly.
 *
 * The day-count subtraction happens on the naive (timezone-free) wall-clock value produced by the
 * first `AT TIME ZONE`, before the second `AT TIME ZONE` turns it back into an instant - so it is
 * exact calendar-day arithmetic ("N local midnights ago"), not "N times 24 hours ago", and the
 * final conversion picks up whichever UTC offset is actually in force on that particular date
 * (correct across a DST change in `tz`, which a fixed-duration subtraction would not be).
 */
function localMidnight(now: Date, tz: string, daysAgo: number): SQL {
  return sql`(
    (date_trunc('day', ${now.toISOString()}::timestamptz AT TIME ZONE ${tz}) - (${daysAgo})::int * interval '1 day')
    AT TIME ZONE ${tz}
  )`;
}

/**
 * Every local day in `[weekStart, dayEnd)` that has at least one paid order, as
 * `'YYYY-MM-DD' -> count`. One query, bounded in its `WHERE` (not only inside a `FILTER`) so it can
 * use `orders_paid_at_idx` - the seven-separate-queries version this replaced had no date predicate
 * in its `WHERE` at all, so each of the seven scanned the restaurant's entire order history to
 * answer one day. A day with zero paid orders is simply absent here; `loadDashboard` zero-fills it
 * against the labels `weekLabels` produces, so the two never need to agree on which days exist.
 */
async function weekCounts(
  db: Db,
  restaurantId: string,
  tz: string,
  weekStart: SQL,
  dayEnd: SQL,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${schema.orders.paidAt} AT TIME ZONE ${tz}), 'YYYY-MM-DD')`,
      orders: sql<number>`count(*)::int`,
    })
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.restaurantId, restaurantId),
        sql`${schema.orders.paidAt} >= ${weekStart}`,
        sql`${schema.orders.paidAt} < ${dayEnd}`,
      ),
    )
    // Grouped by ordinal position (the `date` column above), not by repeating the
    // `date_trunc(... AT TIME ZONE tz)` expression: each `${tz}` embedding binds its own fresh
    // parameter, so a repeated expression would carry a *different* parameter node than the one in
    // the select list, and Postgres's grouped-column check compares expressions structurally,
    // parameters included - it would refuse this query with "must appear in the GROUP BY clause"
    // even though both copies hold the same value at execution time.
    .groupBy(sql`1`);
  return new Map(rows.map((row) => [row.date, row.orders]));
}

/**
 * The week strip's seven date labels, oldest first, in the restaurant's own calendar - computed
 * the same `localMidnight` way as every other boundary in this file, so the keys this zero-fills
 * against are guaranteed to agree with what `weekCounts` groups by (both go through Postgres's own
 * timezone database, never Node's). One row, seven columns, no `orders` table touched at all - this
 * is bookkeeping for the shape of the week, not a metric, so it carries none of `weekCounts`'s
 * scan-cost concern.
 */
async function weekLabels(db: Db, restaurantId: string, tz: string, now: Date): Promise<string[]> {
  const label = (daysAgo: number) =>
    sql<string>`to_char(${localMidnight(now, tz, daysAgo)} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
  const [row] = await db
    .select({
      d6: label(6),
      d5: label(5),
      d4: label(4),
      d3: label(3),
      d2: label(2),
      d1: label(1),
      d0: label(0),
    })
    .from(schema.restaurants)
    .where(eq(schema.restaurants.id, restaurantId));
  if (!row) throw new Error('week label row returned nothing');
  return [row.d6, row.d5, row.d4, row.d3, row.d2, row.d1, row.d0];
}

/**
 * The admin dashboard's numbers, computed as SQL aggregates rather than by loading orders into
 * Node - `count`/`sum`/`avg` with `FILTER` do the counting so no row this restaurant has ever
 * taken crosses the wire just to be summed here.
 *
 * `orders today` and `revenue today` filter on `paid_at` falling in the restaurant's day.
 * `average time to ready` filters on `ready_at` instead - a deliberately different set: an order
 * that later moved on to `served` still counts, because `ready_at` is set once and never cleared,
 * so an order paid yesterday but marked ready just after local midnight still belongs to today's
 * average, not yesterday's (and, symmetrically, an order paid today that only reaches ready after
 * tomorrow's local midnight does not). These two filters are written out separately below (never
 * shared) precisely so a later reader cannot assume they pick out the same orders.
 *
 * Every query in this file stays on drizzle's typed `.select()` with `sql` fragments inside it,
 * rather than dropping to a raw `db.execute()`. That is a deliberate choice, not an oversight: the
 * two drivers this project runs on disagree about what `execute` returns - `postgres-js` in the
 * app, PGlite in the tests - so raw execution would need a shim per driver, and would return
 * `unknown` columns that nothing typechecks. `.select()` costs a few round trips here - the
 * timezone, the day's aggregates, then the week's counts and labels in parallel - and is portable
 * across both.
 */
export async function loadDashboard(
  db: Db,
  restaurantId: string,
  now: Date = new Date(),
): Promise<DashboardResponse> {
  const [restaurant] = await db
    .select({ timezone: schema.restaurants.timezone })
    .from(schema.restaurants)
    .where(eq(schema.restaurants.id, restaurantId));
  if (!restaurant) throw new AppError('NOT_FOUND', 404, 'No restaurant is configured.');
  const tz = restaurant.timezone;

  const dayStart = localMidnight(now, tz, 0);
  const dayEnd = localMidnight(now, tz, -1);
  const weekStart = localMidnight(now, tz, 6);

  const [today] = await db
    .select({
      // Orders today / revenue today: paid_at inside [dayStart, dayEnd).
      orders: sql<number>`count(*) filter (where ${schema.orders.paidAt} >= ${dayStart} and ${schema.orders.paidAt} < ${dayEnd})::int`,
      revenueCents: sql<number>`coalesce(sum(${schema.orders.totalCents}) filter (where ${schema.orders.paidAt} >= ${dayStart} and ${schema.orders.paidAt} < ${dayEnd}), 0)::int`,
      // Average time to ready: ready_at inside [dayStart, dayEnd) - not paid_at. Null with no rows.
      averageReadyMs: sql<
        number | null
      >`round((avg(extract(epoch from (${schema.orders.readyAt} - ${schema.orders.paidAt})) * 1000) filter (where ${schema.orders.readyAt} >= ${dayStart} and ${schema.orders.readyAt} < ${dayEnd}))::numeric)::int`,
      // Open tickets: current state, no day boundary at all.
      openTickets: sql<number>`count(*) filter (where ${schema.orders.status} in ('paid', 'cooking'))::int`,
    })
    .from(schema.orders)
    .where(eq(schema.orders.restaurantId, restaurantId));
  if (!today) throw new Error('today aggregate returned no row');

  // Seven local days ending today, oldest first: one bounded query for the counts that actually
  // happened, zero-filled in Node against a second, orders-free query for the day labels.
  const [counts, labels] = await Promise.all([
    weekCounts(db, restaurantId, tz, weekStart, dayEnd),
    weekLabels(db, restaurantId, tz, now),
  ]);
  const week = labels.map((date) => ({ date, orders: counts.get(date) ?? 0 }));

  return { today, week };
}
