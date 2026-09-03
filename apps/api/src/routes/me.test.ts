import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MeResponseSchema } from '@tabletap/shared';
import { createTestApp, signInAs } from '../test/helpers';

describe('GET /api/me', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('returns 401 UNAUTHORIZED for anonymous', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' },
    });
  });
  it.each([
    ['admin@littlefurnace.demo', 'admin', 'Mara Quinn'],
    ['kitchen@littlefurnace.demo', 'kitchen', 'Theo Baptiste'],
    ['waiter@littlefurnace.demo', 'waiter', 'Jun Okafor'],
  ])('returns the staff principal for %s', async (email, role, name) => {
    const cookie = await signInAs(ctx.app, email);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = MeResponseSchema.parse(res.json());
    expect(body.principal).toMatchObject({ kind: 'staff', email, role, name });
  });
  it('treats a garbage session cookie as anonymous', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: 'better-auth.session_token=garbage' },
    });
    expect(res.statusCode).toBe(401);
  });
});
