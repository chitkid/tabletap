import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ClaimRequestSchema, ClaimResponseSchema } from '@tabletap/shared';
import { TableTokenVerifyError, verifyTableToken } from '@tabletap/shared/server';
import { schema } from '@tabletap/db';
import { recordAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { GUEST_COOKIE, createGuestSession } from '../lib/guest-sessions';

export async function guestRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/guest/claim',
    {
      config: { principal: false, rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: ClaimRequestSchema, response: { 200: ClaimResponseSchema } },
    },
    async (request, reply) => {
      let claims;
      try {
        claims = await verifyTableToken(request.body.token, { secret: app.config.TABLE_TOKEN_SECRET });
      } catch (err) {
        if (err instanceof TableTokenVerifyError) {
          throw new AppError(err.code, 401, err.code === 'TOKEN_EXPIRED' ? 'This QR code has expired. Ask staff for a new one.' : 'This QR code is not valid.');
        }
        throw err;
      }
      const [table] = await app.db
        .select({ id: schema.tables.id, number: schema.tables.number, label: schema.tables.label })
        .from(schema.tables)
        .where(and(eq(schema.tables.id, claims.tableId), eq(schema.tables.restaurantId, claims.restaurantId), eq(schema.tables.isActive, true)));
      if (!table) throw new AppError('NOT_FOUND', 404, 'This table is not available.');

      const session = await createGuestSession(app.db, { tableId: table.id, ttlHours: app.config.GUEST_SESSION_TTL_HOURS });
      reply.setCookie(GUEST_COOKIE, session.id, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: app.config.NODE_ENV === 'production',
        path: '/',
        expires: session.expiresAt,
      });
      await recordAudit(app.db, { actorType: 'guest', actorId: session.id, action: 'guest.claimed', entityType: 'table', entityId: table.id, payload: { tableNumber: table.number } });
      return { table, expiresAt: session.expiresAt.toISOString() };
    },
  );
}
