import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, TEST_DEMO_PASSWORD, createTestApp, signInAs } from '../test/helpers';

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
  it('serves the session through the forwarder for a signed-in staff member', async () => {
    const cookie = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/get-session', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('waiter@littlefurnace.demo');
  });
  it('answers get-session with null when there is no cookie', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/get-session' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
  });
  it('sign-out clears the session cookie and ends the session', async () => {
    const cookie = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    expect((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(200);
    const out = await ctx.app.inject({ method: 'POST', url: '/api/auth/sign-out', headers: { cookie, origin: TEST_CONFIG.WEB_ORIGIN } });
    expect(out.statusCode).toBe(200);
    const cleared = out.cookies.find((c) => c.name === 'better-auth.session_token');
    expect(cleared).toBeDefined();
    expect(cleared?.value).toBe('');
    expect((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(401);
  });
  it('leaves better-auth error bodies untranslated', async () => {
    const res = await signIn({ email: 'kitchen@littlefurnace.demo', password: 'wrong' });
    expect(res.statusCode).toBe(401);
    // better-auth owns the shape under /api/auth; we forward it rather than re-wrapping it.
    expect(res.json()).toMatchObject({ code: 'INVALID_EMAIL_OR_PASSWORD' });
    expect(res.json().error).toBeUndefined();
  });
  it('answers an unknown /api/auth path with our not-found envelope', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/auth/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route GET /api/auth/does-not-exist not found' } });
  });
  it('rate-limits sign-in to 10 per minute per IP', async () => {
    const results: number[] = [];
    for (let i = 0; i < 11; i++) results.push((await signIn({ email: 'nobody@littlefurnace.demo', password: 'wrong' })).statusCode);
    expect(results.at(-1)).toBe(429);
    const last = await signIn({ email: 'nobody@littlefurnace.demo', password: 'wrong' });
    expect(last.json()).toEqual({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } });
  });
});
