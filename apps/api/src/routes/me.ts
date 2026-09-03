import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MeResponseSchema } from '@tabletap/shared';
import { requireAuthenticated } from '../plugins/rbac';

export async function meRoutes(app: FastifyInstance) {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/me',
      { preHandler: requireAuthenticated(), schema: { response: { 200: MeResponseSchema } } },
      async (request) => ({ principal: request.principal }),
    );
}
