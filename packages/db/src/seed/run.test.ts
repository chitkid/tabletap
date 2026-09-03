import { verifyPassword } from 'better-auth/crypto';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signTableToken, verifyTableToken } from '@tabletap/shared/server';
import * as schema from '../schema/index';
import { createTestDb } from '../testing';
import { DEMO_RESTAURANT_SLUG, DEMO_STAFF } from './data';
import { seed, type SeedOptions } from './run';

const opts: SeedOptions = {
  mode: 'reset',
  demoPassword: 'tabletap-demo',
  tableTokenSecret: 'test-table-token-secret-0123456789abcdef',
  tableTokenTtlDays: 365,
  webOrigin: 'http://localhost:3000',
};

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

async function countRows() {
  const [r, t, c, i, u, a] = await Promise.all([
    ctx.db.select({ n: count() }).from(schema.restaurants),
    ctx.db.select({ n: count() }).from(schema.tables),
    ctx.db.select({ n: count() }).from(schema.menuCategories),
    ctx.db.select({ n: count() }).from(schema.menuItems),
    ctx.db.select({ n: count() }).from(schema.users),
    ctx.db.select({ n: count() }).from(schema.accounts),
  ]);
  return {
    restaurants: r[0]?.n,
    tables: t[0]?.n,
    categories: c[0]?.n,
    items: i[0]?.n,
    users: u[0]?.n,
    accounts: a[0]?.n,
  };
}

/** Natural key to id, so a reset can be compared with the run before it. */
async function seededIds() {
  const [tables, items] = await Promise.all([
    ctx.db.select({ number: schema.tables.number, id: schema.tables.id }).from(schema.tables),
    ctx.db.select({ name: schema.menuItems.name, id: schema.menuItems.id }).from(schema.menuItems),
  ]);
  return {
    tables: tables.map((t) => [t.number, t.id] as const).sort((a, b) => a[0] - b[0]),
    items: items.map((i) => [i.name, i.id] as const).sort((a, b) => a[0].localeCompare(b[0])),
  };
}

describe('seed', () => {
  it('seeds Little Furnace with 12 tables, 4 categories, 20 items and 3 staff', async () => {
    const result = await seed(ctx.db, opts);
    expect(result.skipped).toBe(false);
    expect(result.counts).toEqual({
      restaurants: 1,
      tables: 12,
      categories: 4,
      items: 20,
      users: 3,
    });
    expect(await countRows()).toEqual({
      restaurants: 1,
      tables: 12,
      categories: 4,
      items: 20,
      users: 3,
      accounts: 3,
    });
    const [restaurant] = await ctx.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
    expect(restaurant?.name).toBe('Little Furnace');
    expect(restaurant?.currency).toBe('USD');
  });
  it('marks exactly one item unavailable', async () => {
    const unavailable = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.isAvailable, false));
    expect(unavailable.map((i) => i.name)).toEqual(['Burrata & Peaches']);
  });
  it('creates staff accounts whose password verifies with better-auth', async () => {
    for (const staff of DEMO_STAFF) {
      const [user] = await ctx.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, staff.email));
      expect(user?.role).toBe(staff.role);
      expect(user?.name).toBe(staff.name);
      const [account] = await ctx.db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, user!.id));
      expect(account?.providerId).toBe('credential');
      expect(account?.issuer).toBe('local:credential');
      expect(account?.accountId).toBe(user!.id);
      expect(await verifyPassword({ hash: account!.password!, password: 'tabletap-demo' })).toBe(
        true,
      );
    }
  });
  it('returns one signed guest URL per table', async () => {
    const result = await seed(ctx.db, opts);
    expect(result.guestUrls).toHaveLength(12);
    const token = result.guestUrls[0]!.replace('http://localhost:3000/t/', '');
    const claims = await verifyTableToken(token, { secret: opts.tableTokenSecret });
    expect(claims.tableNumber).toBe(1);
  });
  it('reset twice yields identical counts', async () => {
    await seed(ctx.db, opts);
    const first = await countRows();
    await seed(ctx.db, opts);
    expect(await countRows()).toEqual(first);
  });
  it('gives tables and items the same ids after every reset', async () => {
    await seed(ctx.db, opts);
    const first = await seededIds();
    await seed(ctx.db, opts);
    const second = await seededIds();
    expect(second).toEqual(first);
    expect(second.tables).toHaveLength(12);
    expect(second.items).toHaveLength(20);
  });
  it('still claims a table with a token signed before the reset', async () => {
    await seed(ctx.db, opts);
    const [restaurant] = await ctx.db.select().from(schema.restaurants);
    const [table] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, 7));
    const token = await signTableToken(
      { tableId: table!.id, restaurantId: restaurant!.id, tableNumber: 7 },
      { secret: opts.tableTokenSecret, ttlSeconds: 86_400 },
    );

    await seed(ctx.db, opts);

    const claims = await verifyTableToken(token, { secret: opts.tableTokenSecret });
    const [after] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.id, claims.tableId));
    expect(after?.number).toBe(7);
    const [restaurantAfter] = await ctx.db.select().from(schema.restaurants);
    expect(claims.restaurantId).toBe(restaurantAfter!.id);
    expect(after?.restaurantId).toBe(claims.restaurantId);
  });
  it('if-empty skips when the restaurant exists and seeds when it does not', async () => {
    const skipped = await seed(ctx.db, { ...opts, mode: 'if-empty' });
    expect(skipped.skipped).toBe(true);
    await ctx.db.delete(schema.restaurants);
    await ctx.db.delete(schema.users);
    const seeded = await seed(ctx.db, { ...opts, mode: 'if-empty' });
    expect(seeded.skipped).toBe(false);
    expect((await countRows()).tables).toBe(12);
  });
});
