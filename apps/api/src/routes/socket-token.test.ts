import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VISITOR_HEADER, VISITOR_SIG_HEADER } from '../lib/client-key';
import { TEST_CONFIG, createTestApp } from '../test/helpers';

const FORWARD_SECRET = 'forward-secret-for-tests-0123456789abcdef';
const sign = (address: string): string =>
  createHmac('sha256', FORWARD_SECRET).update(address).digest('hex');
/** What `apps/web/middleware.ts` puts on a request it forwards over the `/api/*` rewrite. */
const visitor = (address: string): Record<string, string> => ({
  [VISITOR_HEADER]: address,
  [VISITOR_SIG_HEADER]: sign(address),
});

/**
 * The route is `requireAuthenticated()`, and these requests carry no session - which is the point.
 * The limiter runs on `onRequest`, before any guard, so a 401 is counted the same as a token that
 * was issued; driving the bucket with refused calls measures the key generator and nothing else.
 *
 * Every request below arrives from **one** peer address, because that is the deployed shape: the
 * web and the API are on different platforms, so every browser reaches this route through the
 * `/api/*` rewrite and the API sees the web platform's egress address for all of them. The signed
 * visitor header is the only thing that tells two visitors apart, which is why a route keyed on
 * `request.ip` alone gives the whole internet one bucket here - and why this test would pass
 * against `@fastify/rate-limit`'s default key generator if the two callers used different peers.
 */
describe('POST /api/socket-token rate limiting', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const REWRITE_PEER = '198.51.100.77';

  beforeAll(async () => {
    ctx = await createTestApp({
      seed: false,
      config: { ...TEST_CONFIG, FORWARD_SECRET },
    });
  });
  afterAll(async () => {
    await ctx.close();
  });

  const fire = (address: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/socket-token',
      remoteAddress: REWRITE_PEER,
      headers: visitor(address),
    });

  it('gives two visitors behind one rewrite their own buckets', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await fire('203.0.113.10')).statusCode);
    expect(statuses.slice(0, 30)).toEqual(Array(30).fill(401));
    expect(statuses.at(-1)).toBe(429);
    expect((await fire('203.0.113.10')).json().error.code).toBe('RATE_LIMITED');

    // The second visitor, on the same connection the first one exhausted. A 429 here is the
    // defect: one visitor's kitchen board would take the socket token away from every other
    // visitor at once, and `createSocket` answers a failed token fetch with an empty handshake
    // the server refuses - a retry loop on a deployment with nothing wrong with it.
    expect((await fire('198.51.100.20')).statusCode).toBe(401);
  });
});
