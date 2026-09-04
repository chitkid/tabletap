import { and, asc, eq, max, notExists } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import {
  AllergenSchema,
  type MenuCategoryDto,
  type MenuCategoryWrite,
  type MenuItemDto,
  type MenuItemWrite,
} from '@tabletap/shared';
import type {
  ObjectStorage,
  PhotoContentType,
  PresignedUpload,
  UploadRejection,
} from '../storage/types';
import { recordAudit } from './audit';
import { AppError } from './errors';

type CategoryRow = typeof schema.menuCategories.$inferSelect;
type ItemRow = typeof schema.menuItems.$inferSelect;

function toItemDto(row: ItemRow): MenuItemDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    allergens: row.allergens.flatMap((a) =>
      AllergenSchema.safeParse(a).success ? [AllergenSchema.parse(a)] : [],
    ),
    isAvailable: row.isAvailable,
    imageUrl: row.imageUrl,
    sortOrder: row.sortOrder,
  };
}

function toCategoryDto(row: CategoryRow, items: MenuItemDto[]): MenuCategoryDto {
  return { id: row.id, name: row.name, sortOrder: row.sortOrder, items };
}

async function itemsOf(db: Db, categoryId: string): Promise<MenuItemDto[]> {
  const rows = await db
    .select()
    .from(schema.menuItems)
    .where(eq(schema.menuItems.categoryId, categoryId))
    .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.name));
  return rows.map(toItemDto);
}

/**
 * A category outside `restaurantId` answers 404, not 403: the rest of the API follows the same
 * rule, because a different answer would tell a stranger which ids exist in another restaurant.
 */
async function loadCategory(db: Db, restaurantId: string, id: string): Promise<CategoryRow> {
  const [row] = await db
    .select()
    .from(schema.menuCategories)
    .where(eq(schema.menuCategories.id, id));
  if (!row || row.restaurantId !== restaurantId)
    throw new AppError('NOT_FOUND', 404, 'Category not found.');
  return row;
}

/** `menu_items` carries no `restaurant_id` of its own; the scope check goes through its category. */
async function loadItem(db: Db, restaurantId: string, id: string): Promise<ItemRow> {
  const [row] = await db.select().from(schema.menuItems).where(eq(schema.menuItems.id, id));
  if (!row) throw new AppError('NOT_FOUND', 404, 'Item not found.');
  const [category] = await db
    .select({ restaurantId: schema.menuCategories.restaurantId })
    .from(schema.menuCategories)
    .where(eq(schema.menuCategories.id, row.categoryId));
  if (!category || category.restaurantId !== restaurantId)
    throw new AppError('NOT_FOUND', 404, 'Item not found.');
  return row;
}

async function nextCategorySortOrder(db: Db, restaurantId: string): Promise<number> {
  const [row] = await db
    .select({ max: max(schema.menuCategories.sortOrder) })
    .from(schema.menuCategories)
    .where(eq(schema.menuCategories.restaurantId, restaurantId));
  return (row?.max ?? -1) + 1;
}

async function nextItemSortOrder(db: Db, categoryId: string): Promise<number> {
  const [row] = await db
    .select({ max: max(schema.menuItems.sortOrder) })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.categoryId, categoryId));
  return (row?.max ?? -1) + 1;
}

/**
 * `publicUrl` (storage/s3.ts) is `${base}/${key}` and `key` always starts with `menu/`
 * (photoKey's own shape). There is nowhere else the stored key lives, so recovering it from the
 * URL we already wrote to `image_url` is the only way back to it for a delete.
 */
function storageKeyFromImageUrl(imageUrl: string): string | null {
  const match = /(menu\/.+)$/.exec(imageUrl);
  return match ? match[1]! : null;
}

/**
 * `{ field: { from, to } }` for every key the caller actually sent - the way `lib/transitions.ts`
 * records `{ from, to }` on every status change, so the audit row alone can settle a dispute
 * without a second query against a row that has since changed again (or been deleted).
 */
