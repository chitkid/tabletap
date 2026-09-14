import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { IDEMPOTENCY_KEY_HEADER, OrderResponseSchema } from '@tabletap/shared';
import { signTableToken } from '@tabletap/shared/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, createTestApp } from '../test/helpers';
import { createTable, deleteTable, listTables, reissueQr, updateTable } from './tables-admin';

const ACTOR = 'u-admin';

describe('tables-admin', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let restaurantId: string;

  async function tableByNumber(number: number) {
    const [row] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, number));
    if (!row) throw new Error(`table ${number} not present`);
    return row;
  }

  async function auditsFor(action: string, entityId: string) {
    const rows = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
    return rows.filter((r) => r.entityId === entityId);
  }

  /** Places a real order at this table, through the HTTP surface, so `orders` really holds one. */
  async function orderAt(tableNumber: number): Promise<void> {
    const table = await tableByNumber(tableNumber);
    const token = await signTableToken(
      { tableId: table.id, restaurantId, tableNumber, qrVersion: table.qrVersion },
      { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 },
    );
    const claim = await ctx.app.inject({
      method: 'POST',
      url: '/api/guest/claim',
      payload: { token },
    });
    expect(claim.statusCode).toBe(200);
    const cookie = claim.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const [item] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.name, 'Хачапури по-аджарски'));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      payload: { items: [{ menuItemId: item!.id, quantity: 1 }] },
    });
    expect(res.statusCode).toBeLessThan(300);
    OrderResponseSchema.parse(res.json());
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    const [restaurant] = await ctx.db
      .select({ id: schema.restaurants.id })
      .from(schema.restaurants);
    restaurantId = restaurant!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('creates a table with the seat and activity defaults, and audits it', async () => {
    const table = await createTable(
      ctx.db,
      restaurantId,
      { number: 20, label: 'Terrace 20' },
      ACTOR,
    );
    expect(table).toMatchObject({ number: 20, label: 'Terrace 20', seats: 2, isActive: true });
    const audits = await auditsFor('table.created', table.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: 'user', actorId: ACTOR, entityType: 'table' });
    expect(audits[0]!.payload).toMatchObject({ number: 20, label: 'Terrace 20' });
    // A new table starts at version 1: nothing has been reissued yet.
    const [row] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.id, table.id));
    expect(row!.qrVersion).toBe(1);
  });

  it('answers a duplicate table number with 409 CONFLICT rather than letting the index 500', async () => {
    // Table 3 is seeded; the unique index on (restaurant_id, number) is what refuses this.
    await expect(
      createTable(ctx.db, restaurantId, { number: 3, label: 'Impostor' }, ACTOR),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    // And on the way in through an edit, not only a create.
    const spare = await createTable(
      ctx.db,
      restaurantId,
      { number: 21, label: 'Terrace 21' },
      ACTOR,
    );
    await expect(
      updateTable(ctx.db, restaurantId, spare.id, { number: 3 }, ACTOR),
    ).rejects.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    // The refused edit wrote nothing and audited nothing.
    const [unchanged] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.id, spare.id));
    expect(unchanged!.number).toBe(21);
    expect(await auditsFor('table.updated', spare.id)).toHaveLength(0);
  });

  it('refuses to delete a table that has orders (409 IN_USE) and names deactivation instead', async () => {
    const table = await tableByNumber(5);
    await orderAt(5);
    await expect(deleteTable(ctx.db, restaurantId, table.id, ACTOR)).rejects.toMatchObject({
      code: 'IN_USE',
      statusCode: 409,
      message: 'This table has orders. Deactivate it instead.',
    });
    const [stillThere] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.id, table.id));
    expect(stillThere).toBeDefined();
    // The guarded statement refused: the order history is untouched and nothing was audited.
    const orders = await ctx.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.tableId, table.id));
    expect(orders.length).toBeGreaterThan(0);
    expect(await auditsFor('table.deleted', table.id)).toHaveLength(0);
  });

  it('deletes a table with no orders, and audits it', async () => {
    const table = await createTable(ctx.db, restaurantId, { number: 22, label: 'Spare' }, ACTOR);
    await expect(deleteTable(ctx.db, restaurantId, table.id, ACTOR)).resolves.toBeUndefined();
    const [gone] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.id, table.id));
    expect(gone).toBeUndefined();
    const audits = await auditsFor('table.deleted', table.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({ number: 22, label: 'Spare' });
  });

  it('reissues a QR: one version bump, one audit row, and every other table left alone', async () => {
    const before = await tableByNumber(8);
    const others = await ctx.db.select().from(schema.tables);
    const table = await reissueQr(ctx.db, restaurantId, before.id, ACTOR);
    expect(table.number).toBe(8);
    const after = await tableByNumber(8);
    expect(after.qrVersion).toBe(before.qrVersion + 1);
    const audits = await auditsFor('table.qr_reissued', before.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: 'user', actorId: ACTOR, entityType: 'table' });
    expect(audits[0]!.payload).toMatchObject({
      changed: { qrVersion: { from: before.qrVersion, to: after.qrVersion } },
    });
    for (const other of others.filter((t) => t.id !== before.id)) {
      const [now] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.id, other.id));
      expect(now!.qrVersion, `table ${other.number}`).toBe(other.qrVersion);
    }
  });

  it('a code printed before the reissue is refused by POST /api/guest/claim afterwards', async () => {
    const table = await createTable(ctx.db, restaurantId, { number: 30, label: 'Proof' }, ACTOR);
    const [row] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.id, table.id));
    const printed = await signTableToken(
      { tableId: table.id, restaurantId, tableNumber: 30, qrVersion: row!.qrVersion },
      { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 },
    );
    // The printed code works right up to the moment staff reissue it.
    const beforeClaim = await ctx.app.inject({
      method: 'POST',
      url: '/api/guest/claim',
      payload: { token: printed },
    });
    expect(beforeClaim.statusCode).toBe(200);

    await reissueQr(ctx.db, restaurantId, table.id, ACTOR);

    const afterClaim = await ctx.app.inject({
      method: 'POST',
      url: '/api/guest/claim',
      payload: { token: printed },
    });
    expect(afterClaim.statusCode).toBe(401);
    expect(afterClaim.json().error).toMatchObject({
      code: 'TOKEN_INVALID',
      message: 'This QR code is no longer valid. Ask staff for a new one.',
    });
    // The signature is still good; only the version is stale - so a freshly printed code works.
    const [reissued] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.id, table.id));
    const reprinted = await signTableToken(
      { tableId: table.id, restaurantId, tableNumber: 30, qrVersion: reissued!.qrVersion },
      { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 },
    );
    const fresh = await ctx.app.inject({
      method: 'POST',
      url: '/api/guest/claim',
      payload: { token: reprinted },
    });
    expect(fresh.statusCode).toBe(200);
  });

  it('hides a table outside the restaurant behind 404, never 403, on every write', async () => {
    const table = await tableByNumber(9);
    const otherRestaurantId = randomUUID();
    await expect(
      updateTable(ctx.db, otherRestaurantId, table.id, { label: 'Hijacked' }, ACTOR),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
    await expect(deleteTable(ctx.db, otherRestaurantId, table.id, ACTOR)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    await expect(reissueQr(ctx.db, otherRestaurantId, table.id, ACTOR)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
    const [untouched] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.id, table.id));
    expect(untouched!.label).toBe(table.label);
    expect(untouched!.qrVersion).toBe(table.qrVersion);
  });

  it('an update writes only the fields it was given, and audits from and to', async () => {
    const table = await createTable(
      ctx.db,
      restaurantId,
      { number: 31, label: 'Window', seats: 4 },
      ACTOR,
    );
    const updated = await updateTable(ctx.db, restaurantId, table.id, { isActive: false }, ACTOR);
    expect(updated.isActive).toBe(false);
    expect(updated.label).toBe('Window'); // untouched by the partial update
    expect(updated.seats).toBe(4); // untouched by the partial update
    const audits = await auditsFor('table.updated', table.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({
      changed: { isActive: { from: true, to: false } },
    });
  });

  it('a concurrent edit loses the race: 409 CONFLICT, and no audit row records a stale transition', async () => {
    const table = await createTable(ctx.db, restaurantId, { number: 32, label: 'Race' }, ACTOR);
    const results = await Promise.allSettled([
      updateTable(ctx.db, restaurantId, table.id, { seats: 6 }, ACTOR),
      updateTable(ctx.db, restaurantId, table.id, { seats: 8 }, ACTOR),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    const winner = results.find(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof updateTable>>> =>
        r.status === 'fulfilled',
    )!;
    const audits = await auditsFor('table.updated', table.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({
      changed: { seats: { from: 2, to: winner.value.seats } },
    });
  });

  it('lists only this restaurant tables, ordered by number', async () => {
    const [other] = await ctx.db
      .insert(schema.restaurants)
      .values({ name: 'Other House', slug: `other-house-${randomUUID()}` })
      .returning();
    try {
      await ctx.db
        .insert(schema.tables)
        .values({ restaurantId: other!.id, number: 1, label: 'Theirs' });
      const tables = await listTables(ctx.db, restaurantId);
      expect(tables.some((t) => t.label === 'Theirs')).toBe(false);
      const numbers = tables.map((t) => t.number);
      expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
      expect(numbers).toContain(1);
    } finally {
      await ctx.db.delete(schema.restaurants).where(eq(schema.restaurants.id, other!.id));
    }
  });
});
