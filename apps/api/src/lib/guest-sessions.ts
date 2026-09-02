import { and, eq, gt } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';

export const GUEST_COOKIE = 'tt_guest';
export const SLIDE_AFTER_MS = 5 * 60 * 1000;

// Loose uuid-shape check: guards findActiveGuestSession against non-uuid input
// (e.g. a forged cookie value) so Postgres never sees an invalid uuid literal.
const UUID_SHAPE = /^[0-9a-f-]{36}$/i;

const hoursFrom = (now: Date, hours: number) => new Date(now.getTime() + hours * 3_600_000);

export async function createGuestSession(db: Db, input: { tableId: string; ttlHours: number; now?: Date }) {
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(schema.guestSessions)
    .values({ tableId: input.tableId, expiresAt: hoursFrom(now, input.ttlHours), lastSeenAt: now, createdAt: now, updatedAt: now })
    .returning({ id: schema.guestSessions.id, expiresAt: schema.guestSessions.expiresAt });
  if (!row) throw new Error('guest session insert returned nothing');
  return row;
}

export async function findActiveGuestSession(db: Db, id: string, now: Date = new Date()) {
  if (!UUID_SHAPE.test(id)) return null;
  const [row] = await db
    .select({
      id: schema.guestSessions.id,
      tableId: schema.guestSessions.tableId,
      tableNumber: schema.tables.number,
      expiresAt: schema.guestSessions.expiresAt,
      lastSeenAt: schema.guestSessions.lastSeenAt,
    })
    .from(schema.guestSessions)
    .innerJoin(schema.tables, eq(schema.tables.id, schema.guestSessions.tableId))
    .where(and(eq(schema.guestSessions.id, id), gt(schema.guestSessions.expiresAt, now)));
  return row ?? null;
}

export async function touchGuestSession(db: Db, id: string, input: { ttlHours: number; now?: Date }): Promise<Date> {
  const now = input.now ?? new Date();
  const expiresAt = hoursFrom(now, input.ttlHours);
  await db.update(schema.guestSessions).set({ lastSeenAt: now, expiresAt, updatedAt: now }).where(eq(schema.guestSessions.id, id));
  return expiresAt;
}
