import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './testing';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.close(); });

type Rows = { rows: Record<string, unknown>[] };

describe('migrations', () => {
  it('create every table from the spec', async () => {
    const rows = (await ctx.db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`)) as unknown as Rows;
    const names = rows.rows.map((r) => r.table_name as string);
    for (const t of ['restaurants', 'tables', 'menu_categories', 'menu_items', 'orders', 'order_items', 'payments', 'users', 'sessions', 'accounts', 'verifications', 'guest_sessions', 'audit_log']) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });
  it('defines the order_status enum with all seven statuses', async () => {
    const rows = (await ctx.db.execute(sql`select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where pg_type.typname = 'order_status' order by enumsortorder`)) as unknown as Rows;
    expect(rows.rows.map((r) => r.enumlabel)).toEqual(['draft', 'placed', 'paid', 'cooking', 'ready', 'served', 'cancelled']);
  });
  it('enforces unique table numbers per restaurant', async () => {
    const r = (await ctx.db.execute(sql`insert into restaurants (name, slug) values ('R', 'r') returning id`)) as unknown as Rows;
    const rid = r.rows[0]?.id as string;
    await ctx.db.execute(sql`insert into tables (restaurant_id, number, label, seats) values (${rid}, 1, 'Table 1', 2)`);
    await expect(ctx.db.execute(sql`insert into tables (restaurant_id, number, label, seats) values (${rid}, 1, 'Dup', 2)`)).rejects.toThrow();
  });
});
