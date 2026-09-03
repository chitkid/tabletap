import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { Principal } from '@tabletap/shared';
import { GUEST_COOKIE, guestCookieOptions } from '../lib/guest-sessions';
import { resolvePrincipal } from '../lib/resolve-principal';

const ANONYMOUS: Principal = { kind: 'anonymous' };

export const principalPlugin = fp(async (app: FastifyInstance) => {
  // The initial value is never observed: the preHandler hook below always assigns
  // a real Principal before any route handler runs. Cast only to satisfy decorateRequest's
  // typing, which requires the default to match the (non-nullable) declared property type.
  app.decorateRequest<Principal, 'principal'>('principal', null as unknown as Principal);

  // Thin adapter: unsign the cookie, resolve, then apply the cookie decision to the reply.
  app.addHook('preHandler', async (request, reply) => {
    request.principal = ANONYMOUS;
    if (request.routeOptions.config.principal === false) return;

    const raw = request.cookies[GUEST_COOKIE];
    let guestCookie: string | undefined;
    let forgedGuestCookie = false;
    if (raw !== undefined) {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) guestCookie = unsigned.value;
      else forgedGuestCookie = true;
    }

    const resolved = await resolvePrincipal(app, { headers: request.headers, guestCookie });
    request.principal = resolved.principal;

    if (resolved.slidTo !== undefined && guestCookie !== undefined) {
      reply.setCookie(GUEST_COOKIE, guestCookie, guestCookieOptions(app.config, resolved.slidTo));
    } else if (
      resolved.clearGuestCookie ||
      (forgedGuestCookie && resolved.principal.kind === 'anonymous')
    ) {
      reply.clearCookie(GUEST_COOKIE, { path: '/' });
    }
  });
});