function changedFields(
  before: Record<string, unknown>,
  body: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(body)) changed[key] = { from: before[key], to: body[key] };
  return changed;
}

export async function createCategory(
  db: Db,
  restaurantId: string,
  body: MenuCategoryWrite,
  actorId: string,
): Promise<MenuCategoryDto> {
  const sortOrder = body.sortOrder ?? (await nextCategorySortOrder(db, restaurantId));
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.menuCategories)
      .values({ restaurantId, name: body.name, sortOrder, isActive: body.isActive ?? true })
      .returning();
    if (!inserted) throw new Error('category insert returned nothing');
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.category.created',
      entityType: 'menu_category',
      entityId: inserted.id,
      payload: { name: inserted.name, sortOrder: inserted.sortOrder },
    });
    return inserted;
  });
  return toCategoryDto(row, []);
}

/**
 * Writes only the fields present in `body`: `MenuCategoryWriteSchema.partial()` parses a missing
 * optional field as an absent key, not `undefined`, so a plain spread already does the right thing.
 *
 * `before` is read once, then the write's own `WHERE` is guarded on `updatedAt` matching what
 * `before` just saw - the same shape `lib/transitions.ts` uses (`WHERE status = <the status we
 * read>`). Without that guard a second write landing in the gap between reading `before` and
 * writing would still succeed, and the audit's `from` would describe a transition that never
 * happened. (The read stays a plain, untransacted `loadCategory` rather than moving inside the
 * `db.transaction()` below: PGlite serializes every statement - plain or transactional - through
 * one exclusive lock (`_runExclusiveTransaction` in `@electric-sql/pglite`), so a read taken
 * *inside* the guarded transaction can never observe a value another call raced past; there would
 * be no way to write a test that ever sees the guard refuse. Reading it here, exactly where
 * `transitions.ts` reads `current`, keeps the same real-Postgres guarantee - the guard is what
 * `WHERE ... AND updatedAt = $2` checks at UPDATE time, not when the value was captured - while
 * staying provable in this test environment.) A guard that matches nothing is disambiguated
 * afterward: 404 if the category is gone entirely, 409 `CONFLICT` if it is still there but someone
 * else changed it first - chosen over a silent retry so an admin's save never lands quietly on top
 * of an edit they never saw (`docs/superpowers/specs/2026-09-04-m5-admin-design.md` has the failed
 * save "restore the previous values and say which field the server refused").
 */
export async function updateCategory(
  db: Db,
  restaurantId: string,
  id: string,
  body: Partial<MenuCategoryWrite>,
  actorId: string,
): Promise<MenuCategoryDto> {
  const before = await loadCategory(db, restaurantId, id);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.menuCategories)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(
          eq(schema.menuCategories.id, id),
          eq(schema.menuCategories.updatedAt, before.updatedAt),
        ),
      )
      .returning();
    if (!row) return null;
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.category.updated',
      entityType: 'menu_category',
      entityId: id,
      payload: { changed: changedFields(before, body) },
    });
    return row;
  });
  if (!updated) {
    await loadCategory(db, restaurantId, id); // still gone or foreign -> throws 404
    throw new AppError(
      'CONFLICT',
      409,
      'This category changed while you were editing it. Reload and try again.',
    );
  }
  const items = await itemsOf(db, id);
  return toCategoryDto(updated, items);
}

/**
 * The item-count check and the delete used to be two statements: an item inserted between them
 * (menu_items.category_id is `onDelete: 'cascade'`) would be silently destroyed along with the
 * category it raced - no 409, no audit row. Now the check is part of the DELETE's own WHERE, so
 * Postgres evaluates both against the same snapshot and there is no window between them.
 */
