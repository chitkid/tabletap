import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, canTransition } from './orders';

describe('canTransition()', () => {
  it('follows the happy path', () => {
    expect(canTransition('draft', 'placed')).toBe(true);
    expect(canTransition('placed', 'paid')).toBe(true);
    expect(canTransition('paid', 'cooking')).toBe(true);
    expect(canTransition('cooking', 'ready')).toBe(true);
    expect(canTransition('ready', 'served')).toBe(true);
  });
  it('allows cancel only from placed and paid', () => {
    expect(canTransition('placed', 'cancelled')).toBe(true);
    expect(canTransition('paid', 'cancelled')).toBe(true);
    expect(canTransition('cooking', 'cancelled')).toBe(false);
    expect(canTransition('draft', 'cancelled')).toBe(false);
    expect(canTransition('ready', 'cancelled')).toBe(false);
  });
  it('rejects skips, reversals and self transitions', () => {
    expect(canTransition('placed', 'cooking')).toBe(false);
    expect(canTransition('ready', 'cooking')).toBe(false);
    for (const s of ORDER_STATUSES) expect(canTransition(s, s)).toBe(false);
    expect(canTransition('served', 'placed')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
  });
});
