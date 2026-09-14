import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SocketTokenResponseSchema } from '@tabletap/shared';
import { signSocketToken, type SocketPrincipal } from '@tabletap/shared/server';
import { clientKey } from '../lib/client-key';
import { AppError } from '../lib/errors';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAuthenticated } from '../plugins/rbac';

/** Short on purpose: the client fetches a fresh one before every connection attempt. */
export const SOCKET_TOKEN_TTL_SECONDS = 60;

export async function socketTokenRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/socket-token',
    {
      preHandler: requireAuthenticated(),
      // `keyGenerator: clientKey` and not the plugin's default, which keys on `request.ip`. Every
      // browser reaches this route through the web's `/api/*` rewrite, and since the two apps are
      // deployed to different platforms (spec section 4.4) that address is the web platform's
      // egress - the same for every visitor at once. On the default generator this is one bucket
      // of thirty a minute for the whole demo, and running out of it is not a limit being coarse:
      // `createSocket` answers a failed token fetch with an empty handshake (`cb({})`), the server
      // refuses it, and the client retries with backoff for ever. A correct deployment under a
      // little concurrent use would look exactly like a broken one.
      config: { rateLimit: { max: 30, timeWindow: '1 minute', keyGenerator: clientKey } },
      schema: { response: { 200: SocketTokenResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      let principal: SocketPrincipal;
      if (p.kind === 'staff')
        principal = {
          kind: 'staff',
          userId: p.userId,
          role: p.role,
          restaurantId: await restaurantIdFor(app.db, p),
        };
      else if (p.kind === 'guest')
        principal = {
          kind: 'guest',
          guestSessionId: p.guestSessionId,
          tableId: p.tableId,
          tableNumber: p.tableNumber,
          restaurantId: p.restaurantId,
        };
      else throw new AppError('UNAUTHORIZED', 401, 'signInRequired', 'Sign in to continue.');
      const token = await signSocketToken(principal, {
        secret: app.config.SOCKET_TOKEN_SECRET,
        ttlSeconds: SOCKET_TOKEN_TTL_SECONDS,
      });
      return { token, expiresInSeconds: SOCKET_TOKEN_TTL_SECONDS };
    },
  );
}
