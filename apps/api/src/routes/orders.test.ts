import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '@tabletap/db';
import {
  ACTIVE_ORDER_STATUSES,
  IDEMPOTENCY_KEY_HEADER,
  MenuResponseSchema,
  OrderResponseSchema,
  OrdersResponseSchema,
} from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, payOrder, signInAs } from '../test/helpers';

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
        { menuItemId: byName['Хачапури по-аджарски']!.id, quantity: 2, priceCents: 1 },
        { menuItemId: byName['Морс из клюквы']!.id, quantity: 1 },
      ],
      note: 'Без кинзы, пожалуйста.',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().order).not.toHaveProperty('guestSessionId');
    const { order } = OrderResponseSchema.parse(res.json());
    expect(order).toMatchObject({
      status: 'placed',
      tableId,
      tableNumber: 7,
      note: 'Без кинзы, пожалуйста.',
      subtotalCents: 164_000,
      totalCents: 164_000,
      currency: 'RUB',
    });
    expect(order.number).toBeGreaterThan(0);
    expect(order.placedAt).not.toBeNull();
    expect(order).toMatchObject({
      cookingAt: null,
      readyAt: null,
      servedAt: null,
      cancelledAt: null,
    });
    expect(order.updatedAt).toBe(order.createdAt);
    expect(
      order.items.map((i) => [i.name, i.unitPriceCents, i.quantity, i.lineTotalCents]),
    ).toEqual([
      ['Хачапури по-аджарски', 69_000, 2, 138_000],
      ['Морс из клюквы', 26_000, 1, 26_000],
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
      payload: { items: [{ menuItemId: byName['Морс из клюквы']!.id, quantity: 1 }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
  it('replays the same key for the same session and refuses it for another session', async () => {
    const key = randomUUID();
    const a = await claimTable(ctx.app, ctx.db, 8);
    const first = await post(
      a.cookie,
      { items: [{ menuItemId: byName['Раф с облепихой']!.id, quantity: 1 }] },
      key,
    );
    const second = await post(
      a.cookie,
      { items: [{ menuItemId: byName['Раф с облепихой']!.id, quantity: 3 }] },
      key,
    );
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().order.id).toBe(first.json().order.id);
    expect(second.json().order.items[0].quantity).toBe(1);
    const b = await claimTable(ctx.app, ctx.db, 9);
    const other = await post(
      b.cookie,
      { items: [{ menuItemId: byName['Раф с облепихой']!.id, quantity: 1 }] },
      key,
    );
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe('CONFLICT');
  });
  it('refuses unavailable items with the names to remove', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const res = await post(cookie, {
      items: [
        { menuItemId: byName['Баклажаны с ореховым соусом']!.id, quantity: 1 },
        { menuItemId: byName['Тандырная лепёшка']!.id, quantity: 1 },
      ],
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({
      code: 'ITEM_UNAVAILABLE',
      details: {
        unavailable: [
          {
            menuItemId: byName['Баклажаны с ореховым соусом']!.id,
            name: 'Баклажаны с ореховым соусом',
          },
        ],
      },
    });
  });
  it('refuses unknown items and bad quantities', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const unknown = await post(cookie, { items: [{ menuItemId: randomUUID(), quantity: 1 }] });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('VALIDATION_FAILED');
    expect(
      (await post(cookie, { items: [{ menuItemId: byName['Раф с облепихой']!.id, quantity: 21 }] }))
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
      (await post(staff, { items: [{ menuItemId: byName['Раф с облепихой']!.id, quantity: 1 }] }))
        .statusCode,
    ).toBe(403);
  });
  it('lets a guest read only their own orders and staff read any', async () => {
    const a = await claimTable(ctx.app, ctx.db, 10);
    const b = await claimTable(ctx.app, ctx.db, 11);
    const created = OrderResponseSchema.parse(
      (
        await post(a.cookie, {
          items: [{ menuItemId: byName['Соленья из бочки']!.id, quantity: 1 }],
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
          items: [{ menuItemId: byName['Чай с чабрецом']!.id, quantity: 1 }],
        })
      ).statusCode;
    expect(last).toBe(429);
    expect(
      (
        await post(b.cookie, {
          items: [{ menuItemId: byName['Чай с чабрецом']!.id, quantity: 1 }],
        })
      ).statusCode,
    ).toBe(201);
  });

  describe('orders: events and the active list', () => {
    it('emits order:created with the internal DTO after a guest places an order', async () => {
      const { cookie } = await claimTable(ctx.app, ctx.db, 5);
      const seen: string[] = [];
      ctx.app.orderEvents.once('order:created', (o) =>
        seen.push(`${o.tableNumber}:${o.status}:${o.restaurantId.length}`),
      );
      const res = await post(cookie, {
        items: [{ menuItemId: byName['Раф с облепихой']!.id, quantity: 1 }],
      });
      expect(res.statusCode).toBe(201);
      expect(seen).toEqual(['5:placed:36']);
    });
    it('GET /api/orders?active=1 lists active orders for staff, oldest first', async () => {
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/orders?active=1',
        headers: { cookie: kitchen },
      });
      expect(res.statusCode).toBe(200);
      const { orders } = OrdersResponseSchema.parse(res.json());
      expect(orders.length).toBeGreaterThan(1);
      for (const o of orders) expect(ACTIVE_ORDER_STATUSES).toContain(o.status);
      const times = orders.map((o) => Date.parse(o.placedAt ?? o.createdAt));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });
    it('rejects a malformed active flag and ignores it for guests', async () => {
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      expect(
        (
          await ctx.app.inject({
            method: 'GET',
            url: '/api/orders?active=yes',
            headers: { cookie: kitchen },
          })
        ).statusCode,
      ).toBe(400);
      const { cookie } = await claimTable(ctx.app, ctx.db, 5);
      expect(
        (
          await ctx.app.inject({
            method: 'GET',
            url: '/api/orders?active=1',
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(200);
    });
  });

  describe('POST /api/orders/:id/transition', () => {
    const place = async (tableNumber: number) => {
      const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
      const res = await post(cookie, {
        items: [{ menuItemId: byName['Морс из клюквы']!.id, quantity: 1 }],
      });
      return OrderResponseSchema.parse(res.json()).order;
    };
    const bump = (cookie: string, id: string, to: string) =>
      ctx.app.inject({
        method: 'POST',
        url: `/api/orders/${id}/transition`,
        headers: { cookie },
        payload: { to },
      });

    it('lets the kitchen walk a ticket to served and answers each step with the order', async () => {
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      const order = await place(9);
      await payOrder(ctx.db, order.id);
      for (const to of ['cooking', 'ready', 'served']) {
        const res = await bump(kitchen, order.id, to);
        expect(res.statusCode).toBe(200);
        expect(OrderResponseSchema.parse(res.json()).order.status).toBe(to);
        expect(res.json().order).not.toHaveProperty('guestSessionId');
      }
    });
    it('answers with paidAt once the money has settled, and with null before', async () => {
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      const order = await place(9);
      // Straight off the response the route already sent: the schema lets the field through
      // rather than stripping it, so a guest surface can time the wait from the payment.
      expect(order.paidAt).toBeNull();
      const paidAt = new Date();
      await payOrder(ctx.db, order.id, paidAt);
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/orders/${order.id}`,
        headers: { cookie: kitchen },
      });
      expect(OrderResponseSchema.parse(res.json()).order.paidAt).toBe(paidAt.toISOString());
    });
    it('refuses to start a placed order that has not been paid', async () => {
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      const order = await place(9);
      const res = await bump(kitchen, order.id, 'cooking');
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('INVALID_TRANSITION');
    });
    it('answers 401 anonymous, 403 guest and waiter-for-cooking, 400 malformed body, 404 unknown', async () => {
      const order = await place(9);
      const { cookie: guest } = await claimTable(ctx.app, ctx.db, 9);
      const waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      expect(
        (
          await ctx.app.inject({
            method: 'POST',
            url: `/api/orders/${order.id}/transition`,
            payload: { to: 'cooking' },
          })
        ).statusCode,
      ).toBe(401);
      expect((await bump(guest, order.id, 'cooking')).statusCode).toBe(403);
      expect((await bump(waiter, order.id, 'cooking')).statusCode).toBe(403);
      expect((await bump(kitchen, order.id, 'baked')).statusCode).toBe(400);
      expect((await bump(kitchen, randomUUID(), 'cooking')).statusCode).toBe(404);
      expect((await bump(kitchen, 'not-a-uuid', 'cooking')).statusCode).toBe(400);
    });
    it('GET /api/orders/:id answers 401 before 400 for a malformed id', async () => {
      expect(
        (await ctx.app.inject({ method: 'GET', url: '/api/orders/not-a-uuid' })).statusCode,
      ).toBe(401);
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      expect(
        (
          await ctx.app.inject({
            method: 'GET',
            url: '/api/orders/not-a-uuid',
            headers: { cookie: kitchen },
          })
        ).statusCode,
      ).toBe(400);
    });
  });
});

// Own app so the per-ip bucket is not already spent by the orders above.
describe('POST /api/orders without a session', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('counts anonymous attempts against the ip instead of refusing them for free', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push(
        (await ctx.app.inject({ method: 'POST', url: '/api/orders', payload: { items: [] } }))
          .statusCode,
      );
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses.at(-1)).toBe(429);
  });
});
