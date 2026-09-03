import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
