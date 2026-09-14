import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema } from '@tabletap/db';
import {
  ErrorEnvelopeSchema,
  IDEMPOTENCY_KEY_HEADER,
  OrderResponseSchema,
  TableDtoSchema,
  TableResponseSchema,
  TablesResponseSchema,
} from '@tabletap/shared';
import { claimTable, createTestApp, signInAs } from '../test/helpers';
import { sheetDisposition } from './tables';

describe('tables routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('GET /api/tables lists 12 tables for staff, ordered by number', async () => {
    const cookie = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/tables', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { tables } = TablesResponseSchema.parse(res.json());
    expect(tables.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it('GET /api/tables is 401 for anonymous and 403 for guests', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/tables' })).statusCode).toBe(401);
    const { cookie } = await claimTable(ctx.app, ctx.db, 3);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/tables', headers: { cookie } })).statusCode,
    ).toBe(403);
  });
  it('GET /api/tables/:id lets a guest read only their own table', async () => {
    const own = await claimTable(ctx.app, ctx.db, 3);
    const other = await claimTable(ctx.app, ctx.db, 4);
    const ok = await ctx.app.inject({
      method: 'GET',
      url: `/api/tables/${own.tableId}`,
      headers: { cookie: own.cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(TableResponseSchema.parse(ok.json()).table.number).toBe(3);
    const denied = await ctx.app.inject({
      method: 'GET',
      url: `/api/tables/${other.tableId}`,
      headers: { cookie: own.cookie },
    });
    expect(denied.statusCode).toBe(403);
  });
  it('GET /api/tables/:id returns any table for staff and 404 for unknown', async () => {
    const cookie = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const { tableId } = await claimTable(ctx.app, ctx.db, 9);
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/tables/${tableId}`, headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    const missing = await ctx.app.inject({
      method: 'GET',
      url: '/api/tables/018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);
    const bad = await ctx.app.inject({
      method: 'GET',
      url: '/api/tables/not-a-uuid',
      headers: { cookie },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('admin table routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let waiter: string;
  let kitchen: string;
  let tableId: string;

  async function qrVersionOf(id: string): Promise<number> {
    const [row] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.id, id));
    if (!row) throw new Error(`table ${id} is gone`);
    return row.qrVersion;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const [table] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, 2));
    tableId = table!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('every write route answers 401 anonymous and 403 for waiter and kitchen', async () => {
    const cases: Array<{
      method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      url: string;
      payload?: Record<string, unknown>;
    }> = [
      { method: 'POST', url: '/api/tables', payload: { number: 90, label: 'Guard Table' } },
      { method: 'PATCH', url: `/api/tables/${tableId}`, payload: { label: 'Guard Rename' } },
      { method: 'DELETE', url: `/api/tables/${tableId}` },
      { method: 'POST', url: `/api/tables/${tableId}/qr` },
      { method: 'GET', url: '/api/tables/qr.pdf' },
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
        // The guard answers before the payload is looked at: nonsense is still a 403.
        if (c.method !== 'GET') {
          const nonsense = await ctx.app.inject({
            method: c.method,
            url: c.url,
            headers: { cookie },
            payload: { number: 'seven', label: '' },
          });
          expect(nonsense.statusCode, `${c.method} ${c.url} ${role} malformed`).toBe(403);
        }
      }
    }
    // Nothing a refused caller sent left a mark.
    const [stillThere] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.id, tableId));
    expect(stillThere!.label).toBe('Стол 2');
    expect(stillThere!.qrVersion).toBe(1);
  });

  it('answers a malformed body 400 VALIDATION_FAILED after the guard, and 401 before it', async () => {
    const bad = { number: 0, label: '' }; // TableWriteSchema: number >= 1, label min length 1
    const anon = await ctx.app.inject({ method: 'POST', url: '/api/tables', payload: bad });
    expect(anon.statusCode).toBe(401);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/tables',
      headers: { cookie: admin },
      payload: bad,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
    const badId = await ctx.app.inject({
      method: 'POST',
      url: '/api/tables/not-a-uuid/qr',
      headers: { cookie: admin },
    });
    expect(badId.statusCode).toBe(400);
    expect(badId.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('lets admin create, edit and remove a table end to end', async () => {
    const create = await ctx.app.inject({
      method: 'POST',
      url: '/api/tables',
      headers: { cookie: admin },
      payload: { number: 41, label: 'Counter 1', seats: 3 },
    });
    expect(create.statusCode).toBe(201);
    const created = TableDtoSchema.parse(create.json().table);
    expect(created).toMatchObject({ number: 41, label: 'Counter 1', seats: 3, isActive: true });

    const update = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tables/${created.id}`,
      headers: { cookie: admin },
      payload: { isActive: false },
    });
    expect(update.statusCode).toBe(200);
    const updated = TableDtoSchema.parse(update.json().table);
    expect(updated.isActive).toBe(false);
    expect(updated.label).toBe('Counter 1'); // untouched by the partial update

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/tables/${created.id}`,
      headers: { cookie: admin },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ ok: true });
    const gone = await ctx.db.select().from(schema.tables).where(eq(schema.tables.id, created.id));
    expect(gone).toHaveLength(0);
  });

  it('answers a duplicate table number 409 CONFLICT and an unknown table 404', async () => {
    const duplicate = await ctx.app.inject({
      method: 'POST',
      url: '/api/tables',
      headers: { cookie: admin },
      payload: { number: 2, label: 'Impostor' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(ErrorEnvelopeSchema.parse(duplicate.json()).error.code).toBe('CONFLICT');

    const missing = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60';
    for (const [method, url] of [
      ['PATCH', `/api/tables/${missing}`],
      ['DELETE', `/api/tables/${missing}`],
      ['POST', `/api/tables/${missing}/qr`],
    ] as const) {
      const res = await ctx.app.inject({
        method,
        url,
        headers: { cookie: admin },
        payload: { label: 'Nowhere' },
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(ErrorEnvelopeSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
    }
  });

  it('refuses to delete a table that has orders with 409 IN_USE', async () => {
    const { cookie, tableId: busyTableId } = await claimTable(ctx.app, ctx.db, 11);
    const [item] = await ctx.db
      .select()
      .from(schema.menuItems)
      .where(eq(schema.menuItems.name, 'Хачапури по-аджарски'));
    const order = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      payload: { items: [{ menuItemId: item!.id, quantity: 1 }] },
    });
    expect(order.statusCode).toBeLessThan(300);
    OrderResponseSchema.parse(order.json());

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/api/tables/${busyTableId}`,
      headers: { cookie: admin },
    });
    expect(del.statusCode).toBe(409);
    expect(ErrorEnvelopeSchema.parse(del.json()).error).toMatchObject({
      code: 'IN_USE',
      message: 'This table has orders. Deactivate it instead.',
    });
    const [stillThere] = await ctx.db
      .select()
      .from(schema.tables)
      .where(eq(schema.tables.id, busyTableId));
    expect(stillThere).toBeDefined();
  });

  it('reissues a QR: the table comes back and its version has moved on', async () => {
    const before = await qrVersionOf(tableId);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/tables/${tableId}/qr`,
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    expect(TableDtoSchema.parse(res.json().table).id).toBe(tableId);
    expect(await qrVersionOf(tableId)).toBe(before + 1);
    const audits = (
      await ctx.db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'table.qr_reissued'))
    ).filter((r) => r.entityId === tableId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: 'user', entityType: 'table' });
  });

  it('streams the printable sheet as a PDF named for the restaurant and the day', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/tables/qr.pdf',
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    // Two names in one header: the ASCII fallback the syntax has always allowed, and RFC 5987's
    // form, which is the one a browser actually saves the file under. Percent-encoded, so the
    // header stays pure ASCII however the restaurant is named.
    const disposition = String(res.headers['content-disposition']);
    expect(disposition).toMatch(
      /^attachment; filename="little-furnace-qr-codes-\d{4}-\d{2}-\d{2}\.pdf"; filename\*=UTF-8''\S+$/,
    );
    expect(disposition).toMatch(/^[\u0020-\u007e]+$/);
    const encoded = /filename\*=UTF-8''(\S+)$/.exec(disposition)?.[1] ?? '';
    expect(decodeURIComponent(encoded)).toBe(
      `little-furnace-QR-коды-${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    const body = res.rawPayload;
    expect(body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // Twelve seeded tables, six to a page: one card each over two pages.
    const pdf = body.toString('latin1');
    expect(pdf.match(/\/Subtype\s*\/Link/g)?.length).toBe(12);
    expect(pdf.match(/\/Type\s*\/Page\b/g)?.length).toBe(2);
  });

  it('leaves a deactivated table off the sheet, and the codes it prints are live ones', async () => {
    const [table] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, 12));
    const deactivate = await ctx.app.inject({
      method: 'PATCH',
      url: `/api/tables/${table!.id}`,
      headers: { cookie: admin },
      payload: { isActive: false },
    });
    expect(deactivate.statusCode).toBe(200);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/tables/qr.pdf',
      headers: { cookie: admin },
    });
    expect(res.statusCode).toBe(200);
    const pdf = res.rawPayload.toString('latin1');
    expect(pdf.match(/\/Subtype\s*\/Link/g)?.length).toBe(11);

    // A code lifted straight off the sheet claims its table: the sheet carries current versions.
    const token = /\/t\/([A-Za-z0-9._-]+)\)/.exec(pdf)?.[1];
    expect(token).toBeDefined();
    const claim = await ctx.app.inject({
      method: 'POST',
      url: '/api/guest/claim',
      payload: { token },
    });
    expect(claim.statusCode).toBe(200);
  });

  describe('the name the sheet is downloaded under', () => {
    // The route builds this header from the restaurant slug, and the seeded slug is already
    // ASCII-clean, so the end-to-end test above would stay green if the raw slug were dropped
    // into the header. This is the guard on its own, against input no route can write today:
    // `asciiStem` is an allow-list rather than an escape, and it feeds **both** parameters, so
    // the ASCII fallback - the likelier hole in this pattern - is closed at the same point as
    // the percent-encoded one.
    const hostile = [
      ['carriage returns', 'evil\r\nX-Injected: yes'],
      ['a closing quote', 'ev"; filename="pwned.exe'],
      ['a parameter separator', 'a;b'],
      ['already-encoded CRLF', 'a%0d%0aX-Injected:%20yes'],
      ['the characters encodeURIComponent keeps', "a'()!*b"],
      ['nothing that survives', '«»'],
      ['a wholly Cyrillic slug', 'Тёплая веранда'],
    ] as const;

    for (const [what, slug] of hostile)
      it(`answers one filename and one filename* in printable ASCII for ${what}`, () => {
        const header = sheetDisposition(slug, '2026-09-14');
        // Nothing outside printable ASCII, so nothing that can end a header line or start one.
        expect(header, slug).toMatch(/^[\u0020-\u007e]+$/);
        expect(header.match(/filename=/g), slug).toHaveLength(1);
        expect(header.match(/filename\*=/g), slug).toHaveLength(1);
        expect(header, slug).toMatch(
          /^attachment; filename="[a-z0-9-]+-qr-codes-2026-09-14\.pdf"; filename\*=UTF-8''[A-Za-z0-9%.~_-]+$/,
        );
        // And the two still name one file: same stem, same day, one translated word apart.
        const stem = /filename="([a-z0-9-]+)-qr-codes-/.exec(header)?.[1] ?? '';
        const encoded = /filename\*=UTF-8''(\S+)$/.exec(header)?.[1] ?? '';
        expect(decodeURIComponent(encoded), slug).toBe(`${stem}-QR-коды-2026-09-14.pdf`);
      });
  });
});
