import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import type { GuestPrincipal, OrderCreateRequest, OrderDto, OrderStatus } from '@tabletap/shared';
import { recordAudit } from './audit';
import { AppError } from './errors';

type OrderRow = typeof schema.orders.$inferSelect;
type ItemRow = typeof schema.orderItems.$inferSelect;

/** The scoping column travels with the DTO inside the API; routes strip it before replying. */
export type InternalOrderDto = OrderDto & { guestSessionId: string | null };

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
    createdAt: order.createdAt.toISOString(),
    guestSessionId: order.guestSessionId,
  };
}

async function hydrate(db: Db, orders: OrderRow[]): Promise<InternalOrderDto[]> {
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
  return orders.map((o) =>
    toDto(
      o,
      items.filter((i) => i.orderId === o.id),
      numberOf.get(o.tableId) ?? 0,
    ),
  );
}

export async function loadOrder(db: Db, orderId: string): Promise<InternalOrderDto | null> {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return null;
  return (await hydrate(db, [order]))[0] ?? null;
}

export async function listOrders(
  db: Db,
  filter: { guestSessionId: string } | { restaurantId: string },
  limit = 100,
): Promise<InternalOrderDto[]> {
  const where =
    'guestSessionId' in filter
      ? eq(schema.orders.guestSessionId, filter.guestSessionId)
      : eq(schema.orders.restaurantId, filter.restaurantId);
  const rows = await db
    .select()
    .from(schema.orders)
    .where(where)
    .orderBy(desc(schema.orders.number))
    .limit(limit);
  return hydrate(db, rows);
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
): Promise<{ order: InternalOrderDto; created: boolean }> {
  const now = input.now ?? new Date();
  const { principal, body } = input;

  const [prior] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.idempotencyKey, input.idempotencyKey));
  if (prior) {
    if (prior.guestSessionId !== principal.guestSessionId)
      throw new AppError('CONFLICT', 409, 'This request was already used by another session.');
    const dto = (await hydrate(db, [prior]))[0]!;
    return { order: dto, created: false };
  }

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

  const lines = body.items.map((i) => {
    const row = byId.get(i.menuItemId)!;
    return {
      menuItemId: row.id,
      nameSnapshot: row.name,
      unitPriceCents: row.priceCents,
      quantity: i.quantity,
      lineTotalCents: row.priceCents * i.quantity,
    };
  });
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  const order = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.orders)
      .values({
        restaurantId: principal.restaurantId,
        tableId: principal.tableId,
        guestSessionId: principal.guestSessionId,
        status: 'placed',
        subtotalCents,
        totalCents: subtotalCents,
        note: body.note && body.note.length > 0 ? body.note : null,
        idempotencyKey: input.idempotencyKey,
        placedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!inserted) throw new Error('order insert returned nothing');
    await tx
      .insert(schema.orderItems)
      .values(lines.map((l) => ({ ...l, orderId: inserted.id, createdAt: now, updatedAt: now })));
    await recordAudit(tx, {
      actorType: 'guest',
      actorId: principal.guestSessionId,
      action: 'order.placed',
      entityType: 'order',
      entityId: inserted.id,
      payload: { number: inserted.number, totalCents: subtotalCents, itemCount: lines.length },
    });
    return inserted;
  });
  const dto = (await hydrate(db, [order]))[0]!;
  return { order: dto, created: true };
}
