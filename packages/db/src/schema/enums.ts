import { pgEnum } from 'drizzle-orm/pg-core';
export const userRoleEnum = pgEnum('user_role', ['waiter', 'kitchen', 'admin']);
export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'placed',
  'paid',
  'cooking',
  'ready',
  'served',
  'cancelled',
]);
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'succeeded',
  'failed',
  'refunded',
]);
export const paymentProviderEnum = pgEnum('payment_provider', ['stripe', 'demo']);
export const actorTypeEnum = pgEnum('actor_type', ['user', 'guest', 'system']);
