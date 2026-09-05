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

  it('ignores a forwarded header sent by a caller that is not a trusted hop', async () => {
    // The API is publicly reachable, so this is the request an attacker actually sends: straight
    // at the API, from a public address, carrying whatever x-forwarded-for it likes. Its peer
    // address is not in the trust list, so the header is not read and the bucket is its own.
    expect(await who('203.0.113.9', '198.51.100.20')).toBe('ip:203.0.113.9');
    expect(await who('203.0.113.9', '10.0.0.1, 192.168.0.1')).toBe('ip:203.0.113.9');
  });

  it('reads an ipv4-mapped ipv6 peer as the one address it is', async () => {
    // Otherwise the same visitor arriving over an ipv6 socket and an ipv4 one holds two buckets.
    expect(await who('::ffff:203.0.113.9')).toBe('ip:203.0.113.9');
    expect(await who('127.0.0.1', '::ffff:203.0.113.10')).toBe('ip:203.0.113.10');
  });
});
