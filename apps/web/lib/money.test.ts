import { describe, expect, it } from 'vitest';
import { formatCents } from './money';
describe('formatCents', () => {
  it('formats USD cents', () => {
    expect(formatCents(2600)).toBe('$26.00');
    expect(formatCents(450)).toBe('$4.50');
    expect(formatCents(0)).toBe('$0.00');
  });
});
