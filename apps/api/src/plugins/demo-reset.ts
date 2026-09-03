import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { seed } from '@tabletap/db/seed';
import { scheduleDemoReset } from '../lib/demo-reset';

export const demoResetPlugin = fp(async (app: FastifyInstance) => {
  const { config } = app;
  if (!config.demoMode || config.DEMO_RESET_INTERVAL_MINUTES <= 0 || config.NODE_ENV === 'test')
    return;
  const stop = scheduleDemoReset({
    intervalMs: config.DEMO_RESET_INTERVAL_MINUTES * 60_000,
    run: async () => {
      const result = await seed(app.db, {
        mode: 'reset',
        demoPassword: config.DEMO_PASSWORD,
        tableTokenSecret: config.TABLE_TOKEN_SECRET,
        tableTokenTtlDays: config.TABLE_TOKEN_TTL_DAYS,
        webOrigin: config.WEB_ORIGIN,
      });
      app.log.info({ counts: result.counts }, 'demo data reset');
    },
    log: { error: (obj, msg) => app.log.error(obj, msg) },
  });
  app.addHook('onClose', async () => stop());
  app.log.info({ everyMinutes: config.DEMO_RESET_INTERVAL_MINUTES }, 'demo reset scheduled');
});
