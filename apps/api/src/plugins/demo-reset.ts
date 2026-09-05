import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { seed } from '@tabletap/db/seed';
import { scheduleDemoReset } from '../lib/demo-reset';

export const demoResetPlugin = fp(async (app: FastifyInstance) => {
  const { config } = app;
  if (!config.demoMode || config.DEMO_RESET_INTERVAL_MINUTES <= 0 || config.NODE_ENV === 'test')
    return;
  const runReset = async () => {
    // Drain any in-flight rush order before reseeding: an insert whose transaction is still
    // open when the reset deletes and reseeds would fail on now-missing foreign keys.
    // `app.rush` only exists because demoRushPlugin registers before this plugin in
    // server.ts - reordering those two registrations would make this throw.
    await app.rush.stop();
    const result = await seed(app.db, {
      mode: 'reset',
      demoPassword: config.DEMO_PASSWORD,
      tableTokenSecret: config.TABLE_TOKEN_SECRET,
      tableTokenTtlDays: config.TABLE_TOKEN_TTL_DAYS,
      webOrigin: config.WEB_ORIGIN,
    });
    app.log.info({ counts: result.counts }, 'demo data reset');
    app.orderEvents.emit('demo:reset');
  };
  // Fly stops an idle demo machine, and a stopped machine runs no setInterval - so a demo left
  // in a mess stays in a mess until the next visitor wakes it and sees it. Reset once on boot,
  // in addition to the interval below, so a wake finds the demo clean. `onReady` rather than
  // running inline: the plugin registers before the routes, and a seed racing the routes it
  // will feed is a race worth avoiding. A boot reset that fails must not stop the server from
  // starting - a demo with stale data is better than no demo.
  app.addHook('onReady', async () => {
    await runReset().catch((err: unknown) => app.log.error({ err }, 'demo reset on boot failed'));
  });
  const stop = scheduleDemoReset({
    intervalMs: config.DEMO_RESET_INTERVAL_MINUTES * 60_000,
    run: runReset,
    log: { error: (obj, msg) => app.log.error(obj, msg) },
  });
  app.addHook('onClose', async () => stop());
  app.log.info({ everyMinutes: config.DEMO_RESET_INTERVAL_MINUTES }, 'demo reset scheduled');
});
