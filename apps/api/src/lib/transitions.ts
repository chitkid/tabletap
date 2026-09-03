import { and, eq } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import {
  TRANSITION_RIGHTS,
  canTransition,
  type OrderStatus,
  type StaffPrincipal,
} from '@tabletap/shared';
import { recordAudit } from './audit';
import { AppError } from './errors';
import type { OrderEvents } from './order-events';
import { loadOrder, type InternalOrderDto } from './orders';

/** The column a target status stamps; 'paid' is listed for M4, no M3 role can reach it. */
const STAMP: Partial<
  Record<OrderStatus, 'paidAt' | 'cookingAt' | 'readyAt' | 'servedAt' | 'cancelledAt'>
> = {
  paid: 'paidAt',
  cooking: 'cookingAt',
  ready: 'readyAt',
  served: 'servedAt',
  cancelled: 'cancelledAt',
};

const invalid = (from: OrderStatus, to: OrderStatus, current: OrderStatus) =>
  new AppError('INVALID_TRANSITION', 409, `This order is ${current} now.`, { from, to, current });

/**
 * Three checks, then one guarded UPDATE. The WHERE on the old status is what makes two cooks
 * bumping the same ticket safe: the second update matches nothing and is told what the first one did.
 */
export async function transitionOrder(
  db: Db,
  events: OrderEvents,
  input: {
    orderId: string;
    to: OrderStatus;
    actor: StaffPrincipal;
    restaurantId: string;
    now?: Date;
  },
): Promise<InternalOrderDto> {
  const now = input.now ?? new Date();
  const current = await loadOrder(db, input.orderId);
  if (!current || current.restaurantId !== input.restaurantId)
    throw new AppError('NOT_FOUND', 404, 'Order not found.');
  const from = current.status;
  if (!TRANSITION_RIGHTS[input.actor.role].includes(input.to))
    throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
  if (!canTransition(from, input.to)) throw invalid(from, input.to, from);

  const stamp = STAMP[input.to];
  const moved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.orders)
      .set({ status: input.to, updatedAt: now, ...(stamp ? { [stamp]: now } : {}) })
      .where(and(eq(schema.orders.id, input.orderId), eq(schema.orders.status, from)))
      .returning({ id: schema.orders.id });
    if (!row) return false;
    await recordAudit(tx, {
      actorType: 'user',
      actorId: input.actor.userId,
      action: 'order.transition',
      entityType: 'order',
      entityId: input.orderId,
      payload: { from, to: input.to, number: current.number },
    });
    return true;
  });
  if (!moved) {
    const latest = await loadOrder(db, input.orderId);
    throw invalid(from, input.to, latest?.status ?? from);
  }
  const dto = (await loadOrder(db, input.orderId))!;
  events.emit('order:updated', dto);
  return dto;
}
