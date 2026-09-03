import { z } from 'zod';
import type { StaffRole } from './roles';

export const ORDER_STATUSES = [
  'draft',
  'placed',
  'paid',
  'cooking',
  'ready',
  'served',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const OrderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['placed'],
  // 'cooking' is the M3 interim edge (ADR 0009): until payments exist an order is cookable as
  // soon as it is placed. M4 removes it together with the webhook that sets 'paid'.
  placed: ['paid', 'cooking', 'cancelled'],
  paid: ['cooking', 'cancelled'],
  cooking: ['ready'],
  ready: ['served'],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** The statuses a kitchen board shows; served and cancelled tickets leave it. */
export const ACTIVE_ORDER_STATUSES = ['placed', 'paid', 'cooking', 'ready'] as const;
export function isActiveStatus(status: OrderStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
}

/** Which target statuses each staff role may set. 'paid' belongs to the payment webhook (M4). */
export const TRANSITION_RIGHTS: Record<StaffRole, readonly OrderStatus[]> = {
  kitchen: ['cooking', 'ready', 'served', 'cancelled'],
  waiter: ['served', 'cancelled'],
  admin: ['cooking', 'ready', 'served', 'cancelled'],
};

export function canRoleTransition(role: StaffRole, from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITION_RIGHTS[role].includes(to) && canTransition(from, to);
}
