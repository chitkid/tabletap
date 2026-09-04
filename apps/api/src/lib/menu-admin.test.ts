import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { IDEMPOTENCY_KEY_HEADER, OrderResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ObjectStorage } from '../storage/types';
import { claimTable, createTestApp } from '../test/helpers';
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  updateCategory,
  updateItem,
} from './menu-admin';

const ACTOR = 'u-admin';

/** Every method the port has; a test only cares that `remove` was called with the right key. */
function fakeStorage(): ObjectStorage & { remove: ReturnType<typeof vi.fn> } {
  return {
    photoKey: vi.fn(),
    presignPut: vi.fn(),
    head: vi.fn(),
    checkUpload: vi.fn(),
    exists: vi.fn(),
    publicUrl: vi.fn(),
    remove: vi.fn(async () => {}),
  };
}

describe('menu-admin', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let restaurantId: string;

  async function categoryByName(name: string) {
    const [row] = await ctx.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.name, name));
    if (!row) throw new Error(`category ${name} not seeded`);
    return row;
  }
  async function itemByName(name: string) {
    const [row] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.name, name));
    if (!row) throw new Error(`item ${name} not seeded`);
    return row;
  }

  /** Places a real order for one item, through the HTTP surface, so `order_items` really holds it. */
  async function orderFor(itemId: string): Promise<void> {
    const { cookie } = await claimTable(ctx.app, ctx.db, 5);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      payload: { items: [{ menuItemId: itemId, quantity: 1 }] },
    });
    expect(res.statusCode).toBeLessThan(300);
    OrderResponseSchema.parse(res.json());
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    const [restaurant] = await ctx.db
      .select({ id: schema.restaurants.id })
      .from(schema.restaurants);
    restaurantId = restaurant!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('creates a category with the next sort order when none is given', async () => {
    // Seeded categories are Flatbreads(0), Bowls(1), Sides(2), Drinks(3): the next one lands at 4.
    const category = await createCategory(ctx.db, restaurantId, { name: 'Desserts' }, ACTOR);
    expect(category.sortOrder).toBe(4);
    expect(category.name).toBe('Desserts');
    expect(category.items).toEqual([]);
  });

  it('creates an item with the next sort order within its own category when none is given', async () => {
    // Drinks holds 4 seeded items (0..3): the next one lands at 4.
    const drinks = await categoryByName('Drinks');
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: drinks.id, name: 'Ginger Beer', priceCents: 350 },
      ACTOR,
    );
    expect(item.sortOrder).toBe(4);
    expect(item.categoryId).toBe(drinks.id);
  });

  it('hides a category or item outside the restaurant behind 404, never 403', async () => {
    const bowls = await categoryByName('Bowls');
    const otherRestaurantId = randomUUID();
    await expect(
      updateCategory(ctx.db, otherRestaurantId, bowls.id, { name: 'Hijacked' }, ACTOR),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });

    const roastSquash = await itemByName('Roast Squash & Feta');
    await expect(
      updateItem(ctx.db, otherRestaurantId, roastSquash.id, { name: 'Hijacked' }, ACTOR),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('refuses to delete a category holding items (409 IN_USE) and deletes nothing', async () => {
    const sides = await categoryByName('Sides');
    await expect(deleteCategory(ctx.db, restaurantId, sides.id, ACTOR)).rejects.toMatchObject({
      code: 'IN_USE',
      statusCode: 409,
    });
    const [stillThere] = await ctx.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, sides.id));
    expect(stillThere).toBeDefined();
    const remainingItems = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.categoryId, sides.id));
    expect(remainingItems.length).toBeGreaterThan(0);
  });

  it('refuses to delete an item that appears on an order (409 IN_USE)', async () => {
    const focaccia = await itemByName('Wood-Fired Focaccia');
    await orderFor(focaccia.id);
    await expect(deleteItem(ctx.db, restaurantId, focaccia.id, ACTOR, null)).rejects.toMatchObject({
      code: 'IN_USE',
      statusCode: 409,
    });
    const [stillThere] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, focaccia.id));
    expect(stillThere).toBeDefined();
  });

  it('refuses a category delete from the guarded statement itself, so nothing it holds is destroyed', async () => {
    // A category and an item created together, then deleted immediately: the old two-statement
    // check-then-delete would already catch this in the non-race case too, so the real proof is
    // that the delete's own WHERE refused it - no audit row for a deletion that never happened.
    const category = await createCategory(ctx.db, restaurantId, { name: 'Race Category' }, ACTOR);
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: category.id, name: 'Race Item', priceCents: 100 },
      ACTOR,
    );
    await expect(deleteCategory(ctx.db, restaurantId, category.id, ACTOR)).rejects.toMatchObject({
      code: 'IN_USE',
      statusCode: 409,
    });
    const [categoryRow] = await ctx.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.id, category.id));
    expect(categoryRow).toBeDefined();
    const [itemRow] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, item.id));
    expect(itemRow).toBeDefined();
    const deletionAudits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.category.deleted'))
    ).filter((r) => r.entityId === category.id);
    expect(deletionAudits).toHaveLength(0);
  });

  it('refuses an item delete from the guarded statement itself, so the order referencing it is untouched', async () => {
    const bowls = await categoryByName('Bowls');
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: bowls.id, name: 'Race Bowl', priceCents: 900 },
      ACTOR,
    );
    await orderFor(item.id);
    await expect(deleteItem(ctx.db, restaurantId, item.id, ACTOR, null)).rejects.toMatchObject({
      code: 'IN_USE',
      statusCode: 409,
    });
    const [itemRow] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, item.id));
    expect(itemRow).toBeDefined();
    const orderItemRows = await ctx.db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.menuItemId, item.id));
    expect(orderItemRows.length).toBeGreaterThan(0);
    const deletionAudits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.item.deleted'))
    ).filter((r) => r.entityId === item.id);
    expect(deletionAudits).toHaveLength(0);
  });

  it('deletes an item with no orders and removes its photo object', async () => {
    const sparklingWater = await itemByName('Sparkling Water');
    const key = `menu/${sparklingWater.id}/deadbeef-dead-beef-dead-beefdeadbeef.jpg`;
    await ctx.db
      .update(schema.menuItems)
      .set({ imageUrl: `http://localhost:9000/tabletap/${key}` })
      .where(eq(schema.menuItems.id, sparklingWater.id));
    const storage = fakeStorage();
    await deleteItem(ctx.db, restaurantId, sparklingWater.id, ACTOR, storage);
    expect(storage.remove).toHaveBeenCalledWith(key);
    const [gone] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.id, sparklingWater.id));
    expect(gone).toBeUndefined();
  });

  it('deleting an item with no photo does not touch storage, and a null storage is fine too', async () => {
    const category = await createCategory(ctx.db, restaurantId, { name: 'Temp Category' }, ACTOR);
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: category.id, name: 'Temp Item', priceCents: 100 },
      ACTOR,
    );
    const storage = fakeStorage();
    await deleteItem(ctx.db, restaurantId, item.id, ACTOR, storage);
    expect(storage.remove).not.toHaveBeenCalled();
    // A deployment with no bucket configured hands `app.storage` in as null; must not throw.
    const category2 = await createCategory(
      ctx.db,
      restaurantId,
      { name: 'Temp Category 2' },
      ACTOR,
    );
    const item2 = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: category2.id, name: 'Temp Item 2', priceCents: 100 },
      ACTOR,
    );
    await expect(deleteItem(ctx.db, restaurantId, item2.id, ACTOR, null)).resolves.toBeUndefined();
  });

  it('an update writes only the fields it was given', async () => {
    const flatbreads = await categoryByName('Flatbreads');
    const updated = await updateCategory(
      ctx.db,
      restaurantId,
      flatbreads.id,
      { sortOrder: 9 },
      ACTOR,
    );
    expect(updated.sortOrder).toBe(9);
    expect(updated.name).toBe('Flatbreads'); // untouched
    // restore, so later tests (and re-runs within this file) see the seeded order again
    await updateCategory(ctx.db, restaurantId, flatbreads.id, { sortOrder: 0 }, ACTOR);

    const margherita = await itemByName('Margherita Flatbread');
    const originalPrice = margherita.priceCents;
    const updatedItem = await updateItem(
      ctx.db,
      restaurantId,
      margherita.id,
      { isAvailable: false },
      ACTOR,
    );
    expect(updatedItem.isAvailable).toBe(false);
    expect(updatedItem.priceCents).toBe(originalPrice); // untouched
    expect(updatedItem.name).toBe('Margherita Flatbread'); // untouched
    await updateItem(ctx.db, restaurantId, margherita.id, { isAvailable: true }, ACTOR);
  });

  it('a concurrent item edit loses the race: 409 CONFLICT, and no audit row records a stale transition', async () => {
    const bowls = await categoryByName('Bowls');
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: bowls.id, name: 'Race Update Item', priceCents: 500 },
      ACTOR,
    );
    const results = await Promise.allSettled([
      updateItem(ctx.db, restaurantId, item.id, { priceCents: 600 }, ACTOR),
      updateItem(ctx.db, restaurantId, item.id, { priceCents: 700 }, ACTOR),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    // Exactly one update audit row for this item, and its `from` is the price it genuinely held
    // before the winning write - never a value the loser's stale read merely thought was current.
    const winner = results.find(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof updateItem>>> =>
        r.status === 'fulfilled',
    )!;
    const updateAudits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.item.updated'))
    ).filter((r) => r.entityId === item.id);
    expect(updateAudits).toHaveLength(1);
    expect(updateAudits[0]!.payload).toMatchObject({
      changed: { priceCents: { from: 500, to: winner.value.priceCents } },
    });
  });

  it('a concurrent category edit loses the race: 409 CONFLICT, and no audit row records a stale transition', async () => {
    const category = await createCategory(
      ctx.db,
      restaurantId,
      { name: 'Race Update Category' },
      ACTOR,
    );
    const results = await Promise.allSettled([
      updateCategory(ctx.db, restaurantId, category.id, { sortOrder: 11 }, ACTOR),
      updateCategory(ctx.db, restaurantId, category.id, { sortOrder: 12 }, ACTOR),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'CONFLICT', statusCode: 409 });
    const winner = results.find(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof updateCategory>>> =>
        r.status === 'fulfilled',
    )!;
    const updateAudits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.category.updated'))
    ).filter((r) => r.entityId === category.id);
    expect(updateAudits).toHaveLength(1);
    expect(updateAudits[0]!.payload).toMatchObject({
      changed: { sortOrder: { from: category.sortOrder, to: winner.value.sortOrder } },
    });
  });

  it('a price change leaves an audit row both the old and new price can be read from', async () => {
    const bowls = await categoryByName('Bowls');
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: bowls.id, name: 'Price Test Item', priceCents: 800 },
      ACTOR,
    );
    await updateItem(ctx.db, restaurantId, item.id, { priceCents: 950 }, ACTOR);
    const updateAudits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.item.updated'))
    ).filter((r) => r.entityId === item.id);
    expect(updateAudits).toHaveLength(1);
    expect(updateAudits[0]!.payload).toMatchObject({
      changed: { priceCents: { from: 800, to: 950 } },
    });
  });

  it("records the item's price when it is created, not just its name and category", async () => {
    const bowls = await categoryByName('Bowls');
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: bowls.id, name: 'Priced On Create', priceCents: 725 },
      ACTOR,
    );
    const createAudits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.item.created'))
    ).filter((r) => r.entityId === item.id);
    expect(createAudits).toHaveLength(1);
    expect(createAudits[0]!.payload).toMatchObject({ priceCents: 725 });
  });

  it('a category rename leaves an audit row both the old and new name can be read from', async () => {
    const category = await createCategory(ctx.db, restaurantId, { name: 'Old Name' }, ACTOR);
    await updateCategory(ctx.db, restaurantId, category.id, { name: 'New Name' }, ACTOR);
    const updateAudits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.category.updated'))
    ).filter((r) => r.entityId === category.id);
    expect(updateAudits).toHaveLength(1);
    expect(updateAudits[0]!.payload).toMatchObject({
      changed: { name: { from: 'Old Name', to: 'New Name' } },
    });
  });

  it('audits every mutation with the actor who made it', async () => {
    const category = await createCategory(ctx.db, restaurantId, { name: 'Audit Category' }, ACTOR);
    await updateCategory(
      ctx.db,
      restaurantId,
      category.id,
      { name: 'Audit Category Renamed' },
      ACTOR,
    );
    const item = await createItem(
      ctx.db,
      restaurantId,
      { categoryId: category.id, name: 'Audit Item', priceCents: 500 },
      ACTOR,
    );
    await updateItem(ctx.db, restaurantId, item.id, { priceCents: 600 }, ACTOR);
    await deleteItem(ctx.db, restaurantId, item.id, ACTOR, null);
    await deleteCategory(ctx.db, restaurantId, category.id, ACTOR);

    const expectedActions: Array<[string, string]> = [
      ['menu.category.created', category.id],
      ['menu.category.updated', category.id],
      ['menu.item.created', item.id],
      ['menu.item.updated', item.id],
      ['menu.item.deleted', item.id],
      ['menu.category.deleted', category.id],
    ];
    for (const [action, entityId] of expectedActions) {
      const rows = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, action));
      const forThisEntity = rows.filter((r) => r.entityId === entityId);
      expect(forThisEntity, action).toHaveLength(1);
      expect(forThisEntity[0]).toMatchObject({ actorType: 'user', actorId: ACTOR });
    }
  });
});
