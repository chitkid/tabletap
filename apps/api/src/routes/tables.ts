import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TableResponseSchema, TableWriteSchema, TablesResponseSchema } from '@tabletap/shared';
import { signTableToken } from '@tabletap/shared/server';
import { schema } from '@tabletap/db';
import { AppError, validate } from '../lib/errors';
import { renderQrSheet } from '../lib/qr-pdf';
import { restaurantIdFor } from '../lib/restaurant';
import { qrSheet } from '../lib/ru';
import { staffKey } from '../lib/staff-key';
import { createTable, deleteTable, listTables, reissueQr, updateTable } from '../lib/tables-admin';
import { requireAction, requireStaff, requireTableAccess } from '../plugins/rbac';

const columns = {
  id: schema.tables.id,
  number: schema.tables.number,
  label: schema.tables.label,
  seats: schema.tables.seats,
  isActive: schema.tables.isActive,
};

const IdParamsSchema = z.object({ id: z.uuid() });
const TableUpdateSchema = TableWriteSchema.partial();
const OkResponseSchema = z.object({ ok: z.literal(true) });

/**
 * The name the sheet is saved under, in both of the forms `content-disposition` carries.
 *
 * The stem is built from the restaurant's own slug rather than its display name, and then reduced
 * again here: a `content-disposition` value is a header, and a quote or a newline inside a filename
 * would be a header injection rather than an odd download.
 *
 * Two names because the header has room for two, and the difference is the localisation. `filename`
 * is the ASCII fallback the syntax has always allowed and nothing more; `filename*` is RFC 5987's
 * form — percent-encoded UTF-8 — and it is the one every current browser actually saves the file
 * under, so the admin gets «little-furnace-QR-коды-2026-09-14.pdf» rather than a transliteration —
 * the same stem and the same day as the fallback, differing by the one translated word, so a
 * client that honours only `filename` saves the same file rather than a visibly different one.
 * Percent-encoding is also what keeps this safe: the header stays pure ASCII whatever the slug is,
 * and the five characters `encodeURIComponent` leaves alone are escaped by hand because RFC 5987's
 * `attr-char` does not include them.
 */
function asciiStem(slug: string): string {
  const safe = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe === '' ? 'tabletap' : safe;
}

/**
 * Exported for its own test: this is the guard that keeps a restaurant name out of the response
 * headers, and a guard no test can reach is a guard nobody will notice breaking. No route writes
 * a slug today, so the hostile input it is pinned against is theoretical - which is exactly when
 * a security property stops being exercised by accident.
 */
export function sheetDisposition(slug: string, printedOn: string): string {
  const stem = asciiStem(slug);
  const russian = encodeURIComponent(qrSheet.fileName(stem, printedOn)).replace(
    /['()!*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${stem}-qr-codes-${printedOn}.pdf"; filename*=UTF-8''${russian}`;
}

export async function tablesRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/tables',
    {
      preHandler: requireStaff('waiter', 'kitchen', 'admin'),
      schema: { response: { 200: TablesResponseSchema } },
    },
    async () => {
      const tables = await app.db
        .select(columns)
        .from(schema.tables)
        .orderBy(asc(schema.tables.number));
      return { tables };
    },
  );

  /**
   * The printable sheet. Registered as a static path, which find-my-way always prefers over the
   * `/tables/:id` pattern below, so `qr.pdf` is never read as a table id.
   *
   * Only active tables are printed: a deactivated one has no guests to seat, and its code would
   * answer "This table is not available" to anybody who scanned the card off the wall.
   */
  r.get(
    '/tables/qr.pdf',
    {
      preHandler: requireAction('tables.write'),
      // One call renders a QR bitmap per active table and lays them into a PDF, so it is the most
      // expensive thing an admin can ask for, and `server.ts` sets `global: false` - a limit here
      // is the only limit. Five a minute covers printing the sheet, checking it and printing it
      // again after a reissue; a held-down key or a loop stops at the sixth.
      config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: staffKey } },
    },
    async (request, reply) => {
      const restaurantId = await restaurantIdFor(app.db, request.principal);
      const [restaurant] = await app.db
        .select({ name: schema.restaurants.name, slug: schema.restaurants.slug })
        .from(schema.restaurants)
        .where(eq(schema.restaurants.id, restaurantId));
      if (!restaurant)
        throw new AppError(
          'NOT_FOUND',
          404,
          'restaurantNotConfigured',
          'No restaurant is configured.',
        );
      const tables = (await listTables(app.db, restaurantId)).filter((t) => t.isActive);
      const pdf = await renderQrSheet({
        restaurant: { name: restaurant.name },
        tables,
        // Signed here, one per card, at the version each table carries right now: a sheet printed
        // after a reissue carries the new code, and every card printed before it has stopped
        // working. The same TTL the demo link and the seed use, so a printed card lasts a year.
        tokenFor: (table) =>
          signTableToken(
            {
              tableId: table.id,
              restaurantId,
              tableNumber: table.number,
              qrVersion: table.qrVersion,
            },
            {
              secret: app.config.TABLE_TOKEN_SECRET,
              ttlSeconds: app.config.TABLE_TOKEN_TTL_DAYS * 86_400,
            },
          ),
        webOrigin: app.config.WEB_ORIGIN,
      });
      return reply
        .header('content-type', 'application/pdf')
        .header(
          'content-disposition',
          sheetDisposition(restaurant.slug, new Date().toISOString().slice(0, 10)),
        )
        .send(pdf);
    },
  );

  r.get(
    '/tables/:id',
    {
      preHandler: requireTableAccess('id'),
      schema: { params: z.object({ id: z.uuid() }), response: { 200: TableResponseSchema } },
    },
    async (request) => {
      const [table] = await app.db
        .select(columns)
        .from(schema.tables)
        .where(eq(schema.tables.id, request.params.id));
      if (!table) throw new AppError('NOT_FOUND', 404, 'tableNotFound', 'Table not found.');
      return { table };
    },
  );

  r.post(
    '/tables',
    {
      preHandler: requireAction('tables.write'),
      schema: { response: { 201: TableResponseSchema } },
    },
    async (request, reply) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'noAccess', 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const body = validate(TableWriteSchema, request.body);
      const table = await createTable(app.db, restaurantId, body, p.userId);
      return reply.status(201).send({ table });
    },
  );
  r.patch(
    '/tables/:id',
    {
      preHandler: requireAction('tables.write'),
      schema: { response: { 200: TableResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'noAccess', 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      const body = validate(TableUpdateSchema, request.body);
      const table = await updateTable(app.db, restaurantId, id, body, p.userId);
      return { table };
    },
  );
  r.delete(
    '/tables/:id',
    { preHandler: requireAction('tables.write'), schema: { response: { 200: OkResponseSchema } } },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'noAccess', 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      await deleteTable(app.db, restaurantId, id, p.userId);
      return { ok: true as const };
    },
  );

  /**
   * Reissue. Irreversible for anything already printed: every code carrying the old version stops
   * working the moment this answers, which is why the control in front of it confirms first.
   */
  r.post(
    '/tables/:id/qr',
    {
      preHandler: requireAction('tables.write'),
      schema: { response: { 200: TableResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'noAccess', 'You do not have access to this.');
      const restaurantId = await restaurantIdFor(app.db, p);
      const { id } = validate(IdParamsSchema, request.params);
      const table = await reissueQr(app.db, restaurantId, id, p.userId);
      return { table };
    },
  );
}
