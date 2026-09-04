import { asc, count, eq, max } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import {
  AllergenSchema,
  type MenuCategoryDto,
  type MenuCategoryWrite,
  type MenuItemDto,
  type MenuItemWrite,
} from '@tabletap/shared';
import type { ObjectStorage } from '../storage/types';
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

/** Writes only the fields present in `body`: `MenuCategoryWriteSchema.partial()` parses a missing
 * optional field as an absent key, not `undefined`, so a plain spread already does the right thing. */
export async function updateCategory(
  db: Db,
  restaurantId: string,
  id: string,
  body: Partial<MenuCategoryWrite>,
  actorId: string,
): Promise<MenuCategoryDto> {
  await loadCategory(db, restaurantId, id);
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.menuCategories)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.menuCategories.id, id))
      .returning();
    if (!updated) throw new AppError('NOT_FOUND', 404, 'Category not found.');
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.category.updated',
      entityType: 'menu_category',
      entityId: id,
      payload: body,
    });
    return updated;
  });
  const items = await itemsOf(db, id);
  return toCategoryDto(row, items);
}

export async function deleteCategory(
  db: Db,
  restaurantId: string,
  id: string,
  actorId: string,
): Promise<void> {
  const category = await loadCategory(db, restaurantId, id);
  const [holding] = await db
    .select({ n: count() })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.categoryId, id));
  if ((holding?.n ?? 0) > 0)
    throw new AppError('IN_USE', 409, 'This category holds items. Empty it first.', {
      itemCount: holding?.n ?? 0,
    });
  await db.transaction(async (tx) => {
    await tx.delete(schema.menuCategories).where(eq(schema.menuCategories.id, id));
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.category.deleted',
      entityType: 'menu_category',
      entityId: id,
      payload: { name: category.name },
    });
  });
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
      payload: { name: inserted.name, categoryId: inserted.categoryId },
    });
    return inserted;
  });
  return toItemDto(row);
}

export async function updateItem(
  db: Db,
  restaurantId: string,
  id: string,
  body: Partial<MenuItemWrite>,
  actorId: string,
): Promise<MenuItemDto> {
  await loadItem(db, restaurantId, id);
  // A re-categorize target still has to belong to this restaurant.
  if (body.categoryId !== undefined) await loadCategory(db, restaurantId, body.categoryId);
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.menuItems)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.menuItems.id, id))
      .returning();
    if (!updated) throw new AppError('NOT_FOUND', 404, 'Item not found.');
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.item.updated',
      entityType: 'menu_item',
      entityId: id,
      payload: body,
    });
    return updated;
  });
  return toItemDto(row);
}

/**
 * `order_items.menu_item_id` is a restricted foreign key, so a plain DELETE would already refuse
 * an item that was ever ordered - this check exists to answer that with 409 `IN_USE` and a message
 * naming the alternative, instead of letting the constraint surface as an unhandled 500.
 */
export async function deleteItem(
  db: Db,
  restaurantId: string,
  id: string,
  actorId: string,
  storage: ObjectStorage | null,
): Promise<void> {
  const item = await loadItem(db, restaurantId, id);
  const [ordered] = await db
    .select({ n: count() })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.menuItemId, id));
  if ((ordered?.n ?? 0) > 0)
    throw new AppError('IN_USE', 409, 'This item appears on an order. Mark it sold out instead.', {
      orderCount: ordered?.n ?? 0,
    });
  await db.transaction(async (tx) => {
    await tx.delete(schema.menuItems).where(eq(schema.menuItems.id, id));
    await recordAudit(tx, {
      actorType: 'user',
      actorId,
      action: 'menu.item.deleted',
      entityType: 'menu_item',
      entityId: id,
      payload: { name: item.name },
    });
  });
  if (item.imageUrl && storage) {
    const key = storageKeyFromImageUrl(item.imageUrl);
    if (key) await storage.remove(key);
  }
}
