import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DashboardResponseSchema } from '@tabletap/shared';
import { createTestApp, signInAs } from '../test/helpers';

describe('GET /api/dashboard', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('is 401 for anonymous', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(res.statusCode).toBe(401);
  });

  it('is 403 for waiter and kitchen', async () => {
    for (const email of ['waiter@littlefurnace.demo', 'kitchen@littlefurnace.demo']) {
      const cookie = await signInAs(ctx.app, email);
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/dashboard',
        headers: { cookie },
      });
      expect(res.statusCode, email).toBe(403);
    }
  });

  it('is 200 for admin, and the body parses as a DashboardResponse', async () => {
    const cookie = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/dashboard', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const dashboard = DashboardResponseSchema.parse(res.json());
    expect(dashboard.week).toHaveLength(7);
  });
});
