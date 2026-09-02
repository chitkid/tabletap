import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { createAuth } from '../auth';

async function forward(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const url = new URL(request.url, `${request.protocol}://${request.headers.host ?? 'localhost'}`);
  const init: RequestInit = { method: request.method, headers: fromNodeHeaders(request.headers) };
  if (request.body !== undefined && request.body !== null) init.body = JSON.stringify(request.body);
  const response = await app.auth.handler(new Request(url, init));
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  const text = await response.text();
  return reply.send(text.length > 0 ? text : null);
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('auth', createAuth({ db: app.db, config: app.config }));
  const handler = (request: FastifyRequest, reply: FastifyReply) => forward(app, request, reply);
  app.route({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    config: { public: true, principal: false, rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler,
  });
  app.route({ method: ['GET', 'POST'], url: '/api/auth/*', config: { public: true, principal: false }, handler });
});
