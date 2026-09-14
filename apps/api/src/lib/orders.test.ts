import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '@tabletap/db';
import { MeResponseSchema, type GuestPrincipal, type OrderCreateRequest } from '@tabletap/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '@tabletap/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp } from '../test/helpers';
import { AppError } from './errors';
import { createOrder } from './orders';

/** A real guest principal, read back from /api/me exactly as a request would carry it. */
async function guestAt(app: FastifyInstance, db: Db, tableNumber: number): Promise<GuestPrincipal> {
  const { cookie } = await claimTable(app, db, tableNumber);
  const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  const { principal } = MeResponseSchema.parse(res.json());
  if (principal.kind !== 'guest') throw new Error('expected a guest principal');
  return principal;
}

describe('createOrder', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let body: OrderCreateRequest;

  beforeAll(async () => {
    ctx = await createTestApp();
    const [item] = await ctx.db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(eq(schema.menuItems.name, 'Раф с облепихой'));
    if (!item) throw new Error('menu is not seeded');
    body = { items: [{ menuItemId: item.id, quantity: 1 }] };
  });
  afterAll(async () => {
    await ctx.close();
  });

  // A guest whose request times out retries while the first one is still in flight: both calls
  // find no prior order, both insert, and one of them loses the unique key. That loser must be
  // answered with the order the winner placed, not with a 500.
  it('replays a key that a concurrent request for the same session inserted first', async () => {
    const guest = await guestAt(ctx.app, ctx.db, 3);
    const idempotencyKey = randomUUID();
    const [first, second] = await Promise.all([
      createOrder(ctx.db, { principal: guest, body, idempotencyKey }),
      createOrder(ctx.db, { principal: guest, body, idempotencyKey }),
    ]);
    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.order.id).toBe(second.order.id);
    expect(first.order.items).toEqual(second.order.items);
    const rows = await ctx.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.idempotencyKey, idempotencyKey));
    expect(rows).toHaveLength(1);
  });

  it('refuses a key that a concurrent request for another session inserted first', async () => {
    const [one, two] = [await guestAt(ctx.app, ctx.db, 4), await guestAt(ctx.app, ctx.db, 5)];
    const idempotencyKey = randomUUID();
    const results = await Promise.allSettled([
      createOrder(ctx.db, { principal: one, body, idempotencyKey }),
      createOrder(ctx.db, { principal: two, body, idempotencyKey }),
    ]);
    const placed = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(placed).toHaveLength(1);
    expect(placed[0]!.value.created).toBe(true);
    expect(refused).toHaveLength(1);
    const error: unknown = refused[0]!.reason;
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    const rows = await ctx.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.idempotencyKey, idempotencyKey));
    expect(rows).toHaveLength(1);
  });
});
