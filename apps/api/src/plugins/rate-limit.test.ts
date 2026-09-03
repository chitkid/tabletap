import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, createTestApp } from '../test/helpers';

// In production every request reaches Fastify through the Next.js rewrite, so the socket
// address is always the same. Without trustProxy the rate limiter would key every guest
// on that one address and a single noisy client would lock out the whole restaurant.
describe('rate limiting behind a trusted proxy', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const signIn = (forwardedFor?: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: {
        origin: TEST_CONFIG.WEB_ORIGIN,
        ...(forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor }),
      },
      payload: { email: 'nobody@littlefurnace.demo', password: 'wrong' },
    });

  it('gives each forwarded client ip its own sign-in bucket', async () => {
    const fromA: number[] = [];
    for (let i = 0; i < 11; i++) fromA.push((await signIn('203.0.113.10')).statusCode);
    expect(fromA.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(fromA.at(-1)).toBe(429);

    // A different forwarded client is untouched by A exhausting its bucket...
    expect((await signIn('203.0.113.11')).statusCode).toBe(401);
    // ...and so is the loopback peer itself when it sends no x-forwarded-for.
    expect((await signIn()).statusCode).toBe(401);
  });
});
