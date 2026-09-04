import { and, eq } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import type { PaymentProvider, SettleInput } from '../payments/types';
import { recordAudit } from './audit';
import { AppError } from './errors';
import { isUniqueViolation, loadOrder } from './orders';
import type { OrderEvents } from './order-events';

export type SettleResult = 'paid' | 'declined' | 'replayed' | 'mismatch' | 'late' | 'unknown-order';

/** Rolls the settlement back when the event names a payment that belongs to another order. */
class ForeignPayment extends Error {}

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

  /** Written wherever a late event is noticed: before the update, or by the update that lost. */
  const recordLate = async (writer: Db, status: string): Promise<void> => {
    await recordAudit(writer, {
      actorType: 'system',
      actorId: null,
      action: 'payment.late',
      entityType: 'order',
      entityId: order.id,
      payload: { provider: input.provider, eventId: input.eventId, status },
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
    await recordLate(db, order.status);
    return 'late';
  }

  // Both writes name this order. An event carrying a payment id from somewhere else must not
  // mark that payment succeeded, and must not pay this order on the strength of it either.
  const attempt = and(
    eq(schema.payments.id, input.paymentId),
    eq(schema.payments.orderId, order.id),
  );
  let settled: 'paid' | 'late';
  try {
    settled = await db.transaction(async (tx): Promise<'paid' | 'late'> => {
      const [row] = await tx
        .update(schema.orders)
        .set({ status: 'paid', paidAt: now, updatedAt: now })
        .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, 'placed')))
        .returning({ id: schema.orders.id });
      if (!row) {
        // Something moved the order between the check above and this update, so the event is
        // late after all. A late event leaves a trace wherever it is noticed, not only above.
        const [current] = await tx
          .select({ status: schema.orders.status })
          .from(schema.orders)
          .where(eq(schema.orders.id, order.id));
        await recordLate(tx, current?.status ?? order.status);
        return 'late';
      }
      // A provider does not have to repeat the session id it was given; keep the stored one
      // rather than overwriting a real value with the null of an event that omits it.
      const [before] = await tx
        .select({ providerSessionId: schema.payments.providerSessionId })
        .from(schema.payments)
        .where(attempt);
      const [updated] = await tx
        .update(schema.payments)
        .set({
          status: 'succeeded',
          updatedAt: now,
          providerPaymentIntentId: input.providerPaymentIntentId,
          providerSessionId: input.providerSessionId ?? before?.providerSessionId ?? null,
        })
        .where(attempt)
        .returning({ id: schema.payments.id });
      // No row: the event named a payment this order does not own. Undo the whole settlement.
      if (!updated) throw new ForeignPayment();
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
      return 'paid';
    });
  } catch (error) {
    if (!(error instanceof ForeignPayment)) throw error;
    // Nothing was written: this order is still unpaid and the other order's payment is untouched.
    await recordAudit(db, {
      actorType: 'system',
      actorId: null,
      action: 'payment.mismatch',
      entityType: 'order',
      entityId: order.id,
      payload: {
        provider: input.provider,
        eventId: input.eventId,
        paymentId: input.paymentId,
        reason: 'the payment belongs to another order',
      },
    });
    return 'mismatch';
  }
  if (settled === 'late') return 'late';

  // Only after the commit: a listener must never see an order the database could still roll back.
  const dto = (await loadOrder(db, order.id))!;
  events.emit('order:updated', dto);
  return 'paid';
}
