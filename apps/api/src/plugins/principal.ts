import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { StaffRoleSchema, type Principal } from '@tabletap/shared';
import { GUEST_COOKIE, SLIDE_AFTER_MS, findActiveGuestSession, touchGuestSession } from '../lib/guest-sessions';

const ANONYMOUS: Principal = { kind: 'anonymous' };

export const principalPlugin = fp(async (app: FastifyInstance) => {
  // The initial value is never observed: the preHandler hook below always assigns
  // a real Principal before any route handler runs. Cast only to satisfy decorateRequest's
  // typing, which requires the default to match the (non-nullable) declared property type.
  app.decorateRequest<Principal, 'principal'>('principal', null as unknown as Principal);
  app.addHook('preHandler', async (request, reply) => {
    request.principal = ANONYMOUS;
    if (request.routeOptions.config.principal === false) return;
    let session;
    try {
      session = await app.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    } catch (err) {
      app.log.debug({ err }, 'getSession threw; treating as anonymous');
      return;
    }
    if (session) {
      const role = StaffRoleSchema.safeParse(session.user.role);
      if (role.success) {
        request.principal = { kind: 'staff', userId: session.user.id, email: session.user.email, name: session.user.name, role: role.data };
        return;
      }
    }

    const raw = request.cookies[GUEST_COOKIE];
    if (raw) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        const now = new Date();
        const guest = await findActiveGuestSession(app.db, unsigned.value, now);
        if (guest) {
          let expiresAt = guest.expiresAt;
          if (now.getTime() - guest.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
            expiresAt = await touchGuestSession(app.db, guest.id, { ttlHours: app.config.GUEST_SESSION_TTL_HOURS, now });
          }
          request.principal = { kind: 'guest', guestSessionId: guest.id, tableId: guest.tableId, tableNumber: guest.tableNumber, expiresAt: expiresAt.toISOString() };
          return;
        }
      }
      reply.clearCookie(GUEST_COOKIE, { path: '/' });
    }
  });
});
