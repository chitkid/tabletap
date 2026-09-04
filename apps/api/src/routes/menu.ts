import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  AllergenSchema,
  MenuCategoryDtoSchema,
  MenuCategoryWriteSchema,
  MenuItemDtoSchema,
  MenuItemWriteSchema,
  MenuResponseSchema,
  PhotoConfirmRequestSchema,
  PhotoUploadResponseSchema,
  type MenuResponse,
} from '@tabletap/shared';
import { schema, type Db } from '@tabletap/db';
import { AppError, validate } from '../lib/errors';
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  presignItemPhoto,
  setItemPhoto,
  updateCategory,
  updateItem,
} from '../lib/menu-admin';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAction } from '../plugins/rbac';
import { PHOTO_CONTENT_TYPES, type ObjectStorage } from '../storage/types';

const IdParamsSchema = z.object({ id: z.uuid() });
const CategoryUpdateSchema = MenuCategoryWriteSchema.partial();
const ItemUpdateSchema = MenuItemWriteSchema.partial();
const CategoryResponseSchema = z.object({ category: MenuCategoryDtoSchema });
const ItemResponseSchema = z.object({ item: MenuItemDtoSchema });
const OkResponseSchema = z.object({ ok: z.literal(true) });
/**
 * The type the browser promises to upload, and the only place it is stated: it is signed into the
 * URL and re-checked against the object that arrives. A filename never appears here - it is
 * attacker-controlled text, and the key is the port's to build.
 */
const PhotoUrlRequestSchema = z.object({ contentType: z.enum(PHOTO_CONTENT_TYPES) });

/** A deployment that names no bucket serves no photographs; say so rather than crash on a null. */
function requireStorage(storage: ObjectStorage | null): ObjectStorage {
  if (storage === null)
    throw new AppError('INTERNAL', 503, 'Photographs are not configured for this deployment.');
  return storage;
}

export async function loadMenu(db: Db, restaurantId: string): Promise<MenuResponse> {
  const [restaurant] = await db
    .select({
      id: schema.restaurants.id,
      name: schema.restaurants.name,
      currency: schema.restaurants.currency,
    })
    .from(schema.restaurants)
    .where(eq(schema.restaurants.id, restaurantId));
  if (!restaurant)
    return { restaurant: { id: restaurantId, name: '', currency: 'USD' }, categories: [] };
  const categories = await db
    .select({
      id: schema.menuCategories.id,
      name: schema.menuCategories.name,
      sortOrder: schema.menuCategories.sortOrder,
    })
    .from(schema.menuCategories)
    .where(
      and(
        eq(schema.menuCategories.restaurantId, restaurantId),
        eq(schema.menuCategories.isActive, true),
      ),
    )
    .orderBy(asc(schema.menuCategories.sortOrder), asc(schema.menuCategories.name));
  const ids = categories.map((c) => c.id);
  const items =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(schema.menuItems)
          .where(inArray(schema.menuItems.categoryId, ids))
          .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.name));
  return {
    restaurant,
    categories: categories.map((c) => ({
      ...c,
      items: items
        .filter((i) => i.categoryId === c.id)
        .map((i) => ({
          id: i.id,
          categoryId: i.categoryId,
          name: i.name,
          description: i.description,
          priceCents: i.priceCents,
          allergens: i.allergens.flatMap((a) =>
            AllergenSchema.safeParse(a).success ? [AllergenSchema.parse(a)] : [],
          ),
          isAvailable: i.isAvailable,
          imageUrl: i.imageUrl,
          sortOrder: i.sortOrder,
        })),
    })),
  };
}

export async function menuRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/menu',
    { preHandler: requireAction('menu.read'), schema: { response: { 200: MenuResponseSchema } } },
    async (request) => loadMenu(app.db, await restaurantIdFor(app.db, request.principal)),
  );

  r.post(
    '/menu/categories',
    {
      preHandler: requireAction('menu.write'),
      schema: { response: { 201: CategoryResponseSchema } },
    },
    async (request, reply) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const body = validate(MenuCategoryWriteSchema, request.body);
      const category = await createCategory(app.db, restaurantId, body, p.userId);
      return reply.status(201).send({ category });
    },
  );
  r.patch(
    '/menu/categories/:id',
    {
      preHandler: requireAction('menu.write'),
      schema: { response: { 200: CategoryResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      const body = validate(CategoryUpdateSchema, request.body);
      const category = await updateCategory(app.db, restaurantId, id, body, p.userId);
      return { category };
    },
  );
  r.delete(
    '/menu/categories/:id',
    { preHandler: requireAction('menu.write'), schema: { response: { 200: OkResponseSchema } } },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      await deleteCategory(app.db, restaurantId, id, p.userId);
      return { ok: true as const };
    },
  );

  r.post(
    '/menu/items',
    { preHandler: requireAction('menu.write'), schema: { response: { 201: ItemResponseSchema } } },
    async (request, reply) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const body = validate(MenuItemWriteSchema, request.body);
      const item = await createItem(app.db, restaurantId, body, p.userId);
      return reply.status(201).send({ item });
    },
  );
  r.patch(
    '/menu/items/:id',
    { preHandler: requireAction('menu.write'), schema: { response: { 200: ItemResponseSchema } } },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      const body = validate(ItemUpdateSchema, request.body);
      const item = await updateItem(app.db, restaurantId, id, body, p.userId);
      return { item };
    },
  );
  r.delete(
    '/menu/items/:id',
    { preHandler: requireAction('menu.write'), schema: { response: { 200: OkResponseSchema } } },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      await deleteItem(app.db, restaurantId, id, p.userId, app.storage);
      return { ok: true as const };
    },
  );

  /**
   * The browser uploads the photograph itself: the API answers a URL signed for one key, one
   * content type and one minute, and never carries the bytes. No storage credential leaves the
   * server - the signature in the URL is all the browser gets.
   */
  r.post(
    '/menu/items/:id/photo-url',
    {
      preHandler: requireAction('menu.write'),
      schema: { response: { 200: PhotoUploadResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const storage = requireStorage(app.storage);
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      const { contentType } = validate(PhotoUrlRequestSchema, request.body);
      return presignItemPhoto(app.db, restaurantId, id, contentType, storage);
    },
  );
  /**
   * The confirmation. Until it has run the dish keeps whatever picture it had, and the URL that
   * gets written is the server's own `publicUrl` for a key the server checked - never a URL, or a
   * key, the client chose for itself.
   */
  r.post(
    '/menu/items/:id/photo',
    { preHandler: requireAction('menu.write'), schema: { response: { 200: ItemResponseSchema } } },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const storage = requireStorage(app.storage);
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      const { key } = validate(PhotoConfirmRequestSchema, request.body);
      const item = await setItemPhoto(app.db, restaurantId, id, key, p.userId, storage);
      return { item };
    },
  );
}
