import { eq, sql, type SQL } from 'drizzle-orm';
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
 * One day's worth of the week strip: its date label in the restaurant's own calendar, and how
 * many orders were paid within it. `bucketStart`/`bucketEnd` are themselves restaurant-day
 * boundaries from `localMidnight`, so this reuses the same DST-safe arithmetic as `today`.
 */
async function weekDay(
  db: Db,
  restaurantId: string,
  tz: string,
  bucketStart: SQL,
  bucketEnd: SQL,
): Promise<{ date: string; orders: number }> {
  const [row] = await db
    .select({
      date: sql<string>`to_char(${bucketStart} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      orders: sql<number>`count(*) filter (where ${schema.orders.paidAt} >= ${bucketStart} and ${schema.orders.paidAt} < ${bucketEnd})::int`,
    })
    .from(schema.orders)
    .where(eq(schema.orders.restaurantId, restaurantId));
  if (!row) throw new Error('week aggregate returned no row');
  return row;
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
 * average, not yesterday's. These two filters are written out separately below (never shared)
 * precisely so a later reader cannot assume they pick out the same orders.
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

  // Seven local days ending today, oldest first, each computed the same DST-safe way as `today`.
  const week = await Promise.all(
    [6, 5, 4, 3, 2, 1, 0].map((daysAgo) =>
      weekDay(
        db,
        restaurantId,
        tz,
        localMidnight(now, tz, daysAgo),
        localMidnight(now, tz, daysAgo - 1),
      ),
    ),
  );

  return { today, week };
}
