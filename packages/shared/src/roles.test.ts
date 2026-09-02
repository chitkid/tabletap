import { describe, expect, it } from 'vitest';
import { ACTIONS, ROLES, can } from './roles';

describe('can()', () => {
  it('lets every role read the menu', () => {
    for (const role of ROLES) expect(can(role, 'menu.read')).toBe(true);
  });
  it('restricts writes to admin', () => {
    expect(can('admin', 'menu.write')).toBe(true);
    expect(can('waiter', 'menu.write')).toBe(false);
    expect(can('kitchen', 'tables.write')).toBe(false);
    expect(can('guest', 'audit.read')).toBe(false);
  });
  it('scopes guests to their own table and orders', () => {
    expect(can('guest', 'tables.read.own')).toBe(true);
    expect(can('guest', 'tables.read')).toBe(false);
    expect(can('guest', 'orders.create')).toBe(true);
    expect(can('guest', 'orders.read.own')).toBe(true);
    expect(can('guest', 'orders.read.all')).toBe(false);
    expect(can('guest', 'orders.cancel.own')).toBe(true);
  });
  it('lets staff read all tables and orders and transition orders', () => {
    for (const role of ['waiter', 'kitchen', 'admin'] as const) {
      expect(can(role, 'tables.read')).toBe(true);
      expect(can(role, 'orders.read.all')).toBe(true);
      expect(can(role, 'orders.transition')).toBe(true);
      expect(can(role, 'orders.create')).toBe(false);
    }
  });
  it('has a decision for every action and role', () => {
    for (const action of ACTIONS) for (const role of ROLES) expect(typeof can(role, action)).toBe('boolean');
  });
});
