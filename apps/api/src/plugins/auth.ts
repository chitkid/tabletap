import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { createAuth } from '../auth';

// better-auth receives the URL we build and a body we re-serialise, so the client's framing
// headers would describe a request that no longer exists. Everything else (origin, cookie,
// content-type, user-agent, ...) is forwarded untouched.
const DROPPED_REQUEST_HEADERS = ['content-length', 'transfer-encoding', 'connection', 'host'];

async function forward(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const url = new URL(request.url, `${request.protocol}://${request.headers.host ?? 'localhost'}`);
  const headers = fromNodeHeaders(request.headers);
  for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name);
  const init: RequestInit = { method: request.method, headers };
  if (request.body !== undefined && request.body !== null) init.body = JSON.stringify(request.body);
  const response = await app.auth.handler(new Request(url, init));
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    // Fastify recomputes the length for whatever we end up sending.
    if (name !== 'set-cookie' && name !== 'content-length') reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  const text = await response.text();
  if (text.length > 0) return reply.send(text);
  // better-auth answers an unknown path under /api/auth with an empty 404. Everything else it
  // says stays untranslated, but a bare `null` there is no answer at all: use our envelope.
  if (response.status === 404) {
    return reply.send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
  }
  return reply.send(null);
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
