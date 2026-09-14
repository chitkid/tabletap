import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { PlateKind } from '@tabletap/shared';
import { id, timestamps } from './helpers';
import { restaurants } from './restaurant';

export const menuCategories = pgTable('menu_categories', {
  id: id(),
  restaurantId: uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /**
   * Which of the four plate compositions a dish in this category is drawn as when it has no
   * photograph (`PLATE_KINDS` in `@tabletap/shared`). Stored rather than guessed from `name`: the
   * browser used to read the display word, so a category named in any language but English drew
   * the fallback for every dish it held. `$type` narrows the column to the four words; the default
   * is `DEFAULT_PLATE_KIND`, which is what a category created through the admin editor gets.
   */
  plateKind: text('plate_kind').notNull().default('side').$type<PlateKind>(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const menuItems = pgTable('menu_items', {
  id: id(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => menuCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  priceCents: integer('price_cents').notNull(),
  imageUrl: text('image_url'),
  allergens: text('allergens')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});
