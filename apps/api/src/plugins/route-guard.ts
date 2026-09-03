import type { FastifyInstance, RouteOptions } from 'fastify';
import fp from 'fastify-plugin';
import { isRbacGuard } from './rbac';

const FIX = [
  'declare `config: { public: true }` when the route is deliberately open,',
  'or add a preHandler from src/plugins/rbac.ts',
  '(requireAuthenticated, requireAction, requireStaff, requireGuest, requireTableAccess).',
].join(' ');

/**
 * Default-deny for the route table. Forgetting a guard is silent at runtime — the route
 * simply answers everyone — so make it loud at boot instead: registration fails.
 * Must be registered before any route; onRoute only sees routes added after it.
 */
export const routeGuardPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('onRoute', (route: RouteOptions) => {
    if (route.config?.public === true) return;
    const preHandlers = Array.isArray(route.preHandler)
      ? route.preHandler
      : route.preHandler === undefined
        ? []
        : [route.preHandler];
    if (preHandlers.some(isRbacGuard)) return;
    const method = Array.isArray(route.method) ? route.method.join('|') : route.method;
    throw new Error(`Route ${method} ${route.url} has no access guard: ${FIX}`);
  });
});
