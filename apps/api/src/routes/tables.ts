import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TableResponseSchema, TablesResponseSchema } from '@tabletap/shared';
import { schema } from '@tabletap/db';
import { AppError } from '../lib/errors';
import { requireStaff, requireTableAccess } from '../plugins/rbac';

const columns = {
  id: schema.tables.id,
  number: schema.tables.number,
  label: schema.tables.label,
  seats: schema.tables.seats,
  isActive: schema.tables.isActive,
};

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
      if (!table) throw new AppError('NOT_FOUND', 404, 'Table not found.');
      return { table };
    },
  );
}
