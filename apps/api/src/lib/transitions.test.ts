import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { IDEMPOTENCY_KEY_HEADER, MenuResponseSchema, OrderResponseSchema } from '@tabletap/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, payOrder } from '../test/helpers';
import { transitionOrder } from './transitions';

describe('transitionOrder', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let restaurantId: string;
  const kitchen = {
    kind: 'staff',
    userId: 'u-kitchen',
    email: 'k@x',
    name: 'K',
    role: 'kitchen',
  } as const;
  const waiter = { ...kitchen, userId: 'u-waiter', role: 'waiter' } as const;

  async function placeOrder(tableNumber: number): Promise<string> {
    const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
    const menu = MenuResponseSchema.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json(),
    );
    const item = menu.categories[0]!.items[0]!;
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      payload: { items: [{ menuItemId: item.id, quantity: 1 }] },
    });
    return OrderResponseSchema.parse(res.json()).order.id;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    const rows = await ctx.db.select({ id: schema.restaurants.id }).from(schema.restaurants);
    restaurantId = rows[0]!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('moves paid → cooking, stamps cookingAt and updatedAt, audits and emits', async () => {
    const orderId = await placeOrder(2);
    await payOrder(ctx.db, orderId);
    const seen: string[] = [];
    ctx.app.orderEvents.once('order:updated', (o) => seen.push(o.status));
    const now = new Date('2026-09-03T12:00:00Z');
    const dto = await transitionOrder(ctx.db, ctx.app.orderEvents, {
      orderId,
      to: 'cooking',
      actor: kitchen,
      restaurantId,
      now,
    });
    expect(dto.status).toBe('cooking');
    expect(dto.cookingAt).toBe(now.toISOString());
    expect(dto.updatedAt).toBe(now.toISOString());
    expect(seen).toEqual(['cooking']);
    const [audit] = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'order.transition'));
    expect(audit).toMatchObject({
      actorType: 'user',
      actorId: 'u-kitchen',
      entityId: orderId,
      payload: { from: 'paid', to: 'cooking' },
    });
  });
  it('refuses a target the role may not set (403) and an edge the machine forbids (409)', async () => {
    const orderId = await placeOrder(2);
    await expect(
      transitionOrder(ctx.db, ctx.app.orderEvents, {
        orderId,
        to: 'cooking',
        actor: waiter,
        restaurantId,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    // Without paying first: the interim placed → cooking edge (ADR 0009) is gone.
    await expect(
      transitionOrder(ctx.db, ctx.app.orderEvents, {
        orderId,
        to: 'cooking',
        actor: kitchen,
        restaurantId,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
      statusCode: 409,
      details: { from: 'placed', to: 'cooking', current: 'placed' },
    });
  });
  it('answers the loser of a concurrent bump with 409 and the current status', async () => {
    const orderId = await placeOrder(3);
    await payOrder(ctx.db, orderId);
    const bump = () =>
      transitionOrder(ctx.db, ctx.app.orderEvents, {
        orderId,
        to: 'cooking',
        actor: kitchen,
        restaurantId,
      });
    const results = await Promise.allSettled([bump(), bump()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { current: 'cooking' },
    });
  });
  it('hides orders of another restaurant behind 404', async () => {
    const orderId = await placeOrder(3);
    await expect(
      transitionOrder(ctx.db, ctx.app.orderEvents, {
        orderId,
        to: 'cooking',
        actor: kitchen,
        restaurantId: randomUUID(),
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
