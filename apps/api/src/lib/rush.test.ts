import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/helpers';
import { RUSH_NOTES, createRush, placeRushOrder } from './rush';

describe('rush', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const log = { error: vi.fn() };
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('places one system order with real menu prices on an active table', async () => {
    const seen: string[] = [];
    ctx.app.orderEvents.once('order:created', (o) => seen.push(o.id));
    const dto = await placeRushOrder({
      db: ctx.db,
      events: ctx.app.orderEvents,
      random: () => 0.2,
    });
    expect(dto.status).toBe('paid');
    expect(dto.items.length).toBeGreaterThan(0);
    expect(dto.note).toBe(RUSH_NOTES[Math.floor(0.2 * RUSH_NOTES.length)]);
    expect(seen).toEqual([dto.id]);
    const rows = await ctx.db.select().from(schema.auditLog);
    expect(
      rows.some(
        (r) =>
          r.entityId === dto.id &&
          r.actorType === 'system' &&
          (r.payload as { source?: string }).source === 'rush',
      ),
    ).toBe(true);
  });
  it('places a rush order that the kitchen may start: paid, with a demo payment beside it', async () => {
    const dto = await placeRushOrder({
      db: ctx.db,
      events: ctx.app.orderEvents,
      random: () => 0.2,
    });
    expect(dto.status).toBe('paid');
    expect(dto.paidAt).not.toBeNull();
    const [payment] = await ctx.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, dto.id));
    expect(payment).toMatchObject({
      provider: 'demo',
      status: 'succeeded',
      amountCents: dto.totalCents,
    });
    const audit = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, dto.id));
    expect(audit.map((a) => a.action)).toContain('payment.succeeded');
    expect(payment?.currency).toBe(dto.currency);
  });
  it('writes the payment in the restaurant’s own currency, not a literal', async () => {
    // The seeded demo restaurant charges in roubles, which is also what the payments column now
    // defaults to, so the only way to see the difference is to move the restaurant off it.
    const [restaurant] = await ctx.db.select().from(schema.restaurants);
    await ctx.db
      .update(schema.restaurants)
      .set({ currency: 'EUR' })
      .where(eq(schema.restaurants.id, restaurant!.id));
    try {
      const dto = await placeRushOrder({
        db: ctx.db,
        events: ctx.app.orderEvents,
        random: () => 0.2,
      });
      expect(dto.currency).toBe('EUR');
      const [payment] = await ctx.db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.orderId, dto.id));
      // A payments row whose currency contradicts its own order is worse than a wrong currency:
      // it is two different answers to one question about the same money.
      expect(payment?.currency).toBe('EUR');
    } finally {
      await ctx.db
        .update(schema.restaurants)
        .set({ currency: restaurant!.currency })
        .where(eq(schema.restaurants.id, restaurant!.id));
    }
  });
  it('spreads `count` orders over `durationMs`, runs once at a time, and stops on demand', async () => {
    const rush = createRush({
      db: ctx.db,
      events: ctx.app.orderEvents,
      log,
      durationMs: 3_000,
      count: 3,
      random: () => 0.5,
    });
    const created: string[] = [];
    ctx.app.orderEvents.on('order:created', (o) => created.push(o.id));
    expect(rush.start()).toBe(true);
    expect(rush.start()).toBe(false);
    expect(rush.running).toBe(true);
    await vi.advanceTimersByTimeAsync(1_100);
    // The timers are fake; the database round-trips behind them are real. vi.waitFor advances
    // the fake clock between checks, so the pending inserts settle without a real sleep.
    await vi.waitFor(() => expect(created.length).toBe(2));
    rush.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(created.length).toBe(2);
    expect(rush.running).toBe(false);
  });
  it('finishes on its own after the last order', async () => {
    const rush = createRush({
      db: ctx.db,
      events: ctx.app.orderEvents,
      log,
      durationMs: 1_000,
      count: 2,
      random: () => 0.5,
    });
    rush.start();
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.waitFor(() => expect(rush.running).toBe(false));
    expect(rush.start()).toBe(true);
    rush.stop();
  });
  it('a straggler from a stopped run cannot finish the next run', async () => {
    const rush = createRush({
      db: ctx.db,
      events: ctx.app.orderEvents,
      log,
      durationMs: 1_000,
      count: 2,
      random: () => 0.5,
    });
    const created: string[] = [];
    ctx.app.orderEvents.on('order:created', (o) => created.push(o.id));
    rush.start();
    // Sync advance: fires run 1's first timer but does not flush the microtasks behind it, so
    // its `placeRushOrder` call is genuinely still in flight (no query has resolved yet) when
    // `stop()` runs below. `advanceTimersByTimeAsync` would drain it to completion immediately,
    // which defeats the point of this test.
    vi.advanceTimersByTime(0);
    void rush.stop(); // clears run 1's still-pending second timer and bumps the generation; the
    // in-flight straggler from run 1 is deliberately left unawaited
    expect(rush.start()).toBe(true); // run 2 begins under a fresh generation
    const before = created.length;
    // Three real orders land, in issuance order: the run-1 straggler (issued above, first), then
    // run 2's own two. A straggler `.finally` that could still decrement run 2's `pending` would
    // drive it to 0 - and flip `running` false - after only two of the three land, one order
    // short of what run 2 actually asked for.
    await vi.waitFor(() => expect(created.length).toBe(before + 2));
    expect(rush.running).toBe(true);
    await vi.waitFor(() => expect(created.length).toBe(before + 3));
    expect(rush.running).toBe(false);
    expect(rush.start()).toBe(true);
    await rush.stop();
  });
  it('stop() resolves only after in-flight orders settle', async () => {
    const rush = createRush({
      db: ctx.db,
      events: ctx.app.orderEvents,
      log,
      durationMs: 1_000,
      count: 2,
      random: () => 0.5,
    });
    const created: string[] = [];
    ctx.app.orderEvents.on('order:created', (o) => created.push(o.id));
    rush.start();
    // Sync advance, not the Async variant: fires the first timer without draining the promise
    // chain behind it, so the order is genuinely in flight (not already settled) when `stop()`
    // is awaited below. The second timer (at 500ms) is still pending.
    vi.advanceTimersByTime(0);
    await rush.stop(); // must not resolve before the in-flight order actually settles
    expect(created.length).toBe(1);
    const orderId = created[0]!;
    const rows = await ctx.db.select().from(schema.orders);
    expect(rows.some((o) => o.id === orderId)).toBe(true);
    const afterStop = created.length;
    await vi.advanceTimersByTimeAsync(5_000); // the cleared second timer never fires
    expect(created.length).toBe(afterStop);
  });
});
