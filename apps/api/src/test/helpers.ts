import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { seed } from '@tabletap/db/seed';
import { createTestDb } from '@tabletap/db/testing';
import type { Db } from '@tabletap/db';
import { signTableToken } from '@tabletap/shared/server';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config';
import { buildApp } from '../server';

export const TEST_CONFIG: Config = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'pglite://memory',
  BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
  BETTER_AUTH_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECRET: 'test-cookie-secret-0123456789abcdefghijk',
  TABLE_TOKEN_SECRET: 'test-table-token-secret-0123456789abcdef',
  SOCKET_TOKEN_SECRET: 'test-socket-token-secret-0123456789abcdef',
  TABLE_TOKEN_TTL_DAYS: 365,
  GUEST_SESSION_TTL_HOURS: 4,
  LOG_LEVEL: 'silent',
  TRUST_PROXY: 'loopback,uniquelocal',
  cookieSecure: false,
  DEMO_MODE: 'true',
  DEMO_RESET_INTERVAL_MINUTES: 0,
  DEMO_PASSWORD: 'tabletap-demo',
  demoMode: true,
};
export const TEST_DEMO_PASSWORD = 'tabletap-demo';

export async function createTestApp(
  opts: { seed?: boolean; ready?: boolean } = {},
): Promise<{ app: FastifyInstance; db: Db; close: () => Promise<void> }> {
  const { db, close: closeDb } = await createTestDb();
  if (opts.seed !== false) {
    await seed(db, {
      mode: 'reset',
      demoPassword: TEST_DEMO_PASSWORD,
      tableTokenSecret: TEST_CONFIG.TABLE_TOKEN_SECRET,
      tableTokenTtlDays: 365,
      webOrigin: TEST_CONFIG.WEB_ORIGIN,
    });
  }
  const app = await buildApp({ db, config: TEST_CONFIG, logger: false });
  if (opts.ready !== false) {
    await app.ready();
  }
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await closeDb();
    },
  };
}

export async function signInAs(
  app: FastifyInstance,
  email: string,
  password = TEST_DEMO_PASSWORD,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: TEST_CONFIG.WEB_ORIGIN },
    payload: { email, password },
  });
  if (res.statusCode !== 200)
    throw new Error(`sign-in failed for ${email}: ${res.statusCode} ${res.body}`);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Marks an order paid straight in the database. Only `settlePayment` may do this in the running
 * app; tests that need a cookable ticket use this so they do not depend on a payment provider.
 */
export async function payOrder(db: Db, orderId: string, now = new Date()): Promise<void> {
  await db
    .update(schema.orders)
    .set({ status: 'paid', paidAt: now, updatedAt: now })
    .where(eq(schema.orders.id, orderId));
}

export async function claimTable(
  app: FastifyInstance,
  db: Db,
  tableNumber: number,
  opts: { cookie?: string } = {},
): Promise<{ cookie: string; tableId: string }> {
  const [restaurant] = await db.select().from(schema.restaurants);
  const [table] = await db
    .select()
    .from(schema.tables)
    .where(eq(schema.tables.number, tableNumber));
  if (!restaurant || !table) throw new Error(`table ${tableNumber} not seeded`);
  const token = await signTableToken(
    { tableId: table.id, restaurantId: restaurant.id, tableNumber },
    { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 },
  );
  const res = await app.inject({
    method: 'POST',
    url: '/api/guest/claim',
    headers: opts.cookie === undefined ? {} : { cookie: opts.cookie },
    payload: { token },
  });
  if (res.statusCode !== 200) throw new Error(`claim failed: ${res.statusCode} ${res.body}`);
  return { cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; '), tableId: table.id };
}