export async function deleteCategory(
  db: Db,
  restaurantId: string,
  id: string,
  actorId: string,
): Promise<void> {
  const category = await loadCategory(db, restaurantId, id);
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(schema.menuCategories)
      .where(
        and(
          eq(schema.menuCategories.id, id),
          notExists(
            tx
              .select({ id: schema.menuItems.id })
              .from(schema.menuItems)
              .where(eq(schema.menuItems.categoryId, id)),
          ),
        ),
      )
      .returning();
    if (!row) return false;
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.category.deleted',
      entityType: 'menu_category',
      entityId: id,
      payload: { name: category.name },
    });
    return true;
  });
  if (deleted) return;
  // The guarded delete refused. Distinguish "it now holds items" (409) from the rarer "it was
  // already removed by a concurrent call" (404) rather than assuming the former.
  const [stillThere] = await db
    .select({ id: schema.menuCategories.id })
    .from(schema.menuCategories)
    .where(eq(schema.menuCategories.id, id));
  if (!stillThere) throw new AppError('NOT_FOUND', 404, 'Category not found.');
  throw new AppError('IN_USE', 409, 'This category holds items. Empty it first.');
}

export async function createItem(
  db: Db,
  restaurantId: string,
  body: MenuItemWrite,
  actorId: string,
): Promise<MenuItemDto> {
  // The category id is caller-supplied; confirm it is one of this restaurant's before an item
  // can land under it, the same 404-not-403 rule as everywhere else in this file.
  await loadCategory(db, restaurantId, body.categoryId);
  const sortOrder = body.sortOrder ?? (await nextItemSortOrder(db, body.categoryId));
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.menuItems)
      .values({
        categoryId: body.categoryId,
        name: body.name,
        description: body.description ?? '',
        priceCents: body.priceCents,
        allergens: body.allergens ?? [],
        isAvailable: body.isAvailable ?? true,
        sortOrder,
      })
      .returning();
    if (!inserted) throw new Error('item insert returned nothing');
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.item.created',
      entityType: 'menu_item',
      entityId: inserted.id,
      payload: {
        name: inserted.name,
        categoryId: inserted.categoryId,
        priceCents: inserted.priceCents,
      },
    });
    return inserted;
  });
  return toItemDto(row);
}

/**
 * Same guard as `updateCategory`, and the same reason its `before` read stays a plain,
 * untransacted call rather than moving inside `db.transaction()` below - see that doc comment.
 */
export async function updateItem(
  db: Db,
  restaurantId: string,
  id: string,
  body: Partial<MenuItemWrite>,
  actorId: string,
): Promise<MenuItemDto> {
  const before = await loadItem(db, restaurantId, id);
  // A re-categorize target still has to belong to this restaurant. Independent of the guard below:
  // it is a different row, not the one being written.
  if (body.categoryId !== undefined) await loadCategory(db, restaurantId, body.categoryId);
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.menuItems)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.menuItems.id, id), eq(schema.menuItems.updatedAt, before.updatedAt)))
      .returning();
    if (!row) return null;
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.item.updated',
      entityType: 'menu_item',
      entityId: id,
      payload: { changed: changedFields(before, body) },
    });
    return row;
  });
  if (!updated) {
    await loadItem(db, restaurantId, id); // still gone or foreign -> throws 404
    throw new AppError(
      'CONFLICT',
      409,
      'This item changed while you were editing it. Reload and try again.',
    );
  }
  return toItemDto(updated);
}

/**
 * A signed `PUT` for one dish's photograph. The ownership lookup comes first on purpose: the URL
 * this answers is a write into the bucket, and it is never minted for a dish this restaurant does
 * not own. The key is the port's to build - `photoKey` is the only thing that decides where the
 * object lands, and the browser's filename never reaches it.
 */
export async function presignItemPhoto(
  db: Db,
  restaurantId: string,
  id: string,
  contentType: PhotoContentType,
  storage: ObjectStorage,
): Promise<PresignedUpload> {
  await loadItem(db, restaurantId, id);
  return storage.presignPut(storage.photoKey(id, contentType), contentType);
}

