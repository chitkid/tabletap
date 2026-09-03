import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createRush } from '../lib/rush';

/** Always decorated so the route and the reset scheduler can rely on it; the route gates on demo mode. */
export const demoRushPlugin = fp(async (app: FastifyInstance) => {
  const rush = createRush({
    db: app.db,
    events: app.orderEvents,
    log: { error: (obj, msg) => app.log.error(obj, msg) },
  });
  app.decorate('rush', rush);
  app.addHook('onClose', async () => rush.stop());
});
