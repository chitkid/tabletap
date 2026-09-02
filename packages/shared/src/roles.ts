import { z } from 'zod';

export const STAFF_ROLES = ['waiter', 'kitchen', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ROLES = ['guest', ...STAFF_ROLES] as const;
export type Role = (typeof ROLES)[number];
export const StaffRoleSchema = z.enum(STAFF_ROLES);
export const RoleSchema = z.enum(ROLES);

export const ACTIONS = [
  'menu.read',
  'menu.write',
  'tables.read',
  'tables.read.own',
  'tables.write',
  'orders.create',
  'orders.read.own',
  'orders.read.all',
  'orders.transition',
  'orders.cancel.own',
  'audit.read',
  'dashboard.read',
] as const;
export type Action = (typeof ACTIONS)[number];

const STAFF: readonly Role[] = STAFF_ROLES;
const ADMIN: readonly Role[] = ['admin'];
const GUEST: readonly Role[] = ['guest'];

/** Single source of truth for permissions. Later milestones add actions here first. */
const MATRIX: Record<Action, readonly Role[]> = {
  'menu.read': ROLES,
  'menu.write': ADMIN,
  'tables.read': STAFF,
  'tables.read.own': GUEST,
  'tables.write': ADMIN,
  'orders.create': GUEST,
  'orders.read.own': GUEST,
  'orders.read.all': STAFF,
  'orders.transition': STAFF,
  'orders.cancel.own': GUEST,
  'audit.read': ADMIN,
  'dashboard.read': ADMIN,
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}
