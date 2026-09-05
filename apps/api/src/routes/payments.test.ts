import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { schema } from '@tabletap/db';
import {
  IDEMPOTENCY_KEY_HEADER,
  MenuResponseSchema,
  OrderResponseSchema,
  PaymentSessionResponseSchema,
} from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, claimTable, createTestApp, payOrder, signInAs } from '../test/helpers';

describe('payments routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let itemId: string;

  /** Claims a table with a fresh cookie and places one order on it. */
  async function placeOrder(tableNumber: number) {
    const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      payload: { items: [{ menuItemId: itemId, quantity: 1 }] },
    });
    const { order } = OrderResponseSchema.parse(res.json());
    return { order, cookie };
  }
  const startPayment = (orderId: string, headers: Record<string, string> = {}) =>
    ctx.app.inject({ method: 'POST', url: `/api/orders/${orderId}/payment`, headers });
  const complete = (payload: object, headers: Record<string, string> = {}) =>
    ctx.app.inject({ method: 'POST', url: '/api/payments/demo/complete', headers, payload });
  const orderRow = async (orderId: string) =>
    (await ctx.db.select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0]!;
  const paymentRows = async (orderId: string) =>
    ctx.db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId));
  const auditFor = async (orderId: string, action: string) =>
    ctx.db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.action, action), eq(schema.auditLog.entityId, orderId)));

  beforeAll(async () => {
    ctx = await createTestApp();
    const { cookie } = await claimTable(ctx.app, ctx.db, 1);
    const menu = MenuResponseSchema.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json(),
    );
    itemId = menu.categories[0]!.items[0]!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /api/orders/:id/payment', () => {
    it('opens a payment for the guest who owns the order', async () => {
      const { order, cookie } = await placeOrder(2);
      const res = await startPayment(order.id, { cookie });
      expect(res.statusCode).toBe(200);
      expect(PaymentSessionResponseSchema.parse(res.json())).toEqual({ url: `/pay/${order.id}` });
      const rows = await paymentRows(order.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'pending',
        provider: 'demo',
        amountCents: order.totalCents,
      });
    });

    it('answers 404 for another guest, 401 for nobody and 403 for staff', async () => {
      const { order } = await placeOrder(3);
      const { cookie: other } = await claimTable(ctx.app, ctx.db, 4);
      expect((await startPayment(order.id, { cookie: other })).statusCode).toBe(404);
      expect((await startPayment(order.id)).statusCode).toBe(401);
      const staff = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
      expect((await startPayment(order.id, { cookie: staff })).statusCode).toBe(403);
      // None of the refused calls may have opened an attempt.
      expect(await paymentRows(order.id)).toHaveLength(0);
    });

    it('refuses an order that is not waiting for payment', async () => {
      const { order, cookie } = await placeOrder(5);
      await payOrder(ctx.db, order.id);
      const res = await startPayment(order.id, { cookie });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('PAYMENT_REQUIRED');
    });
  });

  describe('POST /api/payments/demo/complete', () => {
    it('pays the order once, however many times the button is pressed', async () => {
      const { order, cookie } = await placeOrder(6);
      expect((await startPayment(order.id, { cookie })).statusCode).toBe(200);

      const res = await complete({ orderId: order.id, outcome: 'paid' }, { cookie });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      expect(await orderRow(order.id)).toMatchObject({ status: 'paid' });
      expect((await paymentRows(order.id))[0]).toMatchObject({ status: 'succeeded' });
      expect(await auditFor(order.id, 'payment.succeeded')).toHaveLength(1);

      // The order is paid, so the second press has nothing to settle - and saying so is not the
      // same as saying payment is required.
      const again = await complete({ orderId: order.id, outcome: 'paid' }, { cookie });
      expect(again.statusCode).toBe(200);
      expect(again.json()).toEqual({ ok: true });
      expect(await auditFor(order.id, 'payment.succeeded')).toHaveLength(1);
      expect(await orderRow(order.id)).toMatchObject({ status: 'paid' });

      // Same answer once the kitchen has moved the ticket on and the guest's tab is stale.
      const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
      const moved = await ctx.app.inject({
        method: 'POST',
        url: `/api/orders/${order.id}/transition`,
        headers: { cookie: kitchen },
        payload: { to: 'cooking' },
      });
      expect(moved.statusCode).toBe(200);
      const stale = await complete({ orderId: order.id, outcome: 'paid' }, { cookie });
      expect(stale.statusCode).toBe(200);
      expect(await auditFor(order.id, 'payment.succeeded')).toHaveLength(1);
    });

    it('settles the newest attempt when two share a createdAt to the millisecond', async () => {
      const { order, cookie } = await placeOrder(9);
      expect((await startPayment(order.id, { cookie })).statusCode).toBe(200);
      expect((await startPayment(order.id, { cookie })).statusCode).toBe(200);
      // Migration 0005 coarsened these columns to millisecond precision, so two attempts opened in
      // the same millisecond are indistinguishable by `createdAt` alone. Forced here rather than
      // raced, so the tie is the thing under test instead of the scheduler.
      const opened = await paymentRows(order.id);
      expect(opened).toHaveLength(2);
      const tied = new Date('2026-09-05T12:00:00.000Z');
      await ctx.db
        .update(schema.payments)
        .set({ createdAt: tied })
        .where(eq(schema.payments.orderId, order.id));
      // uuidv7 sorts by the instant it was minted, so the greater id is the later attempt.
      const [older, newer] = [...opened].sort((a, b) => a.id.localeCompare(b.id));

      expect((await complete({ orderId: order.id, outcome: 'paid' }, { cookie })).statusCode).toBe(
        200,
      );
      const settled = await paymentRows(order.id);
      expect(settled.find((p) => p.id === newer!.id)).toMatchObject({ status: 'succeeded' });
      expect(settled.find((p) => p.id === older!.id)).toMatchObject({ status: 'pending' });
    });

    it('refuses an order that was never paid and is no longer waiting', async () => {
      const { order, cookie } = await placeOrder(3);
      expect((await startPayment(order.id, { cookie })).statusCode).toBe(200);
      const waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
      const cancelled = await ctx.app.inject({
        method: 'POST',
        url: `/api/orders/${order.id}/transition`,
        headers: { cookie: waiter },
        payload: { to: 'cancelled' },
      });
      expect(cancelled.statusCode).toBe(200);

      const res = await complete({ orderId: order.id, outcome: 'paid' }, { cookie });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('PAYMENT_REQUIRED');
      expect(await orderRow(order.id)).toMatchObject({ status: 'cancelled', paidAt: null });
      expect(await auditFor(order.id, 'payment.succeeded')).toHaveLength(0);
    });

    it('records a decline without paying the order', async () => {
      const { order, cookie } = await placeOrder(7);
      await startPayment(order.id, { cookie });
      const res = await complete({ orderId: order.id, outcome: 'declined' }, { cookie });
      expect(res.statusCode).toBe(200);
      expect(await orderRow(order.id)).toMatchObject({ status: 'placed', paidAt: null });
      expect((await paymentRows(order.id))[0]).toMatchObject({ status: 'failed' });
      expect(await auditFor(order.id, 'payment.declined')).toHaveLength(1);
    });

    it('cannot decline an order it has already paid', async () => {
      const { order, cookie } = await placeOrder(8);
      // Two attempts opened while the order is still placed: settling the newer one leaves the
      // older one pending, which is the only way a guest could aim Decline at a paid order.
      expect((await startPayment(order.id, { cookie })).statusCode).toBe(200);
      expect((await startPayment(order.id, { cookie })).statusCode).toBe(200);
      expect((await complete({ orderId: order.id, outcome: 'paid' }, { cookie })).statusCode).toBe(
        200,
      );
      expect(await orderRow(order.id)).toMatchObject({ status: 'paid' });

      // The older attempt is still pending, so Decline has something to aim at - but the order it
      // belongs to is paid, and the terminal settles nothing.
      const declined = await complete({ orderId: order.id, outcome: 'declined' }, { cookie });
      expect(declined.statusCode).toBe(200);
      expect(declined.json()).toEqual({ ok: true });
      expect(await orderRow(order.id)).toMatchObject({ status: 'paid' });
      const rows = await paymentRows(order.id);
      expect(rows.filter((r) => r.status === 'succeeded')).toHaveLength(1);
      expect(rows.filter((r) => r.status === 'failed')).toHaveLength(0);
      expect(await auditFor(order.id, 'payment.declined')).toHaveLength(0);
    });

    it('answers 404 for another guest’s order and 401 for nobody', async () => {
      const { order, cookie } = await placeOrder(9);
      await startPayment(order.id, { cookie });
      const { cookie: other } = await claimTable(ctx.app, ctx.db, 10);
      const stranger = await complete({ orderId: order.id, outcome: 'paid' }, { cookie: other });
      expect(stranger.statusCode).toBe(404);
      expect((await complete({ orderId: order.id, outcome: 'paid' })).statusCode).toBe(401);
      expect(await orderRow(order.id)).toMatchObject({ status: 'placed' });
      expect((await paymentRows(order.id))[0]).toMatchObject({ status: 'pending' });
    });

    it('refuses a body that is not an order id and an outcome', async () => {
      const { order, cookie } = await placeOrder(11);
      await startPayment(order.id, { cookie });
      const res = await complete({ orderId: order.id, outcome: 'maybe' }, { cookie });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /api/payments/webhook', () => {
    it('answers 200 and pays the order for an event the provider vouches for', async () => {
      const secret = 'whsec_test_webhook';
      const stripe = await createTestApp({
        config: {
          ...TEST_CONFIG,
          paymentProvider: 'stripe',
          STRIPE_SECRET_KEY: 'sk_test_x',
          STRIPE_WEBHOOK_SECRET: secret,
        },
      });
      try {
        const { cookie } = await claimTable(stripe.app, stripe.db, 2);
        const menu = MenuResponseSchema.parse(
          (
            await stripe.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })
          ).json(),
        );
        const placed = await stripe.app.inject({
          method: 'POST',
          url: '/api/orders',
          headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
          payload: { items: [{ menuItemId: menu.categories[0]!.items[0]!.id, quantity: 1 }] },
        });
        const { order } = OrderResponseSchema.parse(placed.json());
        // The attempt is written straight to the database: opening one through the route would
        // have Stripe create a Checkout session, and these tests never leave the machine.
        const [payment] = await stripe.db
          .insert(schema.payments)
          .values({
            orderId: order.id,
            provider: 'stripe',
            amountCents: order.totalCents,
            currency: 'USD',
            status: 'pending',
            providerSessionId: 'cs_test_1',
          })
          .returning();
        const body = JSON.stringify({
          id: `evt_${randomUUID()}`,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_1',
              payment_intent: 'pi_test_1',
              amount_total: order.totalCents,
              currency: 'usd',
              metadata: { orderId: order.id, paymentId: payment!.id },
            },
          },
        });
        const res = await stripe.app.inject({
          method: 'POST',
          url: '/api/payments/webhook',
          headers: {
            'content-type': 'application/json',
            'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: body, secret }),
          },
          payload: body,
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ received: true });
        const [row] = await stripe.db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.id, order.id));
        expect(row).toMatchObject({ status: 'paid' });
        const [settled] = await stripe.db
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, payment!.id));
        expect(settled).toMatchObject({
          status: 'succeeded',
          providerPaymentIntentId: 'pi_test_1',
        });
      } finally {
        await stripe.close();
      }
    });

    it('refuses an event the provider will not vouch for', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/payments/webhook',
        headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=nope' },
        payload: JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SIGNATURE_INVALID');
    });

    it('reads the body as bytes, so a payload that is not JSON still reaches the signature check', async () => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/payments/webhook',
        headers: { 'content-type': 'application/json' },
        payload: 'not json at all {',
      });
      // The default parser would have failed on the syntax before any handler ran.
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('SIGNATURE_INVALID');
    });

    it('leaves the JSON routes parsing JSON', async () => {
      const { cookie } = await claimTable(ctx.app, ctx.db, 12);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/orders',
        headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
        payload: { items: [{ menuItemId: itemId, quantity: 1 }] },
      });
      expect(res.statusCode).toBe(201);
      expect(OrderResponseSchema.parse(res.json()).order.items).toHaveLength(1);
    });
  });

  describe('with Stripe configured', () => {
    it('does not register the demo completion route', async () => {
      const stripe = await createTestApp({
        config: {
          ...TEST_CONFIG,
          paymentProvider: 'stripe',
          STRIPE_SECRET_KEY: 'sk_test_x',
          STRIPE_WEBHOOK_SECRET: 'whsec_x',
        },
      });
      try {
        const res = await stripe.app.inject({
          method: 'POST',
          url: '/api/payments/demo/complete',
          payload: { orderId: randomUUID(), outcome: 'paid' },
        });
        expect(res.statusCode).toBe(404);
        // The webhook is the route that deployment does have.
        const hook = await stripe.app.inject({
          method: 'POST',
          url: '/api/payments/webhook',
          headers: { 'content-type': 'application/json' },
          payload: JSON.stringify({ id: 'evt_1' }),
        });
        expect(hook.statusCode).toBe(400);
        expect(hook.json().error.code).toBe('SIGNATURE_INVALID');
      } finally {
        await stripe.close();
      }
    });
  });
});
