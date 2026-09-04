import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { MenuCategoryDtoSchema, MenuItemDtoSchema, MenuResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, signInAs } from '../test/helpers';

describe('GET /api/menu', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('is 401 for anonymous', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/menu' })).statusCode).toBe(401);
  });
  it('returns the seeded menu for a guest, ordered, with unavailable items flagged', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 3);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const menu = MenuResponseSchema.parse(res.json());
    expect(menu.restaurant.name).toBe('Little Furnace');
    expect(menu.categories.map((c) => c.name)).toEqual(['Flatbreads', 'Bowls', 'Sides', 'Drinks']);
    expect(menu.categories.flatMap((c) => c.items)).toHaveLength(20);
    const burrata = menu.categories[2]!.items.find((i) => i.name === 'Burrata & Peaches');
    expect(burrata?.isAvailable).toBe(false);
    expect(menu.categories[0]!.items.map((i) => i.name)[0]).toBe('Margherita Flatbread');
    expect(menu.categories[0]!.items[0]!.allergens).toEqual(['gluten', 'dairy']);
  });
  it('returns the menu for staff', async () => {
    const cookie = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(MenuResponseSchema.parse(res.json()).categories).toHaveLength(4);
  });
  it('hides inactive categories', async () => {
    await ctx.db
      .update(schema.menuCategories)
      .set({ isActive: false })
      .where(eq(schema.menuCategories.name, 'Drinks'));
    const { cookie } = await claimTable(ctx.app, ctx.db, 4);
    const menu = MenuResponseSchema.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json(),
    );
    expect(menu.categories.map((c) => c.name)).toEqual(['Flatbreads', 'Bowls', 'Sides']);
    await ctx.db
      .update(schema.menuCategories)
      .set({ isActive: true })
      .where(eq(schema.menuCategories.name, 'Drinks'));
  });
});

describe('admin menu routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let waiter: string;
  let kitchen: string;
  let categoryId: string;
  let itemId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const [category] = await ctx.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.name, 'Bowls'));
    categoryId = category!.id;
    const [item] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.name, 'Ember Salmon Bowl'));
    itemId = item!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('every new route answers 401 anonymous and 403 for waiter and kitchen', async () => {
    const cases: Array<{
      method: 'POST' | 'PATCH' | 'DELETE';
      url: string;
      payload?: Record<string, unknown>;
    }> = [
      { method: 'POST', url: '/api/menu/categories', payload: { name: 'Guard Category' } },
      {
        method: 'PATCH',
        url: `/api/menu/categories/${categoryId}`,
        payload: { name: 'Guard Rename' },
      },
      { method: 'DELETE', url: `/api/menu/categories/${categoryId}` },
      {
        method: 'POST',
        url: '/api/menu/items',
        payload: { categoryId, name: 'Guard Item', priceCents: 100 },
      },
      { method: 'PATCH', url: `/api/menu/items/${itemId}`, payload: { name: 'Guard Rename' } },
      { method: 'DELETE', url: `/api/menu/items/${itemId}` },
    ];
    for (const c of cases) {
      const anon = await ctx.app.inject({ method: c.method, url: c.url, payload: c.payload });
      expect(anon.statusCode, `${c.method} ${c.url} anonymous`).toBe(401);
      for (const [role, cookie] of [
        ['waiter', waiter],
        ['kitchen', kitchen],
      ] as const) {
        const res = await ctx.app.inject({
          method: c.method,
          url: c.url,
          headers: { cookie },
          payload: c.payload,
        });
        expect(res.statusCode, `${c.method} ${c.url} ${role}`).toBe(403);
      }
    }
  });

  it('answers a malformed body 400 VALIDATION_FAILED after the guard, and 401 before it', async () => {
    const badCategory = { name: '' }; // MenuCategoryWriteSchema: name min length 1
    const anonCategory = await ctx.app.inject({
      method: 'POST',
      url: '/api/menu/categories',
      payload: badCategory,
    });
    expect(anonCategory.statusCode).toBe(401);
    const badCategoryRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/menu/categories',
      headers: { cookie: admin },
      payload: badCategory,
    });
    expect(badCategoryRes.statusCode).toBe(400);
    expect(badCategoryRes.json().error.code).toBe('VALIDATION_FAILED');

    const badItem = { categoryId, priceCents: -5 }; // missing name, negative price
    const anonItem = await ctx.app.inject({
      method: 'POST',
      url: '/api/menu/items',
      payload: badItem,
    });
    expect(anonItem.statusCode).toBe(401);
    const badItemRes = await ctx.app.inject({
      method: 'POST',
      url: '/api/menu/items',
      headers: { cookie: admin },
      payload: badItem,
    });
    expect(badItemRes.statusCode).toBe(400);
    expect(badItemRes.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('lets admin create, edit and remove a category end to end', async () => {
    const create = await ctx.app.inject({
      method: 'POST',
      url: '/api/menu/categories',
      headers: { cookie: admin },
      payload: { name: 'Seasonal' },
    });
    expect(create.statusCode).toBe(201);
    const created = MenuCategoryDtoSchema.parse(create.json().category);
    expect(created.name).toBe('Seasonal');
    expect(created.items).toEqual([]);

    const update = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/menu/categories/${created.id}`,
      headers: { cookie: admin },
      payload: { sortOrder: 42 },
    });
    expect(update.statusCode).toBe(200);
    const updated = MenuCategoryDtoSchema.parse(update.json().category);
    expect(updated.sortOrder).toBe(42);
    expect(updated.name).toBe('Seasonal'); // untouched by the partial update

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/menu/categories/${created.id}`,
      headers: { cookie: admin },
    });
    expect(del.statusCode).toBe(200);

    const gone = await ctx.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, created.id));
    expect(gone).toHaveLength(0);
  });

  it('lets admin create, edit and remove an item end to end', async () => {
    const create = await ctx.app.inject({
      method: 'POST',
      url: '/api/menu/items',
      headers: { cookie: admin },
      payload: { categoryId, name: 'Test Dish', priceCents: 1200 },
    });
    expect(create.statusCode).toBe(201);
    const created = MenuItemDtoSchema.parse(create.json().item);
    expect(created.name).toBe('Test Dish');
    expect(created.categoryId).toBe(categoryId);

    const update = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/menu/items/${created.id}`,
      headers: { cookie: admin },
      payload: { isAvailable: false },
    });
    expect(update.statusCode).toBe(200);
    const updated = MenuItemDtoSchema.parse(update.json().item);
    expect(updated.isAvailable).toBe(false);
    expect(updated.priceCents).toBe(1200); // untouched by the partial update

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/menu/items/${created.id}`,
      headers: { cookie: admin },
    });
    expect(del.statusCode).toBe(200);

    const gone = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, created.id));
    expect(gone).toHaveLength(0);
  });
});
