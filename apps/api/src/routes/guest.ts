import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ClaimRequestSchema, ClaimResponseSchema } from '@tabletap/shared';
import { TableTokenVerifyError, verifyTableToken } from '@tabletap/shared/server';
import { schema } from '@tabletap/db';
import { recordAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import {
  GUEST_COOKIE,
  createGuestSession,
  expireGuestSession,
  guestCookieOptions,
} from '../lib/guest-sessions';

export async function guestRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/guest/claim',
    {
      config: { public: true, principal: false, rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: ClaimRequestSchema, response: { 200: ClaimResponseSchema } },
    },
    async (request, reply) => {
      let claims;
      try {
        claims = await verifyTableToken(request.body.token, {
          secret: app.config.TABLE_TOKEN_SECRET,
        });
      } catch (err) {
        if (err instanceof TableTokenVerifyError) {
          throw new AppError(
            err.code,
            401,
            err.code === 'TOKEN_EXPIRED'
              ? 'This QR code has expired. Ask staff for a new one.'
              : 'This QR code is not valid.',
          );
        }
        throw err;
      }
      const [table] = await app.db
        .select({
          id: schema.tables.id,
          number: schema.tables.number,
          label: schema.tables.label,
          qrVersion: schema.tables.qrVersion,
        })
        .from(schema.tables)
        .where(
          and(
            eq(schema.tables.id, claims.tableId),
            eq(schema.tables.restaurantId, claims.restaurantId),
            eq(schema.tables.isActive, true),
          ),
        );
      if (!table) throw new AppError('NOT_FOUND', 404, 'This table is not available.');
      // Reissuing a QR bumps the table's version, which revokes every code printed before: a
      // token whose version is behind is refused even though its signature still verifies.
      if (claims.qrVersion !== table.qrVersion)
        throw new AppError(
          'TOKEN_INVALID',
          401,
          'This QR code is no longer valid. Ask staff for a new one.',
        );

      // A guest moving tables re-claims from the same browser: end the session the incoming
      // cookie still points at, so one browser never holds two live sessions.
      const raw = request.cookies[GUEST_COOKIE];
      const unsigned = raw === undefined ? undefined : request.unsignCookie(raw);
      const previousSessionId = unsigned?.valid && unsigned.value ? unsigned.value : null;

      const now = new Date();
      const session = await app.db.transaction(async (tx) => {
        if (previousSessionId !== null) await expireGuestSession(tx, previousSessionId, now);
        const created = await createGuestSession(tx, {
          tableId: table.id,
          ttlHours: app.config.GUEST_SESSION_TTL_HOURS,
          now,
        });
        await recordAudit(tx, {
          actorType: 'guest',
          actorId: created.id,
          action: 'guest.claimed',
          entityType: 'table',
          entityId: table.id,
          payload: { tableNumber: table.number },
        });
        return created;
      });

      // Only hand out the cookie once the session and its audit row are committed.
      reply.setCookie(GUEST_COOKIE, session.id, guestCookieOptions(app.config, session.expiresAt));
      return { table, expiresAt: session.expiresAt.toISOString() };
    },
  );
}
