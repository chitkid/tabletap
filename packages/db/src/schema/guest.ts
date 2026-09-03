import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './helpers';
import { tables } from './restaurant';

export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: id(),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [index('guest_sessions_expires_at_idx').on(t.expiresAt)],
);
