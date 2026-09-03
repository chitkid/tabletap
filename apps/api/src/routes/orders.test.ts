import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '@tabletap/db';
import {
  IDEMPOTENCY_KEY_HEADER,
  MenuResponseSchema,
  OrderResponseSchema,
  OrdersResponseSchema,
} from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, signInAs } from '../test/helpers';

describe('orders', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let byName: Record<string, { id: string; priceCents: number }>;
  const post = (cookie: string, payload: object, key: string = randomUUID()) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: key },
      payload,
    });

  beforeAll(async () => {
    ctx = await createTestApp();
    const { cookie } = await claimTable(ctx.app, ctx.db, 1);
    const menu = MenuResponseSchema.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json(),
    );
    byName = Object.fromEntries(
      menu.categories
        .flatMap((c) => c.items)
        .map((i) => [i.name, { id: i.id, priceCents: i.priceCents }]),
    );
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('places an order with prices from the database and writes an audit row', async () => {
    const { cookie, tableId } = await claimTable(ctx.app, ctx.db, 7);
    const res = await post(cookie, {
      items: [
        { menuItemId: byName['Margherita Flatbread']!.id, quantity: 2, priceCents: 1 },
        { menuItemId: byName['House Lemonade']!.id, quantity: 1 },
      ],
      note: 'No basil',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().order).not.toHaveProperty('guestSessionId');
    const { order } = OrderResponseSchema.parse(res.json());
    expect(order).toMatchObject({
      status: 'placed',
      tableId,
      tableNumber: 7,
      note: 'No basil',
      subtotalCents: 2800,
      totalCents: 2800,
    });
    expect(order.number).toBeGreaterThan(0);
    expect(order.placedAt).not.toBeNull();
    expect(
      order.items.map((i) => [i.name, i.unitPriceCents, i.quantity, i.lineTotalCents]),
    ).toEqual([
      ['Margherita Flatbread', 1200, 2, 2400],
      ['House Lemonade', 400, 1, 400],
    ]);
    const audit = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'order.placed'));
    expect(audit.at(-1)?.entityId).toBe(order.id);
  });
  it('rejects a missing or malformed Idempotency-Key', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie },
      payload: { items: [{ menuItemId: byName['House Lemonade']!.id, quantity: 1 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
  it('replays the same key for the same session and refuses it for another session', async () => {
    const key = randomUUID();
    const a = await claimTable(ctx.app, ctx.db, 8);
    const first = await post(
      a.cookie,
      { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 1 }] },
      key,
    );
    const second = await post(
      a.cookie,
      { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 3 }] },
      key,
    );
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().order.id).toBe(first.json().order.id);
    expect(second.json().order.items[0].quantity).toBe(1);
    const b = await claimTable(ctx.app, ctx.db, 9);
    const other = await post(
      b.cookie,
      { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 1 }] },
      key,
    );
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe('CONFLICT');
  });
  it('refuses unavailable items with the names to remove', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const res = await post(cookie, {
      items: [
        { menuItemId: byName['Burrata & Peaches']!.id, quantity: 1 },
        { menuItemId: byName['Marinated Olives']!.id, quantity: 1 },
      ],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'ITEM_UNAVAILABLE',
      details: {
        unavailable: [{ menuItemId: byName['Burrata & Peaches']!.id, name: 'Burrata & Peaches' }],
      },
    });
  });
  it('refuses unknown items and bad quantities', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const unknown = await post(cookie, { items: [{ menuItemId: randomUUID(), quantity: 1 }] });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('VALIDATION_FAILED');
    expect(
      (await post(cookie, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 21 }] }))
        .statusCode,
    ).toBe(400);
  });
  it('is 401 for anonymous and 403 for staff', async () => {
    expect(
      (
        await ctx.app.inject({
          method: 'POST',
          url: '/api/orders',
          headers: { [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
          payload: { items: [] },
        })
      ).statusCode,
    ).toBe(401);
    const staff = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    expect(
      (await post(staff, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 1 }] }))
        .statusCode,
    ).toBe(403);
  });
  it('lets a guest read only their own orders and staff read any', async () => {
    const a = await claimTable(ctx.app, ctx.db, 10);
    const b = await claimTable(ctx.app, ctx.db, 11);
    const created = OrderResponseSchema.parse(
      (
        await post(a.cookie, {
          items: [{ menuItemId: byName['Furnace Potatoes']!.id, quantity: 1 }],
        })
      ).json(),
    ).order;
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: `/api/orders/${created.id}`,
          headers: { cookie: a.cookie },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: `/api/orders/${created.id}`,
          headers: { cookie: b.cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: `/api/orders/${randomUUID()}`,
          headers: { cookie: a.cookie },
        })
      ).statusCode,
    ).toBe(404);
    const staff = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    expect(
      (
        await ctx.app.inject({
          method: 'GET',
          url: `/api/orders/${created.id}`,
          headers: { cookie: staff },
        })
      ).statusCode,
    ).toBe(200);
    const mine = OrdersResponseSchema.parse(
      (
        await ctx.app.inject({ method: 'GET', url: '/api/orders', headers: { cookie: a.cookie } })
      ).json(),
    ).orders;
    expect(mine.map((o) => o.id)).toEqual([created.id]);
    expect(
      OrdersResponseSchema.parse(
        (
          await ctx.app.inject({ method: 'GET', url: '/api/orders', headers: { cookie: b.cookie } })
        ).json(),
      ).orders,
    ).toEqual([]);
    const all = OrdersResponseSchema.parse(
      (
        await ctx.app.inject({ method: 'GET', url: '/api/orders', headers: { cookie: staff } })
      ).json(),
    ).orders;
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all[0]!.number).toBeGreaterThan(all[all.length - 1]!.number);
  });
  it('rate-limits order creation per guest session', async () => {
    const a = await claimTable(ctx.app, ctx.db, 12);
    const b = await claimTable(ctx.app, ctx.db, 2);
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (
        await post(a.cookie, {
          items: [{ menuItemId: byName['Sparkling Water']!.id, quantity: 1 }],
        })
      ).statusCode;
    expect(last).toBe(429);
    expect(
      (
        await post(b.cookie, {
          items: [{ menuItemId: byName['Sparkling Water']!.id, quantity: 1 }],
        })
      ).statusCode,
    ).toBe(201);
  });
});
