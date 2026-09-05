import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema, type Db } from '@tabletap/db';
import { DEMO_RESTAURANT_SLUG } from '@tabletap/db/seed';
import { recordAudit } from './audit';
import type { OrderEvents } from './order-events';
import { hydrate, insertPlacedOrder, type InternalOrderDto, type OrderLine } from './orders';

export const RUSH_NOTES = [
  'No onions, please.',
  'Extra chili on the side.',
  'Birthday at the table.',
  'Allergic to nuts.',
  'Split the flatbread in two.',
  'We are in a hurry.',
] as const;

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** One order a guest could have placed: random active table, one to four available dishes. */
export async function placeRushOrder(input: {
  db: Db;
  events: OrderEvents;
  random?: () => number;
  now?: Date;
}): Promise<InternalOrderDto> {
  const random = input.random ?? Math.random;
  const now = input.now ?? new Date();
  const [restaurant] = await input.db
    .select({ id: schema.restaurants.id, currency: schema.restaurants.currency })
    .from(schema.restaurants)
    .where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
  if (!restaurant) throw new Error('demo restaurant is not seeded');
  const tables = await input.db
    .select({ id: schema.tables.id })
    .from(schema.tables)
    .where(and(eq(schema.tables.restaurantId, restaurant.id), eq(schema.tables.isActive, true)));
  const dishes = await input.db
    .select({
      id: schema.menuItems.id,
      name: schema.menuItems.name,
      priceCents: schema.menuItems.priceCents,
    })
    .from(schema.menuItems)
    .innerJoin(schema.menuCategories, eq(schema.menuCategories.id, schema.menuItems.categoryId))
    .where(
      and(
        eq(schema.menuCategories.restaurantId, restaurant.id),
        eq(schema.menuCategories.isActive, true),
        eq(schema.menuItems.isAvailable, true),
      ),
    );
  if (tables.length === 0 || dishes.length === 0)
    throw new Error('demo tables or menu are not seeded');

  const count = 1 + Math.floor(random() * 4);
  // Draw from a shrinking pool rather than retrying on a Map key collision: a deterministic
  // (constant) `random`, as the tests use, would otherwise pick the same dish forever and the
  // loop below would never terminate.
  const pool = [...dishes];
  const chosen: (typeof dishes)[number][] = [];
  while (chosen.length < Math.min(count, dishes.length)) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    chosen.push(pool[index]!);
    pool.splice(index, 1);
  }
  const lines: OrderLine[] = chosen.map((d) => {
    const quantity = 1 + Math.floor(random() * 3);
    return {
      menuItemId: d.id,
      nameSnapshot: d.name,
      unitPriceCents: d.priceCents,
      quantity,
      lineTotalCents: d.priceCents * quantity,
    };
  });
  const note = random() < 0.34 ? pick(RUSH_NOTES, random) : null;
  const row = await input.db.transaction(async (tx) => {
    const order = await insertPlacedOrder(tx, {
      restaurantId: restaurant.id,
      tableId: pick(tables, random).id,
      guestSessionId: null,
      lines,
      note,
      idempotencyKey: `rush:${randomUUID()}`,
      actor: { actorType: 'system', actorId: null },
      auditPayload: { source: 'rush' },
      now,
    });
    // A rush exists to fill the board, and the board holds paid tickets: the money is as
    // fictional as the order, and the audit row says `demo` so no reader mistakes it (ADR 0011).
    const [payment] = await tx
      .insert(schema.payments)
      .values({
        orderId: order.id,
        provider: 'demo',
        amountCents: order.totalCents,
        // Read from the restaurant, like every other write path: `startPayment` takes it off the
        // order, and the order takes it from here. A literal would write a payments row whose
        // currency contradicts its own order's the moment a restaurant charges in anything else.
        currency: restaurant.currency,
        status: 'succeeded',
        providerSessionId: `demo:rush:${order.id}`,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const [paid] = await tx
      .update(schema.orders)
      .set({ status: 'paid', paidAt: now, updatedAt: now })
      .where(eq(schema.orders.id, order.id))
      .returning();
    await recordAudit(tx, {
      actorType: 'system',
      actorId: null,
      action: 'payment.succeeded',
      entityType: 'order',
      entityId: order.id,
      payload: {
        provider: 'demo',
        source: 'rush',
        paymentId: payment?.id ?? null,
        amountCents: order.totalCents,
      },
    });
    return paid ?? order;
  });
  const dto = (await hydrate(input.db, [row]))[0]!;
  input.events.emit('order:created', dto);
  return dto;
}

export interface Rush {
  readonly running: boolean;
  readonly durationSeconds: number;
  readonly ordersPlanned: number;
  start(): boolean;
  /** Resolves once every in-flight order from the stopped run has settled. */
  stop(): Promise<void>;
}

/**
 * Spreads `count` orders over `durationMs` with ±1 s jitter; one rush at a time per process.
 *
 * Each `start()` owns a `generation` number. A timer that already fired before `stop()` is
 * called keeps running its `placeRushOrder` to completion (there is no way to cancel work that
 * is already in flight against the database), but its `.finally` only touches `pending`/`finish`
 * when its captured generation still matches the current one — so a straggler from a stopped run
 * can never decrement a later run's counter or flip its `running` back to false. `stop()` also
 * awaits every in-flight order via `inFlight` so callers (plugin shutdown, the demo reset) never
 * race a still-open transaction against a closing database or an imminent reseed.
 */
export function createRush(opts: {
  db: Db;
  events: OrderEvents;
  log: { error(obj: unknown, msg: string): void };
  durationMs?: number;
  count?: number;
  random?: () => number;
}): Rush {
  const durationMs = opts.durationMs ?? 60_000;
  const count = opts.count ?? 12;
  const random = opts.random ?? Math.random;
  let timers: NodeJS.Timeout[] = [];
  let running = false;
  let pending = 0;
  let generation = 0;
  const inFlight = new Set<Promise<void>>();
  const finish = () => {
    running = false;
    timers = [];
    pending = 0;
  };
  return {
    get running() {
      return running;
    },
    durationSeconds: Math.round(durationMs / 1000),
    ordersPlanned: count,
    start() {
      if (running) return false;
      running = true;
      pending = count;
      generation += 1;
      const gen = generation;
      for (let i = 0; i < count; i += 1) {
        const at = Math.max(0, (i * durationMs) / count + (random() - 0.5) * 2_000);
        const timer = setTimeout(() => {
          const order = placeRushOrder({ db: opts.db, events: opts.events, random })
            .catch((err: unknown) => opts.log.error({ err }, 'rush order failed'))
            .then(() => {})
            .finally(() => {
              inFlight.delete(order);
              // A straggler from a run that was already stopped must not touch the counters
              // of whatever run (if any) is current now.
              if (gen !== generation) return;
              pending -= 1;
              if (pending === 0) finish();
            });
          inFlight.add(order);
        }, at);
        timer.unref?.();
        timers.push(timer);
      }
      return true;
    },
    async stop() {
      for (const t of timers) clearTimeout(t);
      // Bump the generation before resetting state so any timer that fired a moment ago (its
      // callback already scheduled on the microtask queue) sees a mismatched `gen` and skips
      // touching `pending`/`finish` once it settles.
      generation += 1;
      finish();
      await Promise.allSettled([...inFlight]);
    },
  };
}
