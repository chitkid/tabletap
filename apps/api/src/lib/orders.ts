import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import {
  ACTIVE_ORDER_STATUSES,
  type GuestPrincipal,
  type OrderCreateRequest,
  type OrderDto,
  type OrderStatus,
} from '@tabletap/shared';
import { recordAudit } from './audit';
import { AppError } from './errors';
import type { OrderEvents } from './order-events';

type OrderRow = typeof schema.orders.$inferSelect;
type ItemRow = typeof schema.orderItems.$inferSelect;

/**
 * The scoping columns travel with the DTO inside the API; routes strip them before replying.
 * `paidAt` is internal-only for the same reason: the public contract does not carry it yet, so
 * `strip` (routes/orders.ts) re-parsing through `OrderDtoSchema` drops it along with the rest.
 */
export type InternalOrderDto = OrderDto & {
  guestSessionId: string | null;
  restaurantId: string;
  paidAt: string | null;
};

function toDto(order: OrderRow, items: ItemRow[], tableNumber: number): InternalOrderDto {
  return {
    id: order.id,
    number: order.number,
    status: order.status as OrderStatus,
    tableId: order.tableId,
    tableNumber,
    items: items.map((i) => ({
      id: i.id,
      menuItemId: i.menuItemId,
      name: i.nameSnapshot,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
    })),
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    note: order.note,
    placedAt: order.placedAt ? order.placedAt.toISOString() : null,
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    cookingAt: order.cookingAt ? order.cookingAt.toISOString() : null,
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    servedAt: order.servedAt ? order.servedAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    guestSessionId: order.guestSessionId,
    restaurantId: order.restaurantId,
  };
}

export async function hydrate(db: Db, orders: OrderRow[]): Promise<InternalOrderDto[]> {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const items = await db
    .select()
    .from(schema.orderItems)
    .where(inArray(schema.orderItems.orderId, ids))
    // Items are written in one statement, so createdAt ties; uuidv7 ids break the tie
    // in insertion order, which is the order the guest chose them in.
    .orderBy(asc(schema.orderItems.createdAt), asc(schema.orderItems.id));
  const tables = await db
    .select({ id: schema.tables.id, number: schema.tables.number })
    .from(schema.tables)
    .where(
      inArray(
        schema.tables.id,
        orders.map((o) => o.tableId),
      ),
    );
  const numberOf = new Map(tables.map((t) => [t.id, t.number]));
  return orders.map((o) => {
    const tableNumber = numberOf.get(o.tableId);
    // orders.table_id is a restricted foreign key, so this cannot happen; a silent placeholder
    // number would put a wrong table on a kitchen ticket, which is worse than a 500.
    if (tableNumber === undefined) throw new Error('order references a missing table');
    return toDto(
      o,
      items.filter((i) => i.orderId === o.id),
      tableNumber,
    );
  });
}

const UNIQUE_VIOLATION = '23505';

/** Drizzle wraps driver errors, so the Postgres code sits on the error or on its cause. */
export function isUniqueViolation(error: unknown): boolean {
  const codeOf = (candidate: unknown): unknown =>
    typeof candidate === 'object' && candidate !== null && 'code' in candidate
      ? (candidate as { code: unknown }).code
      : undefined;
  if (codeOf(error) === UNIQUE_VIOLATION) return true;
  const cause =
    typeof error === 'object' && error !== null && 'cause' in error
      ? (error as { cause: unknown }).cause
      : undefined;
  return codeOf(cause) === UNIQUE_VIOLATION;
}

/**
 * The order this idempotency key already placed, or null when the key is still free.
 * A key that belongs to another guest session is never replayed: it is a collision, not a retry.
 */
async function findReplay(
  db: Db,
  idempotencyKey: string,
  principal: GuestPrincipal,
): Promise<InternalOrderDto | null> {
  const [prior] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.idempotencyKey, idempotencyKey));
  if (!prior) return null;
  if (prior.guestSessionId !== principal.guestSessionId)
    throw new AppError('CONFLICT', 409, 'This request was already used by another session.');
  return (await hydrate(db, [prior]))[0]!;
}

export async function loadOrder(db: Db, orderId: string): Promise<InternalOrderDto | null> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return null;
  return (await hydrate(db, [order]))[0] ?? null;
}

export async function listOrders(
  db: Db,
  filter: { guestSessionId: string } | { restaurantId: string; active?: boolean },
  limit = 100,
): Promise<InternalOrderDto[]> {
  if ('guestSessionId' in filter) {
    const rows = await db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.guestSessionId, filter.guestSessionId))
      .orderBy(desc(schema.orders.number))
      .limit(limit);
    return hydrate(db, rows);
  }
  if (filter.active) {
    // The kitchen board: everything still on its way to a table, oldest ticket first.
    const rows = await db
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.restaurantId, filter.restaurantId),
          inArray(schema.orders.status, [...ACTIVE_ORDER_STATUSES]),
        ),
      )
      .orderBy(asc(schema.orders.placedAt), asc(schema.orders.number))
      .limit(200);
    return hydrate(db, rows);
  }
  const rows = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.restaurantId, filter.restaurantId))
    .orderBy(desc(schema.orders.number))
    .limit(limit);
  return hydrate(db, rows);
}