/**
 * `checkUpload` deletes whatever it refuses, so a refusal is final for that key: each sentence
 * names what went wrong and asks for another attempt, which the browser starts from a fresh
 * `photo-url`. Re-confirming the same key would only find the object gone.
 */
const UPLOAD_REFUSALS: Record<UploadRejection, string> = {
  missing: 'The upload did not arrive. Try again.',
  'too-large': 'That photograph is larger than 5 MB. Try again with a smaller one.',
  'unsupported-type': 'That file is not a JPEG, PNG or WebP. Try again with one of those.',
};

/**
 * Confirms an upload and writes it onto the dish. Two checks stand between a caller and an
 * arbitrary object, in this order: the item has to belong to this restaurant (404 otherwise, the
 * same rule as everywhere else here), and the key has to sit under that item's own prefix. Since
 * the prefix is built from the id that just passed the ownership check, no key belonging to
 * another restaurant's dish - or to anything else in the bucket - can reach storage at all.
 */
export async function setItemPhoto(
  db: Db,
  restaurantId: string,
  id: string,
  key: string,
  actorId: string,
  storage: ObjectStorage,
): Promise<MenuItemDto> {
  const before = await loadItem(db, restaurantId, id);
  if (!key.startsWith(`menu/${id}/`))
    throw new AppError('VALIDATION_FAILED', 400, 'That upload does not belong to this dish.');
  const check = await storage.checkUpload(key);
  if (!check.ok) throw new AppError('CONFLICT', 409, UPLOAD_REFUSALS[check.reason]);
  const imageUrl = storage.publicUrl(key);
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.menuItems)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(schema.menuItems.id, id))
      .returning();
    if (!updated) throw new AppError('NOT_FOUND', 404, 'Item not found.');
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.item.photo',
      entityType: 'menu_item',
      entityId: id,
      payload: { key, changed: changedFields(before, { imageUrl }) },
    });
    return updated;
  });
  // Only now, with the new photograph committed, is the old object safe to drop: a delete before
  // this point would leave the dish pointing at nothing if the confirmation went on to fail.
  const previousKey = before.imageUrl === null ? null : storageKeyFromImageUrl(before.imageUrl);
  if (previousKey !== null && previousKey !== key) await storage.remove(previousKey);
  return toItemDto(row);
}

/**
 * `order_items.menu_item_id` is a restricted foreign key, so an order placed between a separate
 * check and delete used to turn into an unhandled 500 - not lost data, since `restrict` refuses
 * the statement, but not a clean 409 either. The check now lives in the DELETE's own WHERE, so it
 * and the delete run against the same snapshot and always answer 409 `IN_USE` on that race.
 */
export async function deleteItem(
  db: Db,
  restaurantId: string,
  id: string,
  actorId: string,
  storage: ObjectStorage | null,
): Promise<void> {
  const item = await loadItem(db, restaurantId, id);
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(schema.menuItems)
      .where(
        and(
          eq(schema.menuItems.id, id),
          notExists(
            tx
              .select({ id: schema.orderItems.id })
              .from(schema.orderItems)
              .where(eq(schema.orderItems.menuItemId, id)),
          ),
        ),
      )
      .returning();
    if (!row) return false;
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.item.deleted',
      entityType: 'menu_item',
      entityId: id,
      payload: { name: item.name },
    });
    return true;
  });
  if (!deleted) {
    const [stillThere] = await db
      .select({ id: schema.menuItems.id })
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, id));
    if (!stillThere) throw new AppError('NOT_FOUND', 404, 'Item not found.');
    throw new AppError('IN_USE', 409, 'This item appears on an order. Mark it sold out instead.');
  }
  if (item.imageUrl && storage) {
    const key = storageKeyFromImageUrl(item.imageUrl);
    if (key) await storage.remove(key);
  }
}
