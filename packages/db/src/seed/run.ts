import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { signTableToken } from '@tabletap/shared/server';
import { uuidv7 } from 'uuidv7';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { DEMO_MENU, DEMO_RESTAURANT, DEMO_RESTAURANT_SLUG, DEMO_STAFF, DEMO_TABLES } from './data';
import { stableId } from './ids';

export { DEMO_STAFF, DEMO_RESTAURANT_SLUG } from './data';

export interface SeedOptions {
  mode: 'if-empty' | 'reset';
  demoPassword: string;
  tableTokenSecret: string;
  tableTokenTtlDays: number;
  webOrigin: string;
  now?: Date;
}
export interface SeedResult {
  skipped: boolean;
  counts: { restaurants: number; tables: number; categories: number; items: number; users: number };
  guestUrls: string[];
}

export async function seed(db: Db, opts: SeedOptions): Promise<SeedResult> {
  const now = opts.now ?? new Date();
  const existing = await db
    .select({ id: schema.restaurants.id })
    .from(schema.restaurants)
    .where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
  if (opts.mode === 'if-empty' && existing.length > 0) {
    return {
      skipped: true,
      counts: { restaurants: 0, tables: 0, categories: 0, items: 0, users: 0 },
      guestUrls: [],
    };
  }

  const passwordHash = await hashPassword(opts.demoPassword);

  const inserted = await db.transaction(async (tx) => {
    // Delete in dependency order. Cascades handle children, listed anyway for clarity.
    await tx.delete(schema.auditLog);
    await tx.delete(schema.payments);
    await tx.delete(schema.orderItems);
    await tx.delete(schema.orders);
    await tx.delete(schema.guestSessions);
    await tx.delete(schema.menuItems);
    await tx.delete(schema.menuCategories);
    await tx.delete(schema.tables);
    await tx.delete(schema.restaurants);
    await tx.delete(schema.sessions);
    await tx.delete(schema.accounts);
    await tx.delete(schema.users);

    // Ids are derived from the natural keys, not minted: the rows are new after every reset,
    // but a printed QR token still names a table that exists and a basket keyed on a table id
    // is still that table's basket (ADR 0002, ADR 0006).
    const slug = DEMO_RESTAURANT_SLUG;
    const [restaurant] = await tx
      .insert(schema.restaurants)
      .values({ ...DEMO_RESTAURANT, id: stableId('restaurant', slug) })
      .returning();
    if (!restaurant) throw new Error('seed: restaurant insert returned nothing');

    const tables = await tx
      .insert(schema.tables)
      .values(
        DEMO_TABLES.map((t) => ({
          ...t,
          id: stableId('table', `${slug}:${t.number}`),
          restaurantId: restaurant.id,
        })),
      )
      .returning();

    let items = 0;
    for (const [categoryIndex, group] of DEMO_MENU.entries()) {
      const [category] = await tx
        .insert(schema.menuCategories)
        .values({
          id: stableId('category', `${slug}:${group.category}`),
          restaurantId: restaurant.id,
          name: group.category,
          sortOrder: categoryIndex,
        })
        .returning();
      if (!category) throw new Error('seed: category insert returned nothing');
      await tx.insert(schema.menuItems).values(
        group.items.map((item, index) => ({
          id: stableId('item', `${slug}:${group.category}:${item.name}`),
          categoryId: category.id,
          name: item.name,
          description: item.description,
          priceCents: item.priceCents,
          allergens: item.allergens,
          isAvailable: item.isAvailable ?? true,
          sortOrder: index,
        })),
      );
      items += group.items.length;
    }

    for (const staff of DEMO_STAFF) {
      const userId = uuidv7();
      await tx.insert(schema.users).values({
        id: userId,
        name: staff.name,
        email: staff.email,
        emailVerified: true,
        role: staff.role,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(schema.accounts).values({
        id: uuidv7(),
        userId,
        accountId: userId,
        providerId: 'credential',
        issuer: 'local:credential',
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { restaurant, tables, categories: DEMO_MENU.length, items, users: DEMO_STAFF.length };
  });

  const guestUrls: string[] = [];
  for (const table of [...inserted.tables].sort((a, b) => a.number - b.number)) {
    const token = await signTableToken(
      { tableId: table.id, restaurantId: inserted.restaurant.id, tableNumber: table.number },
      { secret: opts.tableTokenSecret, ttlSeconds: opts.tableTokenTtlDays * 86_400, now },
    );
    guestUrls.push(`${opts.webOrigin}/t/${token}`);
  }

  return {
    skipped: false,
    counts: {
      restaurants: 1,
      tables: inserted.tables.length,
      categories: inserted.categories,
      items: inserted.items,
      users: inserted.users,
    },
    guestUrls,
  };
}
