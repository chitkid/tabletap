import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', async (request) => {
    if (request.principal.kind === 'anonymous') throw new AppError('UNAUTHORIZED', 401, 'Sign in to continue.');
    return { principal: request.principal };
  });
}
