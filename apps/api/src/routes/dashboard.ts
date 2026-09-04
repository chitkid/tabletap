import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DashboardResponseSchema } from '@tabletap/shared';
import { loadDashboard } from '../lib/dashboard';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAction } from '../plugins/rbac';

export async function dashboardRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/dashboard',
    {
      preHandler: requireAction('dashboard.read'),
      schema: { response: { 200: DashboardResponseSchema } },
    },
    async (request) => {
      const restaurantId = await restaurantIdFor(app.db, request.principal);
      return loadDashboard(app.db, restaurantId);
    },
  );
}
