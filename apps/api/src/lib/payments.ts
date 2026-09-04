import { and, eq } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import type { PaymentProvider, SettleInput } from '../payments/types';
import { recordAudit } from './audit';
import { AppError } from './errors';
import { isUniqueViolation, loadOrder } from './orders';
import type { OrderEvents } from './order-events';

export type SettleResult = 'paid' | 'declined' | 'replayed' | 'mismatch' | 'late' | 'unknown-order';

/**
 * Opens a payment attempt for an order the guest owns. The amount is the order's, read here and
 * never taken from the caller; the provider only learns what it must charge.
 */
export async function startPayment(
  db: Db,
  provider: PaymentProvider,
  input: { orderId: string; guestSessionId: string; now?: Date },
): Promise<{ url: string }> {
  const now = input.now ?? new Date();
  const order = await loadOrder(db, input.orderId);
  // A stranger's order and an order that never existed answer the same way, as everywhere else.
  if (!order || order.guestSessionId !== input.guestSessionId)
    throw new AppError('NOT_FOUND', 404, 'Order not found.');
  if (order.status !== 'placed')
    throw new AppError('PAYMENT_REQUIRED', 409, 'This order is not waiting for payment.', {
      status: order.status,
    });

  const [payment] = await db
    .insert(schema.payments)
    .values({
      orderId: order.id,
      provider: provider.name,
      amountCents: order.totalCents,
      currency: 'USD',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!payment) throw new Error('payment insert returned nothing');

  const session = await provider.createSession({
    orderId: order.id,
    paymentId: payment.id,
    number: order.number,
    amountCents: order.totalCents,
    currency: 'USD',
    description: `Order #${order.number} · Table ${order.tableNumber}`,
  });
  await db
    .update(schema.payments)
    .set({ providerSessionId: session.providerSessionId, updatedAt: new Date() })
    .where(eq(schema.payments.id, payment.id));
  return { url: session.url };
}

/**
 * The one writer of `paid`. The processed-events row goes in first: a provider that retries -
 * and Stripe does - loses the unique index and is told the work is already done.
 */
export async function settlePayment(
  db: Db,
  events: OrderEvents,
  input: SettleInput,
  now: Date = new Date(),
): Promise<SettleResult> {
  try {
    await db.insert(schema.processedEvents).values({
      provider: input.provider,
      eventId: input.eventId,
      type: input.type,
      payload: input.payload,
      receivedAt: now,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'replayed';
    throw error;
  }

  const order = await loadOrder(db, input.orderId);
  if (!order) return 'unknown-order';

  const fail = async (action: string, payload: Record<string, unknown>): Promise<void> => {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.payments)
        .set({
          status: 'failed',
          updatedAt: now,
          providerPaymentIntentId: input.providerPaymentIntentId,
        })
        .where(and(eq(schema.payments.id, input.paymentId), eq(schema.payments.orderId, order.id)));
      await recordAudit(tx, {
        actorType: 'system',
        actorId: null,
        action,
        entityType: 'order',
        entityId: order.id,
        payload: { provider: input.provider, eventId: input.eventId, ...payload },
      });
    });
  };

  if (input.outcome === 'failed') {
    await fail('payment.declined', { number: order.number });
    return 'declined';
  }
  if (input.amountCents !== order.totalCents) {
    // Never pay an order for a sum nobody agreed to, and never make the provider retry it.
    await fail('payment.mismatch', { expected: order.totalCents, received: input.amountCents });
    return 'mismatch';
  }
  if (order.status !== 'placed') {
    await recordAudit(db, {
      actorType: 'system',
      actorId: null,
      action: 'payment.late',
      entityType: 'order',
      entityId: order.id,
      payload: { provider: input.provider, eventId: input.eventId, status: order.status },
    });
    return 'late';
  }

  const moved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.orders)
      .set({ status: 'paid', paidAt: now, updatedAt: now })
      .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, 'placed')))
      .returning({ id: schema.orders.id });
    if (!row) return false;
    await tx
      .update(schema.payments)
      .set({
        status: 'succeeded',
        updatedAt: now,
        providerPaymentIntentId: input.providerPaymentIntentId,
        providerSessionId: input.providerSessionId,
      })
      .where(eq(schema.payments.id, input.paymentId));
    await recordAudit(tx, {
      actorType: 'system',
      actorId: null,
      action: 'payment.succeeded',
      entityType: 'order',
      entityId: order.id,
      payload: {
        provider: input.provider,
        eventId: input.eventId,
        number: order.number,
        amountCents: input.amountCents,
      },
    });
    return true;
  });
  if (!moved) return 'late';

  // Only after the commit: a listener must never see an order the database could still roll back.
  const dto = (await loadOrder(db, order.id))!;
  events.emit('order:updated', dto);
  return 'paid';
}
