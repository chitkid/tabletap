import type { preHandlerAsyncHookHandler } from 'fastify';
import { can, type Action, type Principal, type Role, type StaffRole } from '@tabletap/shared';
import { AppError } from '../lib/errors';

export function roleOf(principal: Principal): Role | null {
  if (principal.kind === 'staff') return principal.role;
  if (principal.kind === 'guest') return 'guest';
  return null;
}

const unauthorized = () => new AppError('UNAUTHORIZED', 401, 'Sign in to continue.');
const forbidden = () => new AppError('FORBIDDEN', 403, 'You do not have access to this.');

export function requireAuthenticated(): preHandlerAsyncHookHandler {
  return async (request) => {
    if (request.principal.kind === 'anonymous') throw unauthorized();
  };
}

export function requireAction(action: Action): preHandlerAsyncHookHandler {
  return async (request) => {
    const role = roleOf(request.principal);
    if (role === null) throw unauthorized();
    if (!can(role, action)) throw forbidden();
  };
}

export function requireStaff(...roles: StaffRole[]): preHandlerAsyncHookHandler {
  return async (request) => {
    const p = request.principal;
    if (p.kind === 'anonymous') throw unauthorized();
    if (p.kind !== 'staff' || !roles.includes(p.role)) throw forbidden();
  };
}

export function requireGuest(): preHandlerAsyncHookHandler {
  return async (request) => {
    const p = request.principal;
    if (p.kind === 'anonymous') throw unauthorized();
    if (p.kind !== 'guest') throw forbidden();
  };
}

/** Staff pass through `tables.read`; a guest may only touch the table bound to their session. */
export function requireTableAccess(param: string): preHandlerAsyncHookHandler {
  return async (request) => {
    const p = request.principal;
    if (p.kind === 'anonymous') throw unauthorized();
    if (p.kind === 'staff') {
      if (!can(p.role, 'tables.read')) throw forbidden();
      return;
    }
    const requested = (request.params as Record<string, string | undefined>)[param];
    if (!can('guest', 'tables.read.own') || requested !== p.tableId) throw forbidden();
  };
}
