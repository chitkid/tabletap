import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AllergenSchema, MenuResponseSchema, type MenuResponse } from '@tabletap/shared';
import { schema, type Db } from '@tabletap/db';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAction } from '../plugins/rbac';

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
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/menu',
      { preHandler: requireAction('menu.read'), schema: { response: { 200: MenuResponseSchema } } },
      async (request) => loadMenu(app.db, await restaurantIdFor(app.db, request.principal)),
    );
}
