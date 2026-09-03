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
    expect(dto.status).toBe('placed');
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
});
