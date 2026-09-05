// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware, nearestHop } from './middleware';

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

  it('passes the visitor address on to the rewrite', () => {
    expect(passesOn(middleware(request('203.0.113.10')))).toContain('203.0.113.10');
  });

  it('changes nothing when there is no address to pass on', () => {
    // The silent-degradation path: if the header ever stops arriving the demo quietly goes back
    // to one bucket for everyone, so the branch that does nothing must be visibly the other one.
    const bare = middleware(request());
    expect(passesOn(bare)).not.toContain('x-forwarded-for');
    expect(bare.status).toBe(200);
    expect(passesOn(middleware(request('203.0.113.10')))).not.toBe(passesOn(bare));
  });
});
