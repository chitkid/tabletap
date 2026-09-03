import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, canTransition } from './orders';
import {
  ACTIVE_ORDER_STATUSES,
  TRANSITION_RIGHTS,
  canRoleTransition,
  isActiveStatus,
} from './index';

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
    expect(canTransition('placed', 'served')).toBe(false);
    expect(canTransition('ready', 'cooking')).toBe(false);
    for (const s of ORDER_STATUSES) expect(canTransition(s, s)).toBe(false);
    expect(canTransition('served', 'placed')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
  });
});

describe('M3 state machine', () => {
  it('allows placed → cooking while payments do not exist (ADR 0009)', () => {
    expect(canTransition('placed', 'cooking')).toBe(true);
    expect(canTransition('placed', 'ready')).toBe(false);
  });
  it('names the four active statuses', () => {
    expect(ACTIVE_ORDER_STATUSES).toEqual(['placed', 'paid', 'cooking', 'ready']);
    expect(ORDER_STATUSES.filter(isActiveStatus)).toEqual([...ACTIVE_ORDER_STATUSES]);
  });
  it('gives each role only its targets and never paid', () => {
    expect(TRANSITION_RIGHTS.kitchen).toEqual(['cooking', 'ready', 'served', 'cancelled']);
    expect(TRANSITION_RIGHTS.waiter).toEqual(['served', 'cancelled']);
    expect(TRANSITION_RIGHTS.admin).toEqual(['cooking', 'ready', 'served', 'cancelled']);
    for (const role of ['kitchen', 'waiter', 'admin'] as const)
      expect(TRANSITION_RIGHTS[role]).not.toContain('paid');
  });
  it.each([
    ['kitchen', 'placed', 'cooking', true],
    ['kitchen', 'cooking', 'ready', true],
    ['kitchen', 'ready', 'served', true],
    ['kitchen', 'placed', 'cancelled', true],
    ['kitchen', 'cooking', 'placed', false],
    ['waiter', 'placed', 'cooking', false],
    ['waiter', 'ready', 'served', true],
    ['admin', 'paid', 'cooking', true],
    ['admin', 'placed', 'paid', false],
  ] as const)('%s: %s → %s is %s', (role, from, to, allowed) => {
    expect(canRoleTransition(role, from, to)).toBe(allowed);
  });
});
