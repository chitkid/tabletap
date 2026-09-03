import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orderStatusEnum, paymentProviderEnum, paymentStatusEnum } from './enums';
import { guestSessions } from './guest';
import { id, timestamps } from './helpers';
import { menuItems } from './menu';
import { restaurants, tables } from './restaurant';

export const orders = pgTable('orders', {
  id: id(),
  restaurantId: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id')
    .notNull()
    .references(() => tables.id, { onDelete: 'restrict' }),
  guestSessionId: uuid('guest_session_id').references(() => guestSessions.id, {
    onDelete: 'set null',
  }),
  status: orderStatusEnum('status').notNull().default('draft'),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  note: text('note'),
  idempotencyKey: text('idempotency_key').unique(),
  placedAt: timestamp('placed_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  servedAt: timestamp('served_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  ...timestamps,
});

export const orderItems = pgTable('order_items', {
  id: id(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  menuItemId: uuid('menu_item_id')
    .notNull()
    .references(() => menuItems.id, { onDelete: 'restrict' }),
  nameSnapshot: text('name_snapshot').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
  ...timestamps,
});

export const payments = pgTable('payments', {
  id: id(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  provider: paymentProviderEnum('provider').notNull(),
  providerSessionId: text('provider_session_id'),
  providerPaymentIntentId: text('provider_payment_intent_id'),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: paymentStatusEnum('status').notNull().default('pending'),
  ...timestamps,
});
