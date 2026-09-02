import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@tabletap/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import type { Config } from './config';
import { authPlugin } from './plugins/auth';
import { errorHandlerPlugin } from './plugins/error-handler';
import { principalPlugin } from './plugins/principal';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import './types';

export interface BuildAppOptions {
  db: Db;
  config: Config;
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
            ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', opts.db);
  app.decorate('config', config);
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(errorHandlerPlugin);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(rateLimit, {
    global: false,
    // @fastify/rate-limit throws this return value; it needs its own statusCode so
    // errorHandlerPlugin's generic 4xx/5xx mapping recognizes it as a 429, not a 500.
    errorResponseBuilder: (_req, context) => ({
      statusCode: context.statusCode,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' },
    }),
  });
  await app.register(authPlugin);
  await app.register(principalPlugin);
  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: '/api' });
  return app;
}
