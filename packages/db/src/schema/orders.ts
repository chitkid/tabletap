import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { orderStatusEnum, paymentProviderEnum, paymentStatusEnum } from './enums';
import { guestSessions } from './guest';
import { id, timestamps } from './helpers';
import { menuItems } from './menu';
import { restaurants, tables } from './restaurant';

export const orders = pgTable(
  'orders',
  {
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
    number: integer('number').generatedAlwaysAsIdentity(),
    status: orderStatusEnum('status').notNull().default('draft'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    note: text('note'),
    idempotencyKey: text('idempotency_key').unique(),
    placedAt: timestamp('placed_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cookingAt: timestamp('cooking_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('orders_table_id_idx').on(t.tableId),
    index('orders_status_idx').on(t.status),
    uniqueIndex('orders_number_uidx').on(t.number),
    index('orders_paid_at_idx').on(t.paidAt),
    index('orders_restaurant_id_idx').on(t.restaurantId),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
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
  },
  (t) => [index('order_items_order_id_idx').on(t.orderId)],
);

export const payments = pgTable(
  'payments',
  {
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
  },
  (t) => [index('payments_order_id_idx').on(t.orderId)],
);

/**
 * Every provider event this API has already acted on. The row goes in before the work, so a
 * retry - which Stripe guarantees - loses the unique index and does nothing the second time.
 */
export const processedEvents = pgTable(
  'processed_events',
  {
    id: id(),
    provider: paymentProviderEnum('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('processed_events_provider_event_uidx').on(t.provider, t.eventId)],
);
