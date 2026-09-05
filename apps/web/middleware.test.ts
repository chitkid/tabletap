// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { nearestHop } from './middleware';

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
