import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { MenuResponseSchema } from '@tabletap/shared';
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
