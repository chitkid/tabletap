import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientKey } from './client-key';

/**
 * The deployed value of TRUST_PROXY (`apps/api/src/config.ts`, pinned by `config.test.ts`):
 * the private network in front of the API, and nothing else. These tests are as much about that
 * configuration as about the function - together they are what stops a caller choosing its bucket.
 */
const TRUST_PROXY = 'loopback,uniquelocal';

describe('clientKey', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    // A bare instance rather than the whole app: the decision under test is made from the trust
    // configuration and the request headers, and nothing else in the app touches it.
    app = Fastify({ logger: false, trustProxy: TRUST_PROXY });
    app.get('/who', async (request) => ({ key: clientKey(request) }));
    await app.ready();
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
    // Not this deployment's shape - on Fly the peer is always the platform's proxy - but it is
    // what an API exposed with no proxy in front of it does, and it must not be the other way.
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
