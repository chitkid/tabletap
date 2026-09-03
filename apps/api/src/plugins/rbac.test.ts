import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, signInAs } from '../test/helpers';
import { requireAction, requireGuest, requireStaff, roleOf } from './rbac';

describe('rbac guards', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp({ ready: false });
    ctx.app.get('/g/admin-only', { preHandler: requireAction('menu.write') }, async () => ({
      ok: true,
    }));
    ctx.app.get('/g/staff', { preHandler: requireStaff('waiter', 'kitchen') }, async () => ({
      ok: true,
    }));
    ctx.app.get('/g/guest', { preHandler: requireGuest() }, async () => ({ ok: true }));
    await ctx.app.ready();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('roleOf maps principals', () => {
    expect(roleOf({ kind: 'anonymous' })).toBeNull();
    expect(
      roleOf({ kind: 'guest', guestSessionId: 'g', tableId: 't', tableNumber: 1, expiresAt: 'x' }),
    ).toBe('guest');
    expect(roleOf({ kind: 'staff', userId: 'u', email: 'e', name: 'n', role: 'kitchen' })).toBe(
      'kitchen',
    );
  });
  it('anonymous gets 401 everywhere', async () => {
    for (const url of ['/g/admin-only', '/g/staff', '/g/guest']) {
      const res = await ctx.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    }
  });
  it('requireAction consults the matrix', async () => {
    const admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    const waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/g/admin-only', headers: { cookie: admin } }))
        .statusCode,
    ).toBe(200);
    const denied = await ctx.app.inject({
      method: 'GET',
      url: '/g/admin-only',
      headers: { cookie: waiter },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toEqual({
      code: 'FORBIDDEN',
      message: 'You do not have access to this.',
    });
  });
  it('requireStaff accepts listed roles only', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    const { cookie: guest } = await claimTable(ctx.app, ctx.db, 4);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/g/staff', headers: { cookie: kitchen } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/g/staff', headers: { cookie: admin } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/g/staff', headers: { cookie: guest } }))
        .statusCode,
    ).toBe(403);
  });
  it('requireGuest accepts guests only', async () => {
    const { cookie: guest } = await claimTable(ctx.app, ctx.db, 4);
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/g/guest', headers: { cookie: guest } }))
        .statusCode,
    ).toBe(200);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/g/guest', headers: { cookie: kitchen } }))
        .statusCode,
    ).toBe(403);
  });
});
