import { verifyTableToken } from '@tabletap/shared/server';
import { DemoLinksResponseSchema, RushResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@tabletap/db/testing';
import { seed } from '@tabletap/db/seed';
import { buildApp } from '../server';
import { TEST_CONFIG, TEST_DEMO_PASSWORD, createTestApp } from '../test/helpers';

describe('GET /api/demo/links', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('returns a signed guest url for table 7, the staff accounts and the reset interval', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/demo/links' });
    expect(res.statusCode).toBe(200);
    const body = DemoLinksResponseSchema.parse(res.json());
    expect(body.guest.tableNumber).toBe(7);
    expect(body.guest.url.startsWith(`${TEST_CONFIG.WEB_ORIGIN}/t/`)).toBe(true);
    const claims = await verifyTableToken(body.guest.url.split('/t/')[1]!, {
      secret: TEST_CONFIG.TABLE_TOKEN_SECRET,
    });
    expect(claims.tableNumber).toBe(7);
    expect(body.staff.map((s) => [s.role, s.email, s.name])).toEqual([
      ['admin', 'admin@littlefurnace.demo', 'Mara Quinn'],
      ['kitchen', 'kitchen@littlefurnace.demo', 'Theo Baptiste'],
      ['waiter', 'waiter@littlefurnace.demo', 'Jun Okafor'],
    ]);
    expect(body.staff.every((s) => s.password === TEST_DEMO_PASSWORD)).toBe(true);
    expect(body.resetsEveryMinutes).toBeNull();
  });
  it('is 404 when demo mode is off', async () => {
    const { db, close } = await createTestDb();
    await seed(db, {
      mode: 'reset',
      demoPassword: TEST_DEMO_PASSWORD,
      tableTokenSecret: TEST_CONFIG.TABLE_TOKEN_SECRET,
      tableTokenTtlDays: 1,
      webOrigin: TEST_CONFIG.WEB_ORIGIN,
    });
    const app = await buildApp({
      db,
      config: { ...TEST_CONFIG, DEMO_MODE: 'false', demoMode: false },
      logger: false,
    });
    const res = await app.inject({ method: 'GET', url: '/api/demo/links' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    await app.close();
    await close();
  });
  // Every landing render asks for these links from the web container, so one ip is every
  // visitor. The limit is a runaway guard, not a per-visitor budget.
  // Own app, so the bucket starts full and the count is exact.
  it('is rate-limited to 300 per minute per ip', async () => {
    const own = await createTestApp();
    const statuses: number[] = [];
    for (let i = 0; i < 301; i++)
      statuses.push((await own.app.inject({ method: 'GET', url: '/api/demo/links' })).statusCode);
    await own.close();
    expect(statuses.filter((s) => s !== 200)).toEqual([429]);
    expect(statuses.at(-1)).toBe(429);
  });
  it('tells the landing which payment provider is live', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/demo/links' });
    expect(DemoLinksResponseSchema.parse(res.json()).payments).toEqual({
      provider: 'demo',
      testCard: null,
    });
  });
  // The hardcoded demo-mode block already satisfies the assertion above, so it cannot prove the
  // route reads config.paymentProvider rather than a constant. This is the RED case: it only
  // passes once the route actually branches on config.
  it('tells the landing when Stripe is the live provider', async () => {
    const stripeCtx = await createTestApp({
      config: {
        ...TEST_CONFIG,
        paymentProvider: 'stripe',
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: 'whsec_x',
      },
    });
    const res = await stripeCtx.app.inject({ method: 'GET', url: '/api/demo/links' });
    expect(DemoLinksResponseSchema.parse(res.json()).payments).toEqual({
      provider: 'stripe',
      testCard: '4242 4242 4242 4242',
    });
    await stripeCtx.close();
  });
});

describe('POST /api/demo/rush', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.rush.stop();
    await ctx.close();
  });

  it('starts a rush once and answers 409 while it runs', async () => {
    const first = await ctx.app.inject({ method: 'POST', url: '/api/demo/rush' });
    expect(first.statusCode).toBe(200);
    expect(RushResponseSchema.parse(first.json())).toEqual({
      started: true,
      durationSeconds: 60,
      ordersPlanned: 12,
    });
    const second = await ctx.app.inject({ method: 'POST', url: '/api/demo/rush' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('CONFLICT');
  });
});
