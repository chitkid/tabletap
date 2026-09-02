import { z } from 'zod';

export const ORDER_STATUSES = ['draft', 'placed', 'paid', 'cooking', 'ready', 'served', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const OrderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['placed'],
  placed: ['paid', 'cancelled'],
  paid: ['cooking', 'cancelled'],
  cooking: ['ready'],
  ready: ['served'],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
