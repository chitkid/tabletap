import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from './schema/index';
import { createTestDb } from './testing';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

type Rows = { rows: Record<string, unknown>[] };

describe('migrations', () => {
  it('create every table from the spec', async () => {
    const rows = (await ctx.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )) as unknown as Rows;
    const names = rows.rows.map((r) => r.table_name as string);
    for (const t of [
      'restaurants',
      'tables',
      'menu_categories',
      'menu_items',
      'orders',
      'order_items',
      'payments',
      'users',
      'sessions',
      'accounts',
      'verifications',
      'guest_sessions',
      'audit_log',
    ]) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });
  it('defines the order_status enum with all seven statuses', async () => {
    const rows = (await ctx.db.execute(
      sql`select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where pg_type.typname = 'order_status' order by enumsortorder`,
    )) as unknown as Rows;
    expect(rows.rows.map((r) => r.enumlabel)).toEqual([
      'draft',
      'placed',
      'paid',
      'cooking',
      'ready',
      'served',
      'cancelled',
    ]);
  });
  it('enforces unique table numbers per restaurant', async () => {
    const r = (await ctx.db.execute(
      sql`insert into restaurants (name, slug) values ('R', 'r') returning id`,
    )) as unknown as Rows;
    const rid = r.rows[0]?.id as string;
    await ctx.db.execute(
      sql`insert into tables (restaurant_id, number, label, seats) values (${rid}, 1, 'Table 1', 2)`,
    );
    await expect(
      ctx.db.execute(
        sql`insert into tables (restaurant_id, number, label, seats) values (${rid}, 1, 'Dup', 2)`,
      ),
    ).rejects.toThrow();
  });
  it('numbers orders with an identity column and indexes the hot columns', async () => {
    const r = (await ctx.db.execute(sql`select id from restaurants limit 1`)) as unknown as {
      rows: { id: string }[];
    };
    const t = (await ctx.db.execute(sql`select id from tables limit 1`)) as unknown as {
      rows: { id: string }[];
    };
    const rid = r.rows[0]!.id,
      tid = t.rows[0]!.id;
    const a = (await ctx.db.execute(
      sql`insert into orders (restaurant_id, table_id, status) values (${rid}, ${tid}, 'placed') returning number`,
    )) as unknown as { rows: { number: number }[] };
    const b = (await ctx.db.execute(
      sql`insert into orders (restaurant_id, table_id, status) values (${rid}, ${tid}, 'placed') returning number`,
    )) as unknown as { rows: { number: number }[] };
    expect(b.rows[0]!.number).toBe(a.rows[0]!.number + 1);
    const idx = (await ctx.db.execute(
      sql`select indexname from pg_indexes where schemaname = 'public'`,
    )) as unknown as { rows: { indexname: string }[] };
    const names = idx.rows.map((x) => x.indexname);
    for (const n of [
      'orders_table_id_idx',
      'orders_status_idx',
      'orders_number_uidx',
      'order_items_order_id_idx',
      'guest_sessions_expires_at_idx',
      'audit_log_action_idx',
    ])
      expect(names, n).toContain(n);
  });
  it('stores updated_at at exactly the precision a JS Date can carry, so a value read back always guards its own row', async () => {
    const inserted = (await ctx.db.execute(
      sql`insert into restaurants (name, slug) values ('Precision', 'precision-check') returning id`,
    )) as unknown as Rows;
    const id = inserted.rows[0]!.id as string;
    // What an unconstrained timestamp column actually receives from Postgres's own now(): six
    // fractional digits (microseconds) - one more level of precision than a JS Date can hold.
    await ctx.db.execute(
      sql`update restaurants set updated_at = '2026-03-14 09:26:53.123456+00' where id = ${id}`,
    );
    const [row] = await ctx.db
      .select({ updatedAt: schema.restaurants.updatedAt })
      .from(schema.restaurants)
      .where(eq(schema.restaurants.id, id));
    const before = row!.updatedAt;
    // The exact guard apps/api/src/lib/menu-admin.ts's updateCategory/updateItem run:
    // WHERE id = ... AND updated_at = <the Date just read>. Drizzle serialises `before` through
    // .toISOString(), which always carries three fractional digits - if the column stores more,
    // Postgres compares a six-digit value on disk against a three-digit value in the query and
    // finds no match, so the guard refuses every write forever, for reasons that have nothing to
    // do with a concurrent writer.
    const guarded = await ctx.db
      .update(schema.restaurants)
      .set({ name: 'Precision Retried' })
      .where(and(eq(schema.restaurants.id, id), eq(schema.restaurants.updatedAt, before)))
      .returning();
    expect(guarded).toHaveLength(1);
  });
});
