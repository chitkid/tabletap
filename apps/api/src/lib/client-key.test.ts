import Fastify, { type FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { clientKey, VISITOR_HEADER, VISITOR_SIG_HEADER } from './client-key';

/**
 * The deployed value of TRUST_PROXY (`apps/api/src/config.ts`, pinned by `config.test.ts`):
 * the private network in front of the API, and nothing else. These tests are as much about that
 * configuration as about the function - together they are what stops a caller choosing its bucket.
 */
const TRUST_PROXY = 'loopback,uniquelocal';

const SECRET = 'forward-secret-for-tests-0123456789abcdef';

/** The minimum a `loadConfig` call needs; everything the key generator reads is added per test. */
const BASE_ENV = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECRET: 'y'.repeat(32),
  TABLE_TOKEN_SECRET: 'z'.repeat(32),
  SOCKET_TOKEN_SECRET: 'w'.repeat(32),
  TRUST_PROXY,
};

/**
 * A bare instance rather than the whole app: the decision under test is made from the trust
 * configuration, the configured secret and the request headers, and nothing else touches it.
 * The config goes through `loadConfig` rather than being hand-built, so a test cannot pass with a
 * shape the real environment could never produce.
 */
const buildApp = async (forwardSecret?: string): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false, trustProxy: TRUST_PROXY });
  app.decorate(
    'config',
    loadConfig(
      forwardSecret === undefined ? BASE_ENV : { ...BASE_ENV, FORWARD_SECRET: forwardSecret },
    ),
  );
  app.get('/who', async (request) => ({ key: clientKey(request) }));
  await app.ready();
  return app;
};

/** What the web computes with Web Crypto (`apps/web/lib/forward-signature.ts`). */
const sign = (address: string, secret: string): string =>
  createHmac('sha256', secret).update(address).digest('hex');

describe('clientKey', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const who = async (peer: string, forwardedFor?: string): Promise<string> => {
    const res = await app.inject({
      method: 'GET',
      url: '/who',
      remoteAddress: peer,
      ...(forwardedFor === undefined ? {} : { headers: { 'x-forwarded-for': forwardedFor } }),
    });
    return res.json<{ key: string }>().key;
  };

  it('keys on the address a trusted hop forwarded', async () => {
    expect(await who('127.0.0.1', '203.0.113.10')).toBe('ip:203.0.113.10');
  });

  it('takes the nearest hop of a chain, not the one the caller wrote first', async () => {
    // Everything left of the last entry is whatever the caller sent; only the last was added by
    // the hop we control. A caller who prepends an address cannot displace it.
    expect(await who('127.0.0.1', '203.0.113.10, 198.51.100.20')).toBe('ip:198.51.100.20');
  });

  it('falls back to the peer when there is no forwarded header', async () => {
    expect(await who('172.18.0.5')).toBe('ip:172.18.0.5');
  });

  it('falls back to the peer when the forwarded header is present but blank', async () => {
    expect(await who('172.18.0.5', '')).toBe('ip:172.18.0.5');
  });

  it('stops at the address a trusted proxy appended, whatever the caller wrote to its left', async () => {
    // The request an attacker actually sends: straight at the public API, carrying whatever
    // x-forwarded-for it likes. Its own address is appended after that by the proxy it had to
    // come through, and the walk stops on the first untrusted entry - which is that one.
    expect(await who('10.0.0.9', '198.51.100.20, 203.0.113.9')).toBe('ip:203.0.113.9');
    expect(await who('10.0.0.9', '10.0.0.1, 192.168.0.1, 203.0.113.9')).toBe('ip:203.0.113.9');
  });

  it('ignores a forwarded header when the peer itself is not trusted', async () => {
    // Which, since the web moved to a different platform, is the shape of an ordinary request
    // through the rewrite: the peer is a public address, so the chain it carries is worth nothing.
    // The block below is how a visitor's own address survives that; this is what happens without it.
    expect(await who('203.0.113.9', '198.51.100.20')).toBe('ip:203.0.113.9');
  });

  it('gives one visitor one bucket however its address is written', async () => {
    // Delegated to @fastify/rate-limit's normalizeIP - the same normalisation its default key
    // generator applies - so the routes keyed here are no weaker than the routes that are not.
    expect(await who('::ffff:203.0.113.9')).toBe('ip:203.0.113.9');
    expect(await who('127.0.0.1', '::ffff:cb00:7109')).toBe('ip:203.0.113.9');
    expect(await who('127.0.0.1', '2001:DB8::1')).toBe('ip:2001:db8::');
  });

  it('gives one bucket to a whole ipv6 /64, because a visitor is handed the whole prefix', async () => {
    // A home or mobile IPv6 line is delegated a prefix, so a fresh address inside it is free.
    // Keying on the full address would let one person mint buckets without limit.
    const first = await who('127.0.0.1', '2001:db8:abcd:1234::1');
    expect(first).toBe('ip:2001:db8:abcd:1234::');
    expect(await who('127.0.0.1', '2001:db8:abcd:1234::beef')).toBe(first);
  });
});

/**
 * The web and the API sit on different platforms (spec section 4.4), so the API's peer for a
 * request that came through the rewrite is an ordinary public address it has no reason to trust.
 * The signature is what replaces that trust: the address is honoured because the web could prove
 * it wrote it, not because of where the packet came from.
 */
