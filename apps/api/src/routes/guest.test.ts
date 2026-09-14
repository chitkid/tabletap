import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { signTableToken } from '@tabletap/shared/server';
import { ClaimResponseSchema, MeResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TEST_CONFIG, claimTable, createTestApp } from '../test/helpers';

describe('POST /api/guest/claim', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let restaurantId: string;
  const tokenFor = async (
    tableNumber: number,
    extra: { secret?: string; ttlSeconds?: number; now?: Date } = {},
  ) => {
    const [t] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.number, tableNumber));
    return signTableToken(
      { tableId: t!.id, restaurantId, tableNumber, qrVersion: t!.qrVersion },
      {
        secret: extra.secret ?? TEST_CONFIG.TABLE_TOKEN_SECRET,
        ttlSeconds: extra.ttlSeconds ?? 3600,
        now: extra.now,
      },
    );
  };
  const claim = (token: string) =>
    ctx.app.inject({ method: 'POST', url: '/api/guest/claim', payload: { token } });

  beforeAll(async () => {
    ctx = await createTestApp();
    const [r] = await ctx.db.select().from(schema.restaurants);
    restaurantId = r!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('claims table 7, sets a signed httpOnly cookie and writes an audit row', async () => {
    const res = await claim(await tokenFor(7));
    expect(res.statusCode).toBe(200);
    const body = ClaimResponseSchema.parse(res.json());
    expect(body.table).toMatchObject({ number: 7, label: 'Стол 7' });
    const cookie = res.cookies.find((c) => c.name === 'tt_guest');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/');
    const audit = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'guest.claimed'));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(body.table.id);
  });
  it('makes /api/me report the guest principal', async () => {
    const res = await claim(await tokenFor(5));
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(MeResponseSchema.parse(me.json()).principal).toMatchObject({
      kind: 'guest',
      tableNumber: 5,
      restaurantId,
    });
  });
  it('rejects a bad signature with 401 TOKEN_INVALID', async () => {
    const res = await claim(
      await tokenFor(7, { secret: 'another-secret-another-secret-12345678' }),
    );
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_INVALID');
  });
  it('rejects an expired token with 401 TOKEN_EXPIRED', async () => {
    const res = await claim(
      await tokenFor(7, { ttlSeconds: 60, now: new Date(Date.now() - 120_000) }),
    );
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_EXPIRED');
  });
  it('rejects an inactive table with 404', async () => {
    await ctx.db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.number, 12));
    const res = await claim(await tokenFor(12));
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
  it('rejects a token for an unknown table with 404', async () => {
    const token = await signTableToken(
      {
        tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
        restaurantId,
        tableNumber: 99,
        qrVersion: 1,
      },
      { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 },
    );
    expect((await claim(token)).statusCode).toBe(404);
  });
  it('validates the body', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/guest/claim', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
  it('treats a forged guest cookie as anonymous and clears it', async () => {
    const me = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'tt_guest=forged.value' },
    });
    expect(me.statusCode).toBe(401);
    const cleared = me.cookies.find((c) => c.name === 'tt_guest');
    expect(cleared?.value).toBe('');
  });
  it('slides expiry when the guest is seen again after 5 minutes', async () => {
    const res = await claim(await tokenFor(2));
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const before = ClaimResponseSchema.parse(res.json()).expiresAt;
    // Earlier tests in this file also create guest sessions, so picking "the" row by
    // createdAt order is ambiguous; unsign the cookie set by this claim to target the
    // exact session it refers to.
    const claimCookie = res.cookies.find((c) => c.name === 'tt_guest')!;
    const sessionId = ctx.app.unsignCookie(claimCookie.value).value!;
    await ctx.db
      .update(schema.guestSessions)
      .set({ lastSeenAt: new Date(Date.now() - 6 * 60_000) })
      .where(eq(schema.guestSessions.id, sessionId));
    // Set-Cookie Expires has one-second resolution, so hold the clock still and step it
    // forward: without this the slid expiry lands in the same second as the claim's.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 5_000));
    const me = await ctx.app
      .inject({ method: 'GET', url: '/api/me', headers: { cookie } })
      .finally(() => vi.useRealTimers());
    const after = MeResponseSchema.parse(me.json()).principal;
    expect(after.kind).toBe('guest');
    if (after.kind === 'guest')
      expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(new Date(before).getTime());
    // The browser only learns about the slide if the cookie is re-issued with the new expiry.
    const slidCookie = me.cookies.find((c) => c.name === 'tt_guest');
    expect(slidCookie).toBeDefined();
    expect(ctx.app.unsignCookie(slidCookie!.value).value).toBe(sessionId);
    expect(slidCookie?.httpOnly).toBe(true);
    expect(slidCookie?.path).toBe('/');
    expect(slidCookie!.expires!.getTime()).toBeGreaterThan(claimCookie.expires!.getTime());
  });
  it('drops a guest session whose table has been deactivated', async () => {
    const res = await claim(await tokenFor(6));
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode,
    ).toBe(200);
    await ctx.db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.number, 6));
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(me.cookies.find((c) => c.name === 'tt_guest')?.value).toBe('');
  });
  it('rejects a token whose version is behind the table current version with 401 TOKEN_INVALID', async () => {
    const token = await tokenFor(8);
    await ctx.db.update(schema.tables).set({ qrVersion: 2 }).where(eq(schema.tables.number, 8));
    const res = await claim(token);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_INVALID');
    expect(res.json().error.message).toBe(
      'This QR code is no longer valid. Ask staff for a new one.',
    );
  });
  it('claims successfully with the table current qr version', async () => {
    await ctx.db.update(schema.tables).set({ qrVersion: 2 }).where(eq(schema.tables.number, 9));
    const token = await tokenFor(9);
    const res = await claim(token);
    expect(res.statusCode).toBe(200);
  });
  it('keeps a session claimed before a version bump working', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 10);
    await ctx.db.update(schema.tables).set({ qrVersion: 2 }).where(eq(schema.tables.number, 10));
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });
  it('rate-limits claims to 20 per minute per IP', async () => {
    const token = await tokenFor(1);
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await claim(token)).statusCode;
    expect(last).toBe(429);
  });
});

// Own app so the audit row count below is unambiguous.
describe('POST /api/guest/claim from a browser that already holds a session', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('replaces the previous session instead of leaving two alive', async () => {
    const first = await claimTable(ctx.app, ctx.db, 2);
    const second = await claimTable(ctx.app, ctx.db, 3, { cookie: first.cookie });

    const withOld = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: first.cookie },
    });
    expect(withOld.statusCode).toBe(401);
    const withNew = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: second.cookie },
    });
    expect(MeResponseSchema.parse(withNew.json()).principal).toMatchObject({
      kind: 'guest',
      tableNumber: 3,
    });

    const audit = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'guest.claimed'));
    expect(audit).toHaveLength(2);
    expect(audit.map((a) => a.entityId).sort()).toEqual([first.tableId, second.tableId].sort());
  });
});

// Own app: the describe above has already spent this ip's claim bucket.
describe('POST /api/guest/claim with a body the schema rejects', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp({ seed: false });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('counts every attempt, even the ones validation answers first', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++)
      statuses.push(
        (await ctx.app.inject({ method: 'POST', url: '/api/guest/claim', payload: {} })).statusCode,
      );
    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(400));
    expect(statuses.at(-1)).toBe(429);
  });
});
