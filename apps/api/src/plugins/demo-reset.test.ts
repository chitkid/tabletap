import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { DEMO_RESTAURANT_SLUG } from '@tabletap/db/seed';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from '../config';
import { TEST_CONFIG, createTestApp } from '../test/helpers';

// Fly stops an idle demo machine, and a stopped machine runs no setInterval - so the reset must
// also fire once at boot, before the first interval tick could ever land. TEST_CONFIG trips two
// of the plugin's three early returns on its own (NODE_ENV 'test', interval 0), so proving the
// boot path - and pinning that it does not quietly bypass any of the three - needs a config that
// deliberately clears each one at a time.
describe('demo reset plugin: boot path', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>> | undefined;
  afterEach(async () => {
    await ctx?.close();
    ctx = undefined;
  });

  const restaurantRows = async () =>
    ctx!.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));

  // Builds with `ready: false` (so the plugin has not registered yet), empties the seeded
  // restaurant, then completes boot - the only way to observe what runs during startup itself
  // rather than on the first interval tick.
  const bootAfterEmptyingSeed = async (config: Config): Promise<void> => {
    ctx = await createTestApp({ ready: false, config });
    await ctx.db.delete(schema.restaurants);
    expect(await restaurantRows()).toHaveLength(0);
    await ctx.app.ready();
  };

  it('reseeds once at boot, before any interval could have elapsed', async () => {
    // NODE_ENV 'development' rather than 'production': better-auth's own rate limiter switches
    // on production and would change unrelated behaviour in this test.
    const config: Config = {
      ...TEST_CONFIG,
      NODE_ENV: 'development',
      DEMO_RESET_INTERVAL_MINUTES: 60,
    };
    await bootAfterEmptyingSeed(config);
    expect(await restaurantRows()).toHaveLength(1);
  });

  it('does nothing at boot when demo mode is off', async () => {
    const config: Config = {
      ...TEST_CONFIG,
      NODE_ENV: 'development',
      DEMO_RESET_INTERVAL_MINUTES: 60,
      DEMO_MODE: 'false',
      demoMode: false,
    };
    await bootAfterEmptyingSeed(config);
    expect(await restaurantRows()).toHaveLength(0);
  });

  it('does nothing at boot when the reset interval is zero', async () => {
    const config: Config = {
      ...TEST_CONFIG,
      NODE_ENV: 'development',
      DEMO_RESET_INTERVAL_MINUTES: 0,
    };
    await bootAfterEmptyingSeed(config);
    expect(await restaurantRows()).toHaveLength(0);
  });

  it('does nothing at boot in the test environment, even with demo mode on and a positive interval', async () => {
    const config: Config = { ...TEST_CONFIG, DEMO_RESET_INTERVAL_MINUTES: 60 };
    await bootAfterEmptyingSeed(config);
    expect(await restaurantRows()).toHaveLength(0);
  });
});
