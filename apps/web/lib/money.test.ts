import { describe, expect, it } from 'vitest';
import { formatCents } from './money';
describe('formatCents', () => {
  it('formats cents in the currency it is given', () => {
    expect(formatCents(2600, 'USD')).toBe('$26.00');
    expect(formatCents(450, 'USD')).toBe('$4.50');
    expect(formatCents(0, 'USD')).toBe('$0.00');
  });
  it('has no default currency, so a caller cannot forget to say which one', () => {
    expect(formatCents(2600, 'EUR')).toBe('€26.00');
    expect(formatCents(2600, 'JPY')).toBe('¥26');
  });
});
