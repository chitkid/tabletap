import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import {
  ErrorEnvelopeSchema,
  MenuCategoryDtoSchema,
  MenuItemDtoSchema,
  MenuResponseSchema,
  PhotoUploadResponseSchema,
} from '@tabletap/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ObjectStorage, UploadCheck, UploadRejection } from '../storage/types';
import { TEST_CONFIG, claimTable, createTestApp, signInAs } from '../test/helpers';

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

describe('menu photographs', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let waiter: string;
  let kitchen: string;
  let itemId: string;
  let configuredStorage: ObjectStorage | null;

  const PUBLIC_BASE = 'http://cdn.test/tabletap-test';
  const OK_UPLOAD: UploadCheck = { ok: true, object: { size: 2048, contentType: 'image/jpeg' } };

  /**
   * Confirming an upload needs a bucket to ask about it; these tests are about the route's own
   * decisions, so the port is faked and each test picks the verdict. `presignPut` still answers the
   * shape `PhotoUploadResponseSchema` demands, so a route that returned the wrong thing would fail
   * on serialization rather than quietly pass.
   */
  function fakeStorage(check: UploadCheck = OK_UPLOAD, gate?: () => Promise<void>) {
    return {
      photoKey: vi.fn((id: string) => `menu/${id}/${randomUUID()}.jpg`),
      presignPut: vi.fn(async (key: string) => ({
        url: `http://browser.test:9000/tabletap-test/${key}?X-Amz-Signature=fake`,
        key,
        expiresInSeconds: 60,
      })),
      head: vi.fn(async () => null),
      checkUpload: vi.fn(async () => {
        if (gate) await gate();
        return check;
      }),
      publicUrl: vi.fn((key: string) => `${PUBLIC_BASE}/${key}`),
      remove: vi.fn(async () => {}),
    } satisfies ObjectStorage;
  }

  /**
   * Holds every caller until `count` of them have arrived. Confirming a photograph reads the row,
   * asks storage about the object, then writes: this parks both requests in that gap, so both have
   * read the same row before either write lands - the race a guarded UPDATE exists to lose.
   */
  function barrier(count: number): () => Promise<void> {
    let arrived = 0;
    let open = () => {};
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    return async () => {
      arrived += 1;
      if (arrived >= count) open();
      await gate;
    };
  }

  /** A dish of this test's own, so the audit rows it collects are nobody else's. */
  async function createDish(name: string): Promise<string> {
    const [category] = await ctx.db
      .select()
      .from(schema.menuCategories)
      .where(eq(schema.menuCategories.name, 'Bowls'));
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/menu/items',
      headers: { cookie: admin },
      payload: { categoryId: category!.id, name, priceCents: 1100 },
    });
    expect(res.statusCode).toBe(201);
    return MenuItemDtoSchema.parse(res.json().item).id;
  }

  async function imageUrlOf(id: string): Promise<string | null> {
    const [row] = await ctx.db.select().from(schema.menuItems).where(eq(schema.menuItems.id, id));
    return row?.imageUrl ?? null;
  }

  async function photoAuditsFor(id: string) {
    const rows = await ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, 'menu.item.photo'));
    return rows.filter((r) => r.entityId === id);
  }

  async function setImageUrl(id: string, imageUrl: string | null): Promise<void> {
    await ctx.db.update(schema.menuItems).set({ imageUrl }).where(eq(schema.menuItems.id, id));
  }

  /** A dish belonging to somebody else's restaurant; the cascade takes it away again afterwards. */
  async function withForeignItem(fn: (foreignItemId: string) => Promise<void>): Promise<void> {
    const [restaurant] = await ctx.db
      .insert(schema.restaurants)
      .values({ name: 'Other House', slug: `other-house-${randomUUID()}` })
      .returning();
    try {
      const [category] = await ctx.db
        .insert(schema.menuCategories)
        .values({ restaurantId: restaurant!.id, name: 'Their Bowls' })
        .returning();
      const [item] = await ctx.db
        .insert(schema.menuItems)
        .values({ categoryId: category!.id, name: 'Their Dish', priceCents: 900 })
        .returning();
      await fn(item!.id);
    } finally {
      await ctx.db.delete(schema.restaurants).where(eq(schema.restaurants.id, restaurant!.id));
    }
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const [item] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.name, 'Ember Salmon Bowl'));
    itemId = item!.id;
    configuredStorage = ctx.app.storage;
  });
  afterEach(() => {
    ctx.app.storage = configuredStorage;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('signs an upload for a server-chosen key under this dish, good for a minute', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/photo-url`,
      headers: { cookie: admin },
      payload: { contentType: 'image/jpeg' },
    });
    expect(res.statusCode).toBe(200);
    const upload = PhotoUploadResponseSchema.parse(res.json());
    expect(upload.key).toMatch(
      new RegExp(
        `^menu/${itemId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`,
      ),
    );
    expect(upload.expiresInSeconds).toBe(60);
    // Signed against the endpoint the browser can reach, and carrying a signature, not a secret.
    expect(upload.url.startsWith(`http://browser.test:9000/tabletap-test/${upload.key}?`)).toBe(
      true,
    );
    expect(upload.url).toContain('X-Amz-Signature=');
    expect(upload.url).toContain('X-Amz-Expires=60');
    expect(upload.url).not.toContain(TEST_CONFIG.S3_SECRET_ACCESS_KEY);
    // Nothing is written until the confirmation step says the object arrived.
    expect(await imageUrlOf(itemId)).toBeNull();
  });

  it('refuses a content type the menu will not serve, and one that is not a type at all', async () => {
    for (const contentType of ['image/gif', 'text/html', 'image/jpeg; charset=utf-8', 42]) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${itemId}/photo-url`,
        headers: { cookie: admin },
        payload: { contentType },
      });
      expect(res.statusCode, String(contentType)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_FAILED');
    }
    const empty = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/photo-url`,
      headers: { cookie: admin },
      payload: {},
    });
    expect(empty.statusCode).toBe(400);
  });

  it('refuses both photo routes for anonymous, waiter and kitchen, before reading a body', async () => {
    const cases = [
      { url: `/api/menu/items/${itemId}/photo-url`, payload: { contentType: 'image/jpeg' } },
      { url: `/api/menu/items/${itemId}/photo`, payload: { key: `menu/${itemId}/x.jpg` } },
    ];
    for (const c of cases) {
      const anon = await ctx.app.inject({ method: 'POST', url: c.url, payload: c.payload });
      expect(anon.statusCode, `${c.url} anonymous`).toBe(401);
      for (const [role, cookie] of [
        ['waiter', waiter],
        ['kitchen', kitchen],
      ] as const) {
        const res = await ctx.app.inject({
          method: 'POST',
          url: c.url,
          headers: { cookie },
          payload: c.payload,
        });
        expect(res.statusCode, `${c.url} ${role}`).toBe(403);
        // The guard answers before the payload is looked at: a nonsense body is still a 403.
        const nonsense = await ctx.app.inject({
          method: 'POST',
          url: c.url,
          headers: { cookie },
          payload: { contentType: 42, key: '' },
        });
        expect(nonsense.statusCode, `${c.url} ${role} malformed`).toBe(403);
      }
    }
  });

  it('answers 404 for a dish in another restaurant without signing or probing anything', async () => {
    const storage = fakeStorage();
    ctx.app.storage = storage;
    await withForeignItem(async (foreignItemId) => {
      const sign = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${foreignItemId}/photo-url`,
        headers: { cookie: admin },
        payload: { contentType: 'image/jpeg' },
      });
      expect(sign.statusCode).toBe(404);
      expect(sign.json().error.code).toBe('NOT_FOUND');
      const confirm = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${foreignItemId}/photo`,
        headers: { cookie: admin },
        payload: { key: `menu/${foreignItemId}/${randomUUID()}.jpg` },
      });
      expect(confirm.statusCode).toBe(404);
      expect(confirm.json().error.code).toBe('NOT_FOUND');
      expect(storage.presignPut).not.toHaveBeenCalled();
      expect(storage.checkUpload).not.toHaveBeenCalled();
      expect(await imageUrlOf(foreignItemId)).toBeNull();
      // Not a blanket 404: this restaurant's own dish still signs while the other one exists.
      const ours = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${itemId}/photo-url`,
        headers: { cookie: admin },
        payload: { contentType: 'image/jpeg' },
      });
      expect(ours.statusCode).toBe(200);
      expect(storage.presignPut).toHaveBeenCalledTimes(1);
    });
  });

  it('refuses any key but the exact shape this dish own photo key has', async () => {
    const storage = fakeStorage();
    ctx.app.storage = storage;
    const someoneElse = randomUUID();
    const keys = [
      `menu/${someoneElse}/${randomUUID()}.jpg`,
      `menu/${itemId}-decoy/${randomUUID()}.jpg`,
      `menu/${randomUUID()}.jpg`,
      `../menu/${itemId}/${randomUUID()}.jpg`,
      'private/backups/dump.sql',
      // Starts with this dish's own prefix and still leaves its folder: a backend that collapses
      // dot segments resolves this to somebody else's object, and every browser normalises the
      // `..` out of the URL before fetching, so a guest would load bytes we never checked.
      `menu/${itemId}/../${someoneElse}/${randomUUID()}.jpg`,
      `menu/${itemId}/${randomUUID()}/../../${someoneElse}/${randomUUID()}.jpg`,
      // Under the prefix, but nothing `photoKey` could have built.
      `menu/${itemId}/${randomUUID()}.exe`,
      `menu/${itemId}/x.jpg`,
      `menu/${itemId}/${randomUUID()}.jpg/index.html`,
    ];
    for (const key of keys) {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${itemId}/photo`,
        headers: { cookie: admin },
        payload: { key },
      });
      expect(res.statusCode, key).toBe(400);
      expect(res.json().error.code, key).toBe('VALIDATION_FAILED');
    }
    expect(storage.checkUpload).not.toHaveBeenCalled();
    expect(storage.publicUrl).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await imageUrlOf(itemId)).toBeNull();
  });

  it('gives each way an upload can be refused its own 409, and leaves the dish alone', async () => {
    const previousKey = `menu/${itemId}/${randomUUID()}.jpg`;
    await setImageUrl(itemId, `${PUBLIC_BASE}/${previousKey}`);
    const cases: Array<[UploadRejection, string]> = [
      ['missing', 'The upload did not arrive. Try again.'],
      ['too-large', 'That photograph is larger than 5 MB. Try again with a smaller one.'],
      ['unsupported-type', 'That file is not a JPEG, PNG or WebP. Try again with one of those.'],
    ];
    for (const [reason, message] of cases) {
      const storage = fakeStorage({ ok: false, reason });
      ctx.app.storage = storage;
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${itemId}/photo`,
        headers: { cookie: admin },
        payload: { key: `menu/${itemId}/${randomUUID()}.jpg` },
      });
      expect(res.statusCode, reason).toBe(409);
      const body = ErrorEnvelopeSchema.parse(res.json());
      expect(body.error.code, reason).toBe('CONFLICT');
      expect(body.error.message, reason).toBe(message);
      // `checkUpload` already deleted whatever it refused, so this key is spent: the route must
      // not remove anything of its own, and must not touch the photograph the dish still has.
      expect(storage.remove, reason).not.toHaveBeenCalled();
      expect(await imageUrlOf(itemId)).toBe(`${PUBLIC_BASE}/${previousKey}`);
    }
    await setImageUrl(itemId, null);
  });

  it('writes the public URL on a confirmed upload, audits it, and the guest menu serves it', async () => {
    const storage = fakeStorage();
    ctx.app.storage = storage;
    const key = `menu/${itemId}/${randomUUID()}.jpg`;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/photo`,
      headers: { cookie: admin },
      payload: { key },
    });
    expect(res.statusCode).toBe(200);
    const item = MenuItemDtoSchema.parse(res.json().item);
    expect(item.id).toBe(itemId);
    expect(item.imageUrl).toBe(`${PUBLIC_BASE}/${key}`);
    expect(storage.checkUpload).toHaveBeenCalledWith(key);
    expect(storage.remove).not.toHaveBeenCalled(); // there was no previous object
    expect(await imageUrlOf(itemId)).toBe(`${PUBLIC_BASE}/${key}`);

    const audits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'menu.item.photo'))
    ).filter((r) => r.entityId === itemId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: 'user', entityType: 'menu_item' });
    expect(typeof audits[0]!.actorId).toBe('string');
    expect(audits[0]!.payload).toMatchObject({
      key,
      previousKey: null, // there was no photograph before this one
      changed: { imageUrl: { from: null, to: `${PUBLIC_BASE}/${key}` } },
    });

    const { cookie } = await claimTable(ctx.app, ctx.db, 6);
    const menu = MenuResponseSchema.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json(),
    );
    const onTheMenu = menu.categories.flatMap((c) => c.items).find((i) => i.id === itemId);
    expect(onTheMenu?.imageUrl).toBe(`${PUBLIC_BASE}/${key}`);
    await setImageUrl(itemId, null);
  });

  it('removes the object a replaced photograph pointed at, only once the new one is confirmed', async () => {
    const previousKey = `menu/${itemId}/${randomUUID()}.jpg`;
    await setImageUrl(itemId, `${PUBLIC_BASE}/${previousKey}`);

    // A refused replacement keeps the old photograph, object and all.
    const refusing = fakeStorage({ ok: false, reason: 'missing' });
    ctx.app.storage = refusing;
    const refused = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/photo`,
      headers: { cookie: admin },
      payload: { key: `menu/${itemId}/${randomUUID()}.jpg` },
    });
    expect(refused.statusCode).toBe(409);
    expect(refusing.remove).not.toHaveBeenCalled();
    expect(await imageUrlOf(itemId)).toBe(`${PUBLIC_BASE}/${previousKey}`);

    const storage = fakeStorage();
    ctx.app.storage = storage;
    const key = `menu/${itemId}/${randomUUID()}.jpg`;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/photo`,
      headers: { cookie: admin },
      payload: { key },
    });
    expect(res.statusCode).toBe(200);
    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledWith(previousKey);
    // The old object goes only after the new one has been confirmed, never before.
    expect(storage.checkUpload.mock.invocationCallOrder[0]!).toBeLessThan(
      storage.remove.mock.invocationCallOrder[0]!,
    );
    expect(await imageUrlOf(itemId)).toBe(`${PUBLIC_BASE}/${key}`);
    await setImageUrl(itemId, null);
  });

  it('never hands a key it cannot recognise to remove, however the old URL got there', async () => {
    // A row written before the key was pinned to its item - or by any other hand - can carry a URL
    // whose key escapes the folder. `remove` asks no questions, so the check has to happen here.
    const dishId = await createDish('Traversal Bowl');
    const traversal = `menu/${dishId}/../${randomUUID()}/${randomUUID()}.jpg`;
    await setImageUrl(dishId, `${PUBLIC_BASE}/${traversal}`);
    const storage = fakeStorage();
    ctx.app.storage = storage;
    const key = `menu/${dishId}/${randomUUID()}.jpg`;
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${dishId}/photo`,
      headers: { cookie: admin },
      payload: { key },
    });
    expect(res.statusCode).toBe(200);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(await imageUrlOf(dishId)).toBe(`${PUBLIC_BASE}/${key}`);
    // The audit says no object was reclaimed, so the one left behind is findable later.
    const audits = await photoAuditsFor(dishId);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({
      key,
      previousKey: null,
      changed: { imageUrl: { from: `${PUBLIC_BASE}/${traversal}` } },
    });
  });

  it('a confirmation that lost a race answers 409, and audits no transition that never happened', async () => {
    const dishId = await createDish('Race Bowl');
    const storage = fakeStorage(OK_UPLOAD, barrier(2));
    ctx.app.storage = storage;
    const keys = [`menu/${dishId}/${randomUUID()}.jpg`, `menu/${dishId}/${randomUUID()}.jpg`];
    const responses = await Promise.all(
      keys.map((key) =>
        ctx.app.inject({
          method: 'POST',
          url: `/api/menu/items/${dishId}/photo`,
          headers: { cookie: admin },
          payload: { key },
        }),
      ),
    );
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const loser = responses.find((r) => r.statusCode === 409)!;
    expect(ErrorEnvelopeSchema.parse(loser.json()).error).toMatchObject({
      code: 'CONFLICT',
      message: 'This item changed while you were editing it. Reload and try again.',
    });
    const winner = responses.find((r) => r.statusCode === 200)!;
    const written = MenuItemDtoSchema.parse(winner.json().item).imageUrl;
    expect(await imageUrlOf(dishId)).toBe(written);
    // One audit row, and its `from` is the value the dish genuinely held - never one a stale read
    // merely believed was current.
    const audits = await photoAuditsFor(dishId);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.payload).toMatchObject({
      changed: { imageUrl: { from: null, to: written } },
    });
  });

  it('says photographs are not configured when the deployment names no bucket', async () => {
    ctx.app.storage = null;
    const message = 'Photographs are not configured for this deployment.';
    const sign = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/photo-url`,
      headers: { cookie: admin },
      payload: { contentType: 'image/jpeg' },
    });
    expect(sign.statusCode).toBe(503);
    expect(ErrorEnvelopeSchema.parse(sign.json()).error.message).toBe(message);
    const confirm = await ctx.app.inject({
      method: 'POST',
      url: `/api/menu/items/${itemId}/photo`,
      headers: { cookie: admin },
      payload: { key: `menu/${itemId}/${randomUUID()}.jpg` },
    });
    expect(confirm.statusCode).toBe(503);
    expect(ErrorEnvelopeSchema.parse(confirm.json()).error.message).toBe(message);
    expect(await imageUrlOf(itemId)).toBeNull();
  });
});

