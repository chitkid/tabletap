import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { signTableToken } from '@tabletap/shared/server';
import { ClaimResponseSchema, MeResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, createTestApp } from '../test/helpers';

describe('POST /api/guest/claim', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let restaurantId: string;
  const tokenFor = async (tableNumber: number, extra: { secret?: string; ttlSeconds?: number; now?: Date } = {}) => {
    const [t] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, tableNumber));
    return signTableToken({ tableId: t!.id, restaurantId, tableNumber }, { secret: extra.secret ?? TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: extra.ttlSeconds ?? 3600, now: extra.now });
  };
  const claim = (token: string) => ctx.app.inject({ method: 'POST', url: '/api/guest/claim', payload: { token } });

  beforeAll(async () => {
    ctx = await createTestApp();
    const [r] = await ctx.db.select().from(schema.restaurants);
    restaurantId = r!.id;
  });
  afterAll(async () => { await ctx.close(); });

  it('claims table 7, sets a signed httpOnly cookie and writes an audit row', async () => {
    const res = await claim(await tokenFor(7));
    expect(res.statusCode).toBe(200);
    const body = ClaimResponseSchema.parse(res.json());
    expect(body.table).toMatchObject({ number: 7, label: 'Table 7' });
    const cookie = res.cookies.find((c) => c.name === 'tt_guest');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/');
    const audit = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'guest.claimed'));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(body.table.id);
  });
  it('makes /api/me report the guest principal', async () => {
    const res = await claim(await tokenFor(5));
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(MeResponseSchema.parse(me.json()).principal).toMatchObject({ kind: 'guest', tableNumber: 5 });
  });
  it('rejects a bad signature with 401 TOKEN_INVALID', async () => {
    const res = await claim(await tokenFor(7, { secret: 'another-secret-another-secret-12345678' }));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_INVALID');
  });
  it('rejects an expired token with 401 TOKEN_EXPIRED', async () => {
    const res = await claim(await tokenFor(7, { ttlSeconds: 60, now: new Date(Date.now() - 120_000) }));
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
    const token = await signTableToken({ tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', restaurantId, tableNumber: 99 }, { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 });
    expect((await claim(token)).statusCode).toBe(404);
  });
  it('validates the body', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/guest/claim', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
  it('treats a forged guest cookie as anonymous and clears it', async () => {
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'tt_guest=forged.value' } });
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
    const raw = res.cookies.find((c) => c.name === 'tt_guest')!.value;
    const sessionId = ctx.app.unsignCookie(raw).value!;
    await ctx.db.update(schema.guestSessions).set({ lastSeenAt: new Date(Date.now() - 6 * 60_000) }).where(eq(schema.guestSessions.id, sessionId));
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    const after = MeResponseSchema.parse(me.json()).principal;
    expect(after.kind).toBe('guest');
    if (after.kind === 'guest') expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(new Date(before).getTime());
  });
  it('rate-limits claims to 20 per minute per IP', async () => {
    const token = await tokenFor(1);
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await claim(token)).statusCode;
    expect(last).toBe(429);
  });
});
