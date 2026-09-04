import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, type Db } from '@tabletap/db';
import { createTestDb } from '@tabletap/db/testing';
import { loadDashboard } from './dashboard';

// Pinned, never `new Date()`: today is 2026-09-05 (UTC), so the week runs 2026-08-30..2026-09-05.
const NOW = new Date('2026-09-05T12:00:00.000Z');

type OrderOverrides = Partial<typeof schema.orders.$inferInsert>;

describe('loadDashboard', () => {
  let ctx: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** A restaurant with its own table, isolated from every other test in this file. */
  async function newRestaurant(
    timezone = 'UTC',
  ): Promise<{ restaurantId: string; tableId: string }> {
    const [restaurant] = await ctx.db
      .insert(schema.restaurants)
      .values({ name: 'Test House', slug: `test-house-${randomUUID()}`, timezone })
      .returning();
    const [table] = await ctx.db
      .insert(schema.tables)
      .values({ restaurantId: restaurant!.id, number: 1, label: 'Table 1' })
      .returning();
    return { restaurantId: restaurant!.id, tableId: table!.id };
  }

  async function insertOrder(
    db: Db,
    restaurantId: string,
    tableId: string,
    overrides: OrderOverrides = {},
  ): Promise<void> {
    await db.insert(schema.orders).values({ restaurantId, tableId, status: 'paid', ...overrides });
  }

  it('answers zeros, a null average and seven zero-filled days for an empty restaurant', async () => {
    const { restaurantId } = await newRestaurant();
    const dashboard = await loadDashboard(ctx.db, restaurantId, NOW);
    expect(dashboard.today).toEqual({
      orders: 0,
      revenueCents: 0,
      averageReadyMs: null,
      openTickets: 0,
    });
    expect(dashboard.week).toHaveLength(7);
    expect(dashboard.week.every((day) => day.orders === 0)).toBe(true);
  });

  it('counts an order paid today once and does not count one paid yesterday', async () => {
    const { restaurantId, tableId } = await newRestaurant();
    await insertOrder(ctx.db, restaurantId, tableId, {
      paidAt: new Date('2026-09-05T09:00:00.000Z'), // today
      totalCents: 1500,
    });
    await insertOrder(ctx.db, restaurantId, tableId, {
      paidAt: new Date('2026-09-04T23:59:59.000Z'), // yesterday, one second before midnight
      totalCents: 2000,
    });
    const dashboard = await loadDashboard(ctx.db, restaurantId, NOW);
    expect(dashboard.today.orders).toBe(1);
    expect(dashboard.today.revenueCents).toBe(1500);
  });

  it('averages only the orders that reached ready today; a cooking order contributes nothing', async () => {
    const { restaurantId, tableId } = await newRestaurant();
    const paidAt = new Date('2026-09-05T09:00:00.000Z');
    // Reached ready 90 seconds after paid, then moved on to served - still counts, per the rule
    // that ready_at is set once and never cleared.
    await insertOrder(ctx.db, restaurantId, tableId, {
      status: 'served',
      paidAt,
      readyAt: new Date(paidAt.getTime() + 90_000),
      servedAt: new Date(paidAt.getTime() + 120_000),
    });
    // Still cooking: no ready_at at all, must not pull the average down.
    await insertOrder(ctx.db, restaurantId, tableId, {
      status: 'cooking',
      paidAt,
      readyAt: null,
    });
    const dashboard = await loadDashboard(ctx.db, restaurantId, NOW);
    expect(dashboard.today.averageReadyMs).toBe(90_000);
  });

  it('counts only paid and cooking orders as open tickets, regardless of when they were paid', async () => {
    const { restaurantId, tableId } = await newRestaurant();
    await insertOrder(ctx.db, restaurantId, tableId, { status: 'paid' });
    await insertOrder(ctx.db, restaurantId, tableId, { status: 'cooking' });
    await insertOrder(ctx.db, restaurantId, tableId, { status: 'ready' });
    await insertOrder(ctx.db, restaurantId, tableId, { status: 'served' });
    await insertOrder(ctx.db, restaurantId, tableId, { status: 'cancelled' });
    const dashboard = await loadDashboard(ctx.db, restaurantId, NOW);
    expect(dashboard.today.openTickets).toBe(2);
  });

  it('lays out the week with today last and six days back first, zero-filling the gaps', async () => {
    const { restaurantId, tableId } = await newRestaurant();
    // Two orders today, one six days back, and nothing on 2026-09-02 (must still show as zero).
    await insertOrder(ctx.db, restaurantId, tableId, {
      paidAt: new Date('2026-09-05T08:00:00.000Z'),
    });
    await insertOrder(ctx.db, restaurantId, tableId, {
      paidAt: new Date('2026-09-05T18:00:00.000Z'),
    });
    await insertOrder(ctx.db, restaurantId, tableId, {
      paidAt: new Date('2026-08-30T12:00:00.000Z'),
    });

    const dashboard = await loadDashboard(ctx.db, restaurantId, NOW);
    expect(dashboard.week.map((day) => day.date)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
    expect(dashboard.week[0]).toEqual({ date: '2026-08-30', orders: 1 });
    expect(dashboard.week[3]).toEqual({ date: '2026-09-02', orders: 0 });
    expect(dashboard.week.at(-1)).toEqual({ date: '2026-09-05', orders: 2 });
  });

  it("never lets one restaurant's orders bleed into another's dashboard", async () => {
    const own = await newRestaurant();
    const other = await newRestaurant();
    await insertOrder(ctx.db, other.restaurantId, other.tableId, {
      paidAt: new Date('2026-09-05T09:00:00.000Z'),
      totalCents: 999_999,
    });
    const dashboard = await loadDashboard(ctx.db, own.restaurantId, NOW);
    expect(dashboard.today).toEqual({
      orders: 0,
      revenueCents: 0,
      averageReadyMs: null,
      openTickets: 0,
    });
    expect(dashboard.week.every((day) => day.orders === 0)).toBe(true);
  });

  it("uses the restaurant's own timezone for the day boundary, not UTC's", async () => {
    // Pacific/Kiritimati is UTC+14: at 2026-09-05T12:00:00Z it is already 2026-09-06 there, so an
    // order paid at that instant belongs to the *next* UTC day locally.
    const { restaurantId, tableId } = await newRestaurant('Pacific/Kiritimati');
    await insertOrder(ctx.db, restaurantId, tableId, { paidAt: NOW });
    const dashboard = await loadDashboard(ctx.db, restaurantId, NOW);
    expect(dashboard.today.orders).toBe(1);
    expect(dashboard.week.at(-1)!.date).toBe('2026-09-06');
  });
});
