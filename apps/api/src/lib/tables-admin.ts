import { and, asc, eq, notExists } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import type { TableDto, TableWrite } from '@tabletap/shared';
import { changedFields, recordAudit } from './audit';
import { AppError } from './errors';
import { isUniqueViolation } from './orders';

type TableRow = typeof schema.tables.$inferSelect;

function toDto(row: TableRow): TableDto {
  return {
    id: row.id,
    number: row.number,
    label: row.label,
    seats: row.seats,
    isActive: row.isActive,
  };
}

/**
 * A table outside `restaurantId` answers 404, not 403: the same rule `menu-admin.ts` follows,
 * because a different answer would tell a stranger which ids exist in another restaurant.
 */
async function loadTable(db: Db, restaurantId: string, id: string): Promise<TableRow> {
  const [row] = await db.select().from(schema.tables).where(eq(schema.tables.id, id));
  if (!row || row.restaurantId !== restaurantId)
    throw new AppError('NOT_FOUND', 404, 'Table not found.');
  return row;
}

/**
 * `tables_restaurant_number_unique` is what actually enforces one row per number, and it can
 * refuse a write that passed any check we made first - two admins numbering a new table 7 at the
 * same instant. Catching the violation is therefore the only way that race answers 409 instead of
 * escaping as a 500; a pre-flight SELECT would only narrow the window, never close it.
 */
function asNumberConflict(error: unknown): unknown {
  return isUniqueViolation(error)
    ? new AppError('CONFLICT', 409, 'Another table already uses that number.')
    : error;
}

/**
 * A table as the printable sheet needs it: the DTO plus the version its code has to be signed at.
 * `qr_version` is deliberately absent from `TableDto` - it is an internal counter, not something
 * the guest surface has any use for - so it travels alongside rather than inside it.
 */
export interface TableWithQrVersion extends TableDto {
  qrVersion: number;
}

/** Every table in this restaurant, in the order the floor is numbered. */
export async function listTables(db: Db, restaurantId: string): Promise<TableWithQrVersion[]> {
  const rows = await db
    .select()
    .from(schema.tables)
    .where(eq(schema.tables.restaurantId, restaurantId))
    .orderBy(asc(schema.tables.number));
  return rows.map((row) => ({ ...toDto(row), qrVersion: row.qrVersion }));
}

export async function createTable(
  db: Db,
  restaurantId: string,
  body: TableWrite,
  actorId: string,
): Promise<TableDto> {
  let row: TableRow;
  try {
    row = await db.transaction(async (tx) => {
      // Spread rather than defaulted here: `TableWriteSchema` leaves an omitted optional absent,
      // so `seats` and `is_active` fall to the column defaults instead of a second copy of them.
      const [inserted] = await tx
        .insert(schema.tables)
        .values({ restaurantId, ...body })
        .returning();
      if (!inserted) throw new Error('table insert returned nothing');
      await recordAudit(tx, {
        actorType: 'user',
        actorId,
        action: 'table.created',
        entityType: 'table',
        entityId: inserted.id,
        payload: { number: inserted.number, label: inserted.label, seats: inserted.seats },
      });
      return inserted;
    });
  } catch (error) {
    throw asNumberConflict(error);
  }
  return toDto(row);
}

/**
 * Writes only the fields present in `body`, guarded on the `updatedAt` the read saw - the same
 * optimistic lock `menu-admin.ts` puts on its updates, and for the same reason: without it a write
 * landing in the gap between the read and this one would still succeed, and the audit's `from`
 * would describe a transition that never happened. A guard that matches nothing is disambiguated
 * afterwards: 404 if the table is gone, 409 `CONFLICT` if someone else changed it first.
 */
export async function updateTable(
  db: Db,
  restaurantId: string,
  id: string,
  body: Partial<TableWrite>,
  actorId: string,
): Promise<TableDto> {
  const before = await loadTable(db, restaurantId, id);
  let updated: TableRow | null;
  try {
    updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.tables)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(schema.tables.id, id), eq(schema.tables.updatedAt, before.updatedAt)))
        .returning();
      if (!row) return null;
      await recordAudit(tx, {
        actorType: 'user',
        actorId,
        action: 'table.updated',
        entityType: 'table',
        entityId: id,
        payload: { changed: changedFields(before, body) },
      });
      return row;
    });
  } catch (error) {
    throw asNumberConflict(error);
  }
  if (!updated) {
    await loadTable(db, restaurantId, id); // still gone or foreign -> throws 404
    throw new AppError(
      'CONFLICT',
      409,
      'This table changed while you were editing it. Reload and try again.',
    );
  }
  return toDto(updated);
}

/**
 * `orders.table_id` is a restricted foreign key, so a table that ever took an order cannot be
 * deleted without taking that history with it. The check lives in the DELETE's own WHERE rather
 * than in a statement before it, so Postgres evaluates both against one snapshot and an order
 * placed in between still answers 409 `IN_USE` instead of escaping as a 500.
 */
export async function deleteTable(
  db: Db,
  restaurantId: string,
  id: string,
  actorId: string,
): Promise<void> {
  const table = await loadTable(db, restaurantId, id);
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(schema.tables)
      .where(
        and(
          eq(schema.tables.id, id),
          notExists(
            tx
              .select({ id: schema.orders.id })
              .from(schema.orders)
              .where(eq(schema.orders.tableId, id)),
          ),
        ),
      )
      .returning();
    if (!row) return false;
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'table.deleted',
      entityType: 'table',
      entityId: id,
      payload: { number: table.number, label: table.label },
    });
    return true;
  });
  if (deleted) return;
  // The guarded delete refused. Distinguish "it now has orders" (409) from the rarer "it was
  // already removed by a concurrent call" (404) rather than assuming the former.
  const [stillThere] = await db
    .select({ id: schema.tables.id })
    .from(schema.tables)
    .where(eq(schema.tables.id, id));
  if (!stillThere) throw new AppError('NOT_FOUND', 404, 'Table not found.');
  throw new AppError('IN_USE', 409, 'This table has orders. Deactivate it instead.');
}

/**
 * Reissuing is one increment and one audit row, and it is irreversible for anything already
 * printed: `qr_version` travels inside every signed table token, and `POST /api/guest/claim`
 * compares the two (routes/guest.ts), so every code carrying the old number stops working the
 * moment this commits. Sessions already claimed continue - they rest on the signed cookie, not on
 * the token - which is why the confirmation in front of this control has to say what it does.
 *
 * The bump is guarded on `updatedAt` like every other write here, so two admins reissuing at once
 * move the version by one and the loser is told to reload rather than skipping a version silently.
 */
export async function reissueQr(
  db: Db,
  restaurantId: string,
  id: string,
  actorId: string,
): Promise<TableDto> {
  const before = await loadTable(db, restaurantId, id);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.tables)
      .set({ qrVersion: before.qrVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.tables.id, id), eq(schema.tables.updatedAt, before.updatedAt)))
      .returning();
    if (!row) return null;
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'table.qr_reissued',
      entityType: 'table',
      entityId: id,
      payload: {
        number: row.number,
        changed: { qrVersion: { from: before.qrVersion, to: row.qrVersion } },
      },
    });
    return row;
  });
  if (!updated) {
    await loadTable(db, restaurantId, id); // still gone or foreign -> throws 404
    throw new AppError(
      'CONFLICT',
      409,
      'This table changed while you were editing it. Reload and try again.',
    );
  }
  return toDto(updated);
}
