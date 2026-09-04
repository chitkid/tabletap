import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DemoLinksResponseSchema, RushResponseSchema } from '@tabletap/shared';
import { signTableToken } from '@tabletap/shared/server';
import { schema } from '@tabletap/db';
import { DEMO_RESTAURANT_SLUG, DEMO_STAFF } from '@tabletap/db/seed';
import { AppError } from '../lib/errors';

export const DEMO_TABLE_NUMBER = 7;

/** Public in demo mode only: everything it returns is already public demo data (README). */
export async function demoRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/demo/links',
    {
      // The web tier calls this from the server on every landing render, so every visitor
      // arrives as the same ip. The limit is here to stop a runaway loop, not to budget
      // visitors; the web tier also caches the answer for 30 seconds (lib/demo-links.ts).
      config: { public: true, principal: false, rateLimit: { max: 300, timeWindow: '1 minute' } },
      schema: { response: { 200: DemoLinksResponseSchema } },
    },
    async () => {
      const { config } = app;
      if (!config.demoMode) throw new AppError('NOT_FOUND', 404, 'Not found.');
      const [restaurant] = await app.db
        .select({ id: schema.restaurants.id })
        .from(schema.restaurants)
        .where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
      const [table] = restaurant
        ? await app.db
            .select({ id: schema.tables.id, number: schema.tables.number })
            .from(schema.tables)
            .where(
              and(
                eq(schema.tables.restaurantId, restaurant.id),
                eq(schema.tables.number, DEMO_TABLE_NUMBER),
              ),
            )
        : [];
      if (!restaurant || !table) throw new AppError('NOT_FOUND', 404, 'Demo data is not seeded.');
      const token = await signTableToken(
        { tableId: table.id, restaurantId: restaurant.id, tableNumber: table.number },
        { secret: config.TABLE_TOKEN_SECRET, ttlSeconds: config.TABLE_TOKEN_TTL_DAYS * 86_400 },
      );
      return {
        guest: { tableNumber: table.number, url: `${config.WEB_ORIGIN}/t/${token}` },
        staff: DEMO_STAFF.map((s) => ({
          role: s.role,
          email: s.email,
          name: s.name,
          password: config.DEMO_PASSWORD,
        })),
        resetsEveryMinutes:
          config.DEMO_RESET_INTERVAL_MINUTES > 0 ? config.DEMO_RESET_INTERVAL_MINUTES : null,
        // No provider selection exists yet (M4 Task 3): every deployment on this branch is the
        // demo one, so there is never a card to type.
        payments: { provider: 'demo' as const, testCard: null },
      };
    },
  );
  r.post(
    '/demo/rush',
    {
      config: { public: true, principal: false, rateLimit: { max: 2, timeWindow: '1 minute' } },
      schema: { response: { 200: RushResponseSchema } },
    },
    async () => {
      if (!app.config.demoMode) throw new AppError('NOT_FOUND', 404, 'Not found.');
      if (!app.rush.start())
        throw new AppError('CONFLICT', 409, 'A rush is already running. Give it a minute.');
      return {
        started: true as const,
        durationSeconds: app.rush.durationSeconds,
        ordersPlanned: app.rush.ordersPlanned,
      };
    },
  );
}
