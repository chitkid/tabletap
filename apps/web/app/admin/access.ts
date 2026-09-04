import type { Principal, StaffPrincipal } from '@tabletap/shared';

export type AdminAccess =
  | { readonly allowed: true; readonly staff: StaffPrincipal }
  | { readonly allowed: false; readonly redirectTo: string };

/**
 * Whether the admin surface is this caller's, and where they belong instead when it is not.
 *
 * The RBAC matrix already refuses a waiter and a kitchen member at every admin route, so this is
 * not the guard; it is the courtesy of sending each of them somewhere they have something to do
 * rather than leaving them on a screen full of refusals.
 */
export function adminAccess(principal: Principal): AdminAccess {
  if (principal.kind !== 'staff') return { allowed: false, redirectTo: '/login?next=/admin' };
  if (principal.role === 'kitchen') return { allowed: false, redirectTo: '/kitchen' };
  if (principal.role === 'waiter') return { allowed: false, redirectTo: '/' };
  return { allowed: true, staff: principal };
}