describe('demo upload gate', () => {
  /**
   * Every method throws. This is a stronger check than a status code: a refusal that ran the
   * storage call and then discarded the result would still pass a mere `toBe(403)`, but not this.
   */
  function throwingStorage(): ObjectStorage {
    const boom = () => {
      throw new Error('storage must not be called while uploads are disabled');
    };
    return {
      photoKey: boom,
      presignPut: boom,
      head: boom,
      checkUpload: boom,
      publicUrl: boom,
      remove: boom,
    };
  }

  it('refuses both photo routes for an otherwise-allowed admin, before any storage call, when DEMO_UPLOADS_ENABLED is off', async () => {
    const ctx = await createTestApp({
      config: { ...TEST_CONFIG, DEMO_UPLOADS_ENABLED: 'false', demoUploadsEnabled: false },
    });
    try {
      ctx.app.storage = throwingStorage();
      const admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
      const [item] = await ctx.db
        .select()
        .from(schema.menuItems)
        .where(eq(schema.menuItems.name, 'Ember Salmon Bowl'));
      const itemId = item!.id;
      const message = 'Photo upload is disabled in this deployment.';

      const sign = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${itemId}/photo-url`,
        headers: { cookie: admin },
        payload: { contentType: 'image/jpeg' },
      });
      expect(sign.statusCode).toBe(403);
      expect(ErrorEnvelopeSchema.parse(sign.json()).error).toMatchObject({
        code: 'FORBIDDEN',
        message,
      });

      const confirm = await ctx.app.inject({
        method: 'POST',
        url: `/api/menu/items/${itemId}/photo`,
        headers: { cookie: admin },
        payload: { key: `menu/${itemId}/${randomUUID()}.jpg` },
      });
      expect(confirm.statusCode).toBe(403);
      expect(ErrorEnvelopeSchema.parse(confirm.json()).error).toMatchObject({
        code: 'FORBIDDEN',
        message,
      });
      const [row] = await ctx.db
        .select()
        .from(schema.menuItems)
        .where(eq(schema.menuItems.id, itemId));
      expect(row?.imageUrl ?? null).toBeNull();
    } finally {
      await ctx.close();
    }
  });
});
