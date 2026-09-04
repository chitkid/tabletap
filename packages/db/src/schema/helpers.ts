import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .$defaultFn(() => uuidv7());
/**
 * `precision: 3` (milliseconds) matters beyond storage: `updated_at` backs the optimistic-locking
 * guard on `menu-admin.ts`'s writes (`WHERE ... AND updated_at = $2`). Left at Postgres's default
 * microsecond precision, a row's stored `now()` carries six fractional digits while Drizzle
 * serialises the JS `Date` it hands back through `.toISOString()`, which only carries three - so a
 * value read, then written straight back as the guard, would never match the row it came from, and
 * every guarded write would refuse with a permanent false conflict. Precision 3 makes the column
 * itself round-trip exactly what a JS `Date` can hold, so no call site needs to know this.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};
