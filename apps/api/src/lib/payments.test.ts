import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { IDEMPOTENCY_KEY_HEADER, MenuResponseSchema, OrderResponseSchema } from '@tabletap/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDemoProvider } from '../payments/demo';
import type { SettleInput } from '../payments/types';
import { claimTable, createTestApp } from '../test/helpers';
import { settlePayment, startPayment } from './payments';

describe('payments', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const provider = createDemoProvider();

  async function placeOrder(tableNumber: number) {
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
    const { order } = OrderResponseSchema.parse(res.json());
    const [row] = await ctx.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    return { order, guestSessionId: row!.guestSessionId!, cookie };
  }
  const paymentIdOf = async (orderId: string) =>
    (await ctx.db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)))[0]!
      .id;
  const auditCount = async (action: string) =>
    (await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, action))).length;
  const event = (over: Partial<SettleInput>): SettleInput => ({
    provider: 'demo',
    eventId: `demo:${randomUUID()}`,
    type: 'demo.completed',
    outcome: 'succeeded',
    orderId: '',
    paymentId: '',
    amountCents: 0,
    currency: 'USD',
    providerSessionId: null,
    providerPaymentIntentId: null,
    payload: {},
    ...over,
  });

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('starts a payment: one pending row, the amount from the order, the terminal url', async () => {
    const { order, guestSessionId } = await placeOrder(2);
    const { url } = await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    expect(url).toBe(`/pay/${order.id}`);
    const [row] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, order.id));
    expect(row).toMatchObject({
      provider: 'demo',
      status: 'pending',
      amountCents: order.totalCents,
      currency: 'USD',
    });
  });

  it('refuses a payment for someone else’s order, an unknown order and an order that is not placed', async () => {
    const { order, guestSessionId } = await placeOrder(3);
    await expect(
      startPayment(ctx.db, provider, { orderId: order.id, guestSessionId: randomUUID() }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      startPayment(ctx.db, provider, { orderId: randomUUID(), guestSessionId }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    const paymentId = await paymentIdOf(order.id);
    await settlePayment(
      ctx.db,
      ctx.app.orderEvents,
      event({ orderId: order.id, paymentId, amountCents: order.totalCents }),
    );
    await expect(
      startPayment(ctx.db, provider, { orderId: order.id, guestSessionId }),
    ).rejects.toMatchObject({ code: 'PAYMENT_REQUIRED', statusCode: 409 });
  });

  it('settles: the order is paid, the payment succeeds, the audit says so and the board hears it', async () => {
    const { order, guestSessionId } = await placeOrder(4);
    await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    const paymentId = await paymentIdOf(order.id);
    const seen: string[] = [];
    ctx.app.orderEvents.once('order:updated', (o) => seen.push(`${o.id}:${o.status}`));
    const now = new Date('2026-09-04T12:00:00Z');
    expect(
      await settlePayment(
        ctx.db,
        ctx.app.orderEvents,
        event({ orderId: order.id, paymentId, amountCents: order.totalCents }),
        now,
      ),
    ).toBe('paid');
    const [after] = await ctx.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(after).toMatchObject({ status: 'paid' });
    expect(after!.paidAt?.toISOString()).toBe(now.toISOString());
    const [payment] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId));
    // The demo event carries no session id; the one startPayment stored must survive.
    expect(payment).toMatchObject({
      status: 'succeeded',
      providerSessionId: `demo:${paymentId}`,
    });
    const audit = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'payment.succeeded'));
    expect(audit.at(-1)).toMatchObject({ actorType: 'system', entityId: order.id });
    expect(seen).toEqual([`${order.id}:paid`]);
  });

  it('does nothing the second time the same event arrives', async () => {
    const { order, guestSessionId } = await placeOrder(5);
    await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    const paymentId = await paymentIdOf(order.id);
    const one = event({ orderId: order.id, paymentId, amountCents: order.totalCents });
    expect(await settlePayment(ctx.db, ctx.app.orderEvents, one)).toBe('paid');
    const before = await auditCount('payment.succeeded');
    expect(await settlePayment(ctx.db, ctx.app.orderEvents, one)).toBe('replayed');
    expect(await auditCount('payment.succeeded')).toBe(before);
    expect(
      await ctx.db
        .select()
        .from(schema.processedEvents)
        .where(eq(schema.processedEvents.eventId, one.eventId)),
    ).toHaveLength(1);
  });

  it('refuses an amount that does not match the order, and records why', async () => {
    const { order, guestSessionId } = await placeOrder(6);
    await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    const paymentId = await paymentIdOf(order.id);
    expect(
      await settlePayment(
        ctx.db,
        ctx.app.orderEvents,
        event({ orderId: order.id, paymentId, amountCents: 1 }),
      ),
    ).toBe('mismatch');
    const [after] = await ctx.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(after).toMatchObject({ status: 'placed' });
    const [payment] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId));
    expect(payment).toMatchObject({ status: 'failed' });
    expect(await auditCount('payment.mismatch')).toBe(1);
  });

  it('records a decline without touching the order', async () => {
    const { order, guestSessionId } = await placeOrder(7);
    await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    const paymentId = await paymentIdOf(order.id);
    expect(
      await settlePayment(
        ctx.db,
        ctx.app.orderEvents,
        event({ orderId: order.id, paymentId, amountCents: order.totalCents, outcome: 'failed' }),
      ),
    ).toBe('declined');
    const [after] = await ctx.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(after).toMatchObject({ status: 'placed' });
    const [payment] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId));
    expect(payment).toMatchObject({ status: 'failed' });
  });

  it('leaves a payment that already succeeded alone when a failure arrives after it', async () => {
    const { order, guestSessionId } = await placeOrder(11);
    await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    const paymentId = await paymentIdOf(order.id);
    const settled = event({ orderId: order.id, paymentId, amountCents: order.totalCents });
    expect(await settlePayment(ctx.db, ctx.app.orderEvents, settled)).toBe('paid');
    // A provider can emit a failure for the same attempt afterwards, under its own event id, so
    // the replay guard does not catch it: the attempt itself must refuse to move backwards.
    await settlePayment(
      ctx.db,
      ctx.app.orderEvents,
      event({ orderId: order.id, paymentId, amountCents: order.totalCents, outcome: 'failed' }),
    );
    const [payment] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId));
    expect(payment).toMatchObject({ status: 'succeeded' });
    const [after] = await ctx.db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
    expect(after).toMatchObject({ status: 'paid' });
  });

  it('answers a late event about an order that has moved on, without changing it', async () => {
    const { order, guestSessionId } = await placeOrder(8);
    await startPayment(ctx.db, provider, { orderId: order.id, guestSessionId });
    const paymentId = await paymentIdOf(order.id);
    await settlePayment(
      ctx.db,
      ctx.app.orderEvents,
      event({ orderId: order.id, paymentId, amountCents: order.totalCents }),
    );
    const late = event({ orderId: order.id, paymentId, amountCents: order.totalCents });
    expect(await settlePayment(ctx.db, ctx.app.orderEvents, late)).toBe('late');
    expect(await auditCount('payment.late')).toBe(1);
  });

  it('refuses an event naming a payment that belongs to another order', async () => {
    const a = await placeOrder(9);
    const b = await placeOrder(10);
    await startPayment(ctx.db, provider, { orderId: a.order.id, guestSessionId: a.guestSessionId });
    await startPayment(ctx.db, provider, { orderId: b.order.id, guestSessionId: b.guestSessionId });
    const paymentOfA = await paymentIdOf(a.order.id);
    const paymentOfB = await paymentIdOf(b.order.id);
    // The amount is right for order B, but the payment named is order A's.
    const result = await settlePayment(
      ctx.db,
      ctx.app.orderEvents,
      event({ orderId: b.order.id, paymentId: paymentOfA, amountCents: b.order.totalCents }),
    );
    expect(result).not.toBe('paid');
    expect(result).toBe('mismatch');
    const [orderB] = await ctx.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, b.order.id));
    expect(orderB).toMatchObject({ status: 'placed', paidAt: null });
    const [otherPayment] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentOfA));
    expect(otherPayment).toMatchObject({ status: 'pending', orderId: a.order.id });
    const [ownPayment] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentOfB));
    expect(ownPayment).toMatchObject({ status: 'pending' });
    const [orderA] = await ctx.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, a.order.id));
    expect(orderA).toMatchObject({ status: 'placed' });
  });

  it('answers an event for an order that does not exist', async () => {
    expect(
      await settlePayment(
        ctx.db,
        ctx.app.orderEvents,
        event({ orderId: randomUUID(), paymentId: randomUUID(), amountCents: 100 }),
      ),
    ).toBe('unknown-order');
  });
});