export interface OrderLine {
  menuItemId: string;
  nameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

/**
 * The transaction body shared by a guest placing an order and the demo rush generator: insert
 * the order, its lines and the audit row. Everything above this (price lookups, availability
 * checks, replay handling) is caller-specific and happens before the transaction opens.
 */
export async function insertPlacedOrder(
  tx: Db,
  input: {
    restaurantId: string;
    tableId: string;
    guestSessionId: string | null;
    lines: OrderLine[];
    note: string | null;
    idempotencyKey: string;
    actor: { actorType: 'guest' | 'system'; actorId: string | null };
    auditPayload?: Record<string, unknown>;
    now: Date;
  },
): Promise<OrderRow> {
  const subtotalCents = input.lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const [inserted] = await tx
    .insert(schema.orders)
    .values({
      restaurantId: input.restaurantId,
      tableId: input.tableId,
      guestSessionId: input.guestSessionId,
      status: 'placed',
      subtotalCents,
      totalCents: subtotalCents,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
      placedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  if (!inserted) throw new Error('order insert returned nothing');
  await tx.insert(schema.orderItems).values(
    input.lines.map((l) => ({
      ...l,
      orderId: inserted.id,
      createdAt: input.now,
      updatedAt: input.now,
    })),
  );
  await recordAudit(tx, {
    actorType: input.actor.actorType,
    actorId: input.actor.actorId,
    action: 'order.placed',
    entityType: 'order',
    entityId: inserted.id,
    payload: {
      number: inserted.number,
      totalCents: subtotalCents,
      itemCount: input.lines.length,
      ...(input.auditPayload ?? {}),
    },
  });
  return inserted;
}

/**
 * Places an order. Everything a guest could tamper with is re-derived here: names and prices
 * come from the menu rows, the table and restaurant from the session principal. The request
 * body only ever contributes menu item ids, quantities and the note.
 */
export async function createOrder(
  db: Db,
  input: {
    principal: GuestPrincipal;
    body: OrderCreateRequest;
    idempotencyKey: string;
    now?: Date;
  },
  events?: OrderEvents,
): Promise<{ order: InternalOrderDto; created: boolean }> {
  const now = input.now ?? new Date();
  const { principal, body } = input;

  const prior = await findReplay(db, input.idempotencyKey, principal);
  if (prior) return { order: prior, created: false };

  const ids = body.items.map((i) => i.menuItemId);
  const rows = await db
    .select({
      id: schema.menuItems.id,
      name: schema.menuItems.name,
      priceCents: schema.menuItems.priceCents,
      isAvailable: schema.menuItems.isAvailable,
      categoryActive: schema.menuCategories.isActive,
    })
    .from(schema.menuItems)
    .innerJoin(
      schema.menuCategories,
      and(
        eq(schema.menuCategories.id, schema.menuItems.categoryId),
        eq(schema.menuCategories.restaurantId, principal.restaurantId),
      ),
    )
    .where(inArray(schema.menuItems.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0)
    throw new AppError('VALIDATION_FAILED', 400, 'Some items are not on the menu.', { unknown });
  const unavailable = rows
    .filter((r) => !r.isAvailable || !r.categoryActive)
    .map((r) => ({ menuItemId: r.id, name: r.name }));
  if (unavailable.length > 0)
    throw new AppError('ITEM_UNAVAILABLE', 409, 'Some items are sold out today.', { unavailable });

  const lines: OrderLine[] = body.items.map((i) => {
    const row = byId.get(i.menuItemId)!;
    return {
      menuItemId: row.id,
      nameSnapshot: row.name,
      unitPriceCents: row.priceCents,
      quantity: i.quantity,
      lineTotalCents: row.priceCents * i.quantity,
    };
  });

  let order: OrderRow;
  try {
    order = await db.transaction((tx) =>
      insertPlacedOrder(tx, {
        restaurantId: principal.restaurantId,
        tableId: principal.tableId,
        guestSessionId: principal.guestSessionId,
        lines,
        note: body.note && body.note.length > 0 ? body.note : null,
        idempotencyKey: input.idempotencyKey,
        actor: { actorType: 'guest', actorId: principal.guestSessionId },
        now,
      }),
    );
  } catch (error) {
    // A retry that arrives while the first request is still inserting passes the check above
    // and then loses the unique key. It is the same request, so answer it with the same order
    // rather than with a 500; a key held by another session is still a conflict.
    if (!isUniqueViolation(error)) throw error;
    const raced = await findReplay(db, input.idempotencyKey, principal);
    if (!raced) throw error;
    return { order: raced, created: false };
  }
  const dto = (await hydrate(db, [order]))[0]!;
  events?.emit('order:created', dto);
  return { order: dto, created: true };
}
