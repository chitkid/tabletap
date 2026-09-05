// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signVisitor, VISITOR_HEADER, VISITOR_SIG_HEADER } from './lib/forward-signature';
import { middleware, nearestHop } from './middleware';

const SECRET = 'forward-secret-for-tests-0123456789abcdef';

describe('nearestHop', () => {
  it('takes the last hop of a chain, because that is the one a hop we control appended', () => {
    expect(nearestHop('203.0.113.10, 198.51.100.20')).toBe('198.51.100.20');
    expect(nearestHop('203.0.113.10,198.51.100.20,192.0.2.30')).toBe('192.0.2.30');
  });

  it('takes a single address as it stands', () => {
    expect(nearestHop('203.0.113.10')).toBe('203.0.113.10');
    expect(nearestHop('  203.0.113.10  ')).toBe('203.0.113.10');
    expect(nearestHop('2001:db8::1')).toBe('2001:db8::1');
  });

  it('has nothing to forward when the header is absent', () => {
    expect(nearestHop(null)).toBeNull();
  });

  it('has nothing to forward when the header is present but blank', () => {
    expect(nearestHop('')).toBeNull();
    expect(nearestHop('   ')).toBeNull();
    expect(nearestHop(',')).toBeNull();
  });

  it('skips empty entries rather than forwarding one', () => {
    expect(nearestHop('203.0.113.10, ')).toBe('203.0.113.10');
    expect(nearestHop(', 203.0.113.10')).toBe('203.0.113.10');
  });
});

describe('middleware', () => {
  const request = (forwardedFor?: string) =>
    new NextRequest('http://localhost:3000/api/guest/claim', {
      headers: forwardedFor === undefined ? {} : { 'x-forwarded-for': forwardedFor },
    });
  // Asserting the address is passed on rather than naming the header Next passes it in: the
  // mechanism is Next's to change, the property is ours.
  const passesOn = (res: Response) => JSON.stringify([...res.headers.entries()]);
  // Where a value is what is being asserted rather than merely its presence, this reads it back.
  // Next carries an overridden request header on the response as `x-middleware-request-<name>`.
  const forwarded = (res: Response, name: string) =>
    res.headers.get(`x-middleware-request-${name}`);

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes the visitor address on to the rewrite', async () => {
    expect(passesOn(await middleware(request('203.0.113.10')))).toContain('203.0.113.10');
  });

  it('changes nothing when there is no address to pass on', async () => {
    // The silent-degradation path: if the header ever stops arriving the demo quietly goes back
    // to one bucket for everyone, so the branch that does nothing must be visibly the other one.
    const bare = await middleware(request());
    expect(passesOn(bare)).not.toContain('x-forwarded-for');
    expect(bare.status).toBe(200);
    expect(passesOn(await middleware(request('203.0.113.10')))).not.toBe(passesOn(bare));
  });

  it('signs the address it forwards when a secret is configured', async () => {
    // Across two providers the API cannot tell this container from any other caller, so the
    // address alone proves nothing. The signature is what makes it worth honouring.
    vi.stubEnv('FORWARD_SECRET', SECRET);
    const res = await middleware(request('203.0.113.10'));
    expect(forwarded(res, VISITOR_HEADER)).toBe('203.0.113.10');
    expect(forwarded(res, VISITOR_SIG_HEADER)).toBe(await signVisitor('203.0.113.10', SECRET));
  });

  it('signs the nearest hop, the same address it forwards', async () => {
    // Signing anything but the forwarded address would leave the two disagreeing, and the API
    // would key on whichever it happened to read.
    vi.stubEnv('FORWARD_SECRET', SECRET);
    const res = await middleware(request('203.0.113.10, 198.51.100.20'));
    expect(forwarded(res, VISITOR_HEADER)).toBe('198.51.100.20');
    expect(forwarded(res, 'x-forwarded-for')).toBe('198.51.100.20');
    expect(forwarded(res, VISITOR_SIG_HEADER)).toBe(await signVisitor('198.51.100.20', SECRET));
  });

  it('sets neither header, and does not throw, when no secret is configured', async () => {
    // A deployment that forgets the secret degrades to one shared bucket, which is a worse demo
    // but a working one. Signing with an empty string would be the other, silent failure: every
    // request signed with a value the API also has, and so a forgery anyone could produce.
    const res = await middleware(request('203.0.113.10'));
    expect(forwarded(res, VISITOR_HEADER)).toBeNull();
    expect(forwarded(res, VISITOR_SIG_HEADER)).toBeNull();
    expect(res.status).toBe(200);
    expect(forwarded(res, 'x-forwarded-for')).toBe('203.0.113.10');
  });

  it('treats an empty secret as no secret', async () => {
    // A platform hands over an unset variable as `''`, not as absent (apps/api/src/config.ts).
    vi.stubEnv('FORWARD_SECRET', '');
    const res = await middleware(request('203.0.113.10'));
    expect(forwarded(res, VISITOR_HEADER)).toBeNull();
    expect(forwarded(res, VISITOR_SIG_HEADER)).toBeNull();
  });
});
