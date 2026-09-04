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
  // ADR 0009's interim `placed → cooking` edge was removed in M4: an order reaches the kitchen
  // only through `settlePayment`, and `paid` is the only status a role may cook from.
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

/**
 * The statuses an order is still live in: it has been placed and it has not finished. Served and
 * cancelled orders are done. The kitchen board draws a subset of these — `placed` is the guest's
 * business until the payment settles — so this is what is still open, not what is on screen.
 */
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
