import { boolean, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './helpers';

export const restaurants = pgTable('restaurants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  currency: text('currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('UTC'),
  ...timestamps,
});

export const tables = pgTable(
  'tables',
  {
    id: id(),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    label: text('label').notNull(),
    seats: integer('seats').notNull().default(2),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [unique('tables_restaurant_number_unique').on(t.restaurantId, t.number)],
);
