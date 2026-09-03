import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@tabletap/db';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import type { Config } from './config';
import { authPlugin } from './plugins/auth';
import { errorHandlerPlugin } from './plugins/error-handler';
import { principalPlugin } from './plugins/principal';
import { routeGuardPlugin } from './plugins/route-guard';
import { guestRoutes } from './routes/guest';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { tablesRoutes } from './routes/tables';
import './types';

export interface BuildAppOptions {
  db: Db;
  config: Config;
  logger?: boolean;
}

/** Inbound request ids are echoed and logged, so accept only a short opaque token. */
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;
  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
            ],
            ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
    // Fastify's own requestIdHeader takes the header verbatim; disable it and validate here.
    requestIdHeader: false,
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return typeof header === 'string' && REQUEST_ID.test(header) ? header : randomUUID();
    },
    // The API sits behind the Next.js rewrite: without this every request looks like it
    // came from the proxy and @fastify/rate-limit would share one bucket for everyone.
    trustProxy: config.TRUST_PROXY,
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
  // Before every route: onRoute only inspects routes registered after the hook exists.
  await app.register(routeGuardPlugin);
  await app.register(authPlugin);
  await app.register(principalPlugin);
  await app.register(healthRoutes);
  await app.register(meRoutes, { prefix: '/api' });
  await app.register(guestRoutes, { prefix: '/api' });
  await app.register(tablesRoutes, { prefix: '/api' });
  return app;
}
