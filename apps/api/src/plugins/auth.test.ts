import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, TEST_DEMO_PASSWORD, createTestApp } from '../test/helpers';

describe('better-auth mount', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });

  const signIn = (payload: object) => ctx.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { origin: TEST_CONFIG.WEB_ORIGIN }, payload });

  it('signs in a seeded staff member and sets a session cookie', async () => {
    const res = await signIn({ email: 'kitchen@littlefurnace.demo', password: TEST_DEMO_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.some((c) => c.name === 'better-auth.session_token')).toBe(true);
  });
  it('rejects a wrong password with 401', async () => {
    const res = await signIn({ email: 'kitchen@littlefurnace.demo', password: 'wrong' });
    expect(res.statusCode).toBe(401);
  });
  it('refuses sign-up', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: TEST_CONFIG.WEB_ORIGIN }, payload: { email: 'new@x.y', password: 'tabletap-demo', name: 'New' } });
    expect(res.statusCode).toBe(400);
  });
  it('rate-limits sign-in to 10 per minute per IP', async () => {
    const results: number[] = [];
    for (let i = 0; i < 11; i++) results.push((await signIn({ email: 'nobody@littlefurnace.demo', password: 'wrong' })).statusCode);
    expect(results.at(-1)).toBe(429);
    const last = await signIn({ email: 'nobody@littlefurnace.demo', password: 'wrong' });
    expect(last.json()).toEqual({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } });
  });
});
