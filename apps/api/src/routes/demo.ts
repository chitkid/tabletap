import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DEMO_TABLE_NUMBER, DemoLinksResponseSchema, RushResponseSchema } from '@tabletap/shared';
import { signTableToken } from '@tabletap/shared/server';
import { schema } from '@tabletap/db';
import { DEMO_RESTAURANT_SLUG, DEMO_STAFF } from '@tabletap/db/seed';
import { clientKey } from '../lib/client-key';
import { AppError } from '../lib/errors';

/**
 * Public in demo mode only: everything it returns is already public demo data (README).
 *
 * **"In demo mode only" is `server.ts`'s business, not a check in here.** Both handlers used to
 * open with `if (!config.demoMode) throw new AppError(…, 'notFound', …)`, which answered a refusal
 * no other route in this API raises — so an unauthenticated caller could tell a deployment with
 * the demo routes compiled in and `DEMO_MODE` off from one without them, which is exactly the bit
 * the refusal was supposed to hide. `server.ts` now registers this plugin only when demo mode is
 * on, so the path is answered by `setNotFoundHandler` and is the same answer as any other address
 * that does not exist. Do not reinstate an in-handler check: it can only ever be a second,
 * distinguishable way of saying no.
 */
export async function demoRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    '/demo/links',
    {
      // The web tier calls this from the server on every landing render, so every visitor
      // arrives as the web container's own address - the one caller `clientKey` cannot tell
      // apart, and the reason this ceiling is 300 rather than a per-visitor budget. The limit is
      // here to stop a runaway loop; the web tier also caches the answer for 30 seconds
      // (lib/demo-links.ts).
      config: {
        public: true,
        principal: false,
        rateLimit: { max: 300, timeWindow: '1 minute', keyGenerator: clientKey },
      },
      schema: { response: { 200: DemoLinksResponseSchema } },
    },
    async () => {
      const { config } = app;
      const [restaurant] = await app.db
        .select({ id: schema.restaurants.id })
        .from(schema.restaurants)
        .where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
      const [table] = restaurant
        ? await app.db
            .select({
              id: schema.tables.id,
              number: schema.tables.number,
              qrVersion: schema.tables.qrVersion,
            })
            .from(schema.tables)
            .where(
              and(
                eq(schema.tables.restaurantId, restaurant.id),
                eq(schema.tables.number, DEMO_TABLE_NUMBER),
                // A deactivated table has no guests to seat, and its code answers "This table is
                // not available" to anyone who scans it - so handing its link to the landing would
                // publish a card that is already dead.
                eq(schema.tables.isActive, true),
              ),
            )
        : [];
      // Two different failures, and the landing acts on the difference (apps/web/lib/demo-links.ts).
      // No restaurant means the demo data was never seeded, which is the same thing to a visitor as
      // demo mode being off: the landing degrades to a plain product page. A restaurant with no
      // active table 7 means an admin renumbered or deactivated it - the deployment is fine and the
      // landing should say what is missing rather than quietly losing its cards, its QR and its
      // sign-in buttons.
      if (!restaurant)
        throw new AppError('NOT_FOUND', 404, 'demoNotSeeded', 'Demo data is not seeded.');
      if (!table)
        throw new AppError(
          'CONFLICT',
          409,
          'demoTableMissing',
          `The demo landing needs an active table ${DEMO_TABLE_NUMBER}. Restore it in the admin.`,
        );
      const token = await signTableToken(
        {
          tableId: table.id,
          restaurantId: restaurant.id,
          tableNumber: table.number,
          qrVersion: table.qrVersion,
        },
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
        payments: {
          provider: config.paymentProvider,
          // Stripe's universally documented test card; in demo mode there is nothing to type.
          testCard: config.paymentProvider === 'stripe' ? '4242 4242 4242 4242' : null,
        },
      };
    },
  );
  r.post(
    '/demo/rush',
    {
      // Two a minute per visitor: a rush writes orders for everyone watching the kitchen board,
      // so one person pressing it must not spend the whole demo's allowance.
      config: {
        public: true,
        principal: false,
        rateLimit: { max: 2, timeWindow: '1 minute', keyGenerator: clientKey },
      },
      schema: { response: { 200: RushResponseSchema } },
    },
    async () => {
      if (!app.rush.start())
        throw new AppError(
          'CONFLICT',
          409,
          'rushAlreadyRunning',
          'A rush is already running. Give it a minute.',
        );
      return {
        started: true as const,
        durationSeconds: app.rush.durationSeconds,
        ordersPlanned: app.rush.ordersPlanned,
      };
    },
  );
}
