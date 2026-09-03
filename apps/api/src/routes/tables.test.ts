import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TableResponseSchema, TablesResponseSchema } from '@tabletap/shared';
import { claimTable, createTestApp, signInAs } from '../test/helpers';

describe('tables routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('GET /api/tables lists 12 tables for staff, ordered by number', async () => {
    const cookie = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/tables', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { tables } = TablesResponseSchema.parse(res.json());
    expect(tables.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it('GET /api/tables is 401 for anonymous and 403 for guests', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/tables' })).statusCode).toBe(401);
    const { cookie } = await claimTable(ctx.app, ctx.db, 3);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/tables', headers: { cookie } })).statusCode,
    ).toBe(403);
  });
  it('GET /api/tables/:id lets a guest read only their own table', async () => {
    const own = await claimTable(ctx.app, ctx.db, 3);
    const other = await claimTable(ctx.app, ctx.db, 4);
    const ok = await ctx.app.inject({
      method: 'GET',
      url: `/api/tables/${own.tableId}`,
      headers: { cookie: own.cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(TableResponseSchema.parse(ok.json()).table.number).toBe(3);
    const denied = await ctx.app.inject({
      method: 'GET',
      url: `/api/tables/${other.tableId}`,
      headers: { cookie: own.cookie },
    });
    expect(denied.statusCode).toBe(403);
  });
  it('GET /api/tables/:id returns any table for staff and 404 for unknown', async () => {
    const cookie = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const { tableId } = await claimTable(ctx.app, ctx.db, 9);
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/tables/${tableId}`, headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    const missing = await ctx.app.inject({
      method: 'GET',
      url: '/api/tables/018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
    const bad = await ctx.app.inject({
      method: 'GET',
      url: '/api/tables/not-a-uuid',
      headers: { cookie },
    });
    expect(bad.statusCode).toBe(400);
  });
});
