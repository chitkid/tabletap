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
  type MenuResponse,
} from '@tabletap/shared';
import { schema, type Db } from '@tabletap/db';
import { AppError, validate } from '../lib/errors';
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  updateCategory,
  updateItem,
} from '../lib/menu-admin';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAction } from '../plugins/rbac';

const IdParamsSchema = z.object({ id: z.uuid() });
const CategoryUpdateSchema = MenuCategoryWriteSchema.partial();
const ItemUpdateSchema = MenuItemWriteSchema.partial();
const CategoryResponseSchema = z.object({ category: MenuCategoryDtoSchema });
const ItemResponseSchema = z.object({ item: MenuItemDtoSchema });
const OkResponseSchema = z.object({ ok: z.literal(true) });

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
}
