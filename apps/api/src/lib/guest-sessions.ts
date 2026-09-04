import { and, eq, gt } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyRequest } from 'fastify';
import type { Config } from '../config';

export const GUEST_COOKIE = 'tt_guest';
export const SLIDE_AFTER_MS = 5 * 60 * 1000;

// Guards the query helpers against non-uuid input (e.g. a forged cookie value) so
// Postgres never sees an invalid uuid literal and raises instead of returning nothing.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hoursFrom = (now: Date, hours: number) => new Date(now.getTime() + hours * 3_600_000);

/** The single definition of the tt_guest cookie: the claim route and the sliding hook must agree. */
export function guestCookieOptions(config: Config, expiresAt: Date): CookieSerializeOptions {
  return {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    expires: expiresAt,
  };
}

/**
 * One rate-limit bucket per guest session, for every route a guest reaches. The limiter runs at
 * onRequest, so there is no principal yet — and waiting for one would mean not counting the
 * callers the guard turns away. @fastify/cookie is registered first and has already parsed the
 * jar, so the session id comes from the signed cookie; anyone without a valid one shares their
 * ip's bucket.
 */
export function guestKey(request: FastifyRequest): string {
  const raw = request.cookies[GUEST_COOKIE];
  const unsigned = raw ? request.unsignCookie(raw) : null;
  return unsigned?.valid && unsigned.value ? `guest:${unsigned.value}` : `ip:${request.ip}`;
}

export async function createGuestSession(
  db: Db,
  input: { tableId: string; ttlHours: number; now?: Date },
) {
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(schema.guestSessions)
    .values({
      tableId: input.tableId,
      expiresAt: hoursFrom(now, input.ttlHours),
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.guestSessions.id, expiresAt: schema.guestSessions.expiresAt });
  if (!row) throw new Error('guest session insert returned nothing');
  return row;
}

export async function findActiveGuestSession(db: Db, id: string, now: Date = new Date()) {
  if (!UUID.test(id)) return null;
  const [row] = await db
    .select({
      id: schema.guestSessions.id,
      tableId: schema.guestSessions.tableId,
      restaurantId: schema.tables.restaurantId,
      tableNumber: schema.tables.number,
      expiresAt: schema.guestSessions.expiresAt,
      lastSeenAt: schema.guestSessions.lastSeenAt,
    })
    .from(schema.guestSessions)
    // Deactivating a table must end the sessions sitting at it, not only stop new claims.
    .innerJoin(
      schema.tables,
      and(eq(schema.tables.id, schema.guestSessions.tableId), eq(schema.tables.isActive, true)),
    )
    .where(and(eq(schema.guestSessions.id, id), gt(schema.guestSessions.expiresAt, now)));
  return row ?? null;
}

export async function touchGuestSession(
  db: Db,
  id: string,
  input: { ttlHours: number; now?: Date },
): Promise<Date> {
  const now = input.now ?? new Date();
  const expiresAt = hoursFrom(now, input.ttlHours);
  await db
    .update(schema.guestSessions)
    .set({ lastSeenAt: now, expiresAt, updatedAt: now })
    .where(eq(schema.guestSessions.id, id));
  return expiresAt;
}

/** Ends a still-running session; used when the same browser claims another table. */
export async function expireGuestSession(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<void> {
  if (!UUID.test(id)) return;
  await db
    .update(schema.guestSessions)
    .set({ expiresAt: now, updatedAt: now })
    .where(and(eq(schema.guestSessions.id, id), gt(schema.guestSessions.expiresAt, now)));
}
