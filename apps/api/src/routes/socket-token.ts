import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SocketTokenResponseSchema } from '@tabletap/shared';
import { signSocketToken, type SocketPrincipal } from '@tabletap/shared/server';
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
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
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
      else throw new AppError('UNAUTHORIZED', 401, 'Sign in to continue.');
      const token = await signSocketToken(principal, {
        secret: app.config.SOCKET_TOKEN_SECRET,
        ttlSeconds: SOCKET_TOKEN_TTL_SECONDS,
      });
      return { token, expiresInSeconds: SOCKET_TOKEN_TTL_SECONDS };
    },
  );
}