describe('clientKey with a forwarding secret configured', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp(SECRET);
  });
  afterAll(async () => {
    await app.close();
  });

  const who = async (peer: string, headers: Record<string, string> = {}): Promise<string> => {
    const res = await app.inject({ method: 'GET', url: '/who', remoteAddress: peer, headers });
    return res.json<{ key: string }>().key;
  };
  const signed = (address: string, secret = SECRET): Record<string, string> => ({
    [VISITOR_HEADER]: address,
    [VISITOR_SIG_HEADER]: sign(address, secret),
  });

  it('keys on a forwarded address the web signed', async () => {
    expect(await who('127.0.0.1', signed('203.0.113.10'))).toBe('ip:203.0.113.10');
  });

  it('honours it even though the peer is a public address it does not trust', async () => {
    // This is the whole point of the scheme. Across two providers the web's call arrives as
    // ordinary internet traffic, so `trustProxy` rejects the peer and `x-forwarded-for` is
    // discarded - and the signed address is honoured anyway, because it carries its own proof.
    expect(await who('198.51.100.77', signed('203.0.113.10'))).toBe('ip:203.0.113.10');
  });

  it('ignores an address whose signature is wrong, and keys on the connection instead', async () => {
    // The property. An implementation that never verified anything would pass every test above
    // this one; it fails here. A forger has the address and the header names and no secret.
    const forged = {
      [VISITOR_HEADER]: '203.0.113.10',
      [VISITOR_SIG_HEADER]: sign('203.0.113.10', 'not-the-secret'),
    };
    expect(await who('198.51.100.77', forged)).toBe('ip:198.51.100.77');
  });

  it('ignores an address signed for a different address', async () => {
    // A signature the caller genuinely saw, replayed onto an address of its choosing.
    const stolen = {
      [VISITOR_HEADER]: '203.0.113.10',
      [VISITOR_SIG_HEADER]: sign('198.51.100.20', SECRET),
    };
    expect(await who('198.51.100.77', stolen)).toBe('ip:198.51.100.77');
  });

  it('ignores an address that carries no signature at all', async () => {
    expect(await who('198.51.100.77', { [VISITOR_HEADER]: '203.0.113.10' })).toBe(
      'ip:198.51.100.77',
    );
  });

  it('ignores a signature that carries no address', async () => {
    expect(await who('198.51.100.77', { [VISITOR_SIG_HEADER]: sign('203.0.113.10', SECRET) })).toBe(
      'ip:198.51.100.77',
    );
  });

  it('ignores a signature that is not hex, or is the wrong length, rather than throwing', async () => {
    // `timingSafeEqual` throws on a length mismatch and `Buffer.from` silently drops non-hex, so
    // both have to be handled before the comparison or a garbage header becomes a 500.
    for (const signature of [
      '',
      'zz',
      'deadbeef',
      'f'.repeat(63),
      'f'.repeat(65),
      'g'.repeat(64),
    ]) {
      expect(
        await who('198.51.100.77', {
          [VISITOR_HEADER]: '203.0.113.10',
          [VISITOR_SIG_HEADER]: signature,
        }),
      ).toBe('ip:198.51.100.77');
    }
  });

  it('still normalises the signed address, so a signed /64 is still one bucket', async () => {
    // The signature says the web observed this address; it says nothing about how many addresses
    // one visitor was handed. `normalizeIP` stays in front of the key either way.
    expect(await who('127.0.0.1', signed('2001:db8:abcd:1234::1'))).toBe('ip:2001:db8:abcd:1234::');
    expect(await who('127.0.0.1', signed('2001:db8:abcd:1234::beef'))).toBe(
      'ip:2001:db8:abcd:1234::',
    );
    expect(await who('127.0.0.1', signed('::ffff:203.0.113.9'))).toBe('ip:203.0.113.9');
  });

  it('falls back to the forwarded chain when neither header is present', async () => {
    // Configuring a secret must not disturb the path a request takes when the web sent none -
    // the local Compose demo, and any deployment sharing one private network.
    expect(await who('127.0.0.1', { 'x-forwarded-for': '203.0.113.10' })).toBe('ip:203.0.113.10');
    expect(await who('172.18.0.5')).toBe('ip:172.18.0.5');
  });
});

describe('clientKey with no forwarding secret configured', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const who = async (peer: string, headers: Record<string, string> = {}): Promise<string> => {
    const res = await app.inject({ method: 'GET', url: '/who', remoteAddress: peer, headers });
    return res.json<{ key: string }>().key;
  };

  it('verifies nothing rather than accepting anything', async () => {
    // The two readings of an absent secret, and only one of them is safe. With no secret there is
    // nothing to check a signature against, so the headers are ignored entirely - never waved
    // through. A deployment that forgets the secret shares one bucket; it does not open a hole.
    expect(
      await who('198.51.100.77', {
        [VISITOR_HEADER]: '203.0.113.10',
        [VISITOR_SIG_HEADER]: sign('203.0.113.10', SECRET),
      }),
    ).toBe('ip:198.51.100.77');
    expect(await who('198.51.100.77', { [VISITOR_HEADER]: '203.0.113.10' })).toBe(
      'ip:198.51.100.77',
    );
  });

  it('leaves the forwarded-chain behaviour exactly as it was', async () => {
    expect(await who('127.0.0.1', { 'x-forwarded-for': '203.0.113.10' })).toBe('ip:203.0.113.10');
    expect(await who('203.0.113.9', { 'x-forwarded-for': '198.51.100.20' })).toBe('ip:203.0.113.9');
  });
});

describe('the header names', () => {
  it('are the two the web writes', () => {
    // `apps/web/lib/forward-signature.ts` exports the same two literals and its own test pins
    // them. No module is shared between the two apps, so this pair of tests is the joint.
    expect(VISITOR_HEADER).toBe('x-tt-visitor');
    expect(VISITOR_SIG_HEADER).toBe('x-tt-visitor-signature');
  });
});
