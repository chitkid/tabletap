import type { Principal } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import { adminAccess } from './access';

const staff = (role: 'admin' | 'kitchen' | 'waiter'): Principal => ({
  kind: 'staff',
  userId: 'u1',
  email: 'someone@example.com',
  name: 'Ada Byron',
  role,
});

describe('adminAccess', () => {
  it('lets an admin through and hands the shell their name', () => {
    const access = adminAccess(staff('admin'));
    expect(access.allowed).toBe(true);
    expect(access.allowed && access.staff.name).toBe('Ada Byron');
  });

  it('sends a kitchen member and a waiter where each has something to do', () => {
    expect(adminAccess(staff('kitchen'))).toEqual({ allowed: false, redirectTo: '/kitchen' });
    expect(adminAccess(staff('waiter'))).toEqual({ allowed: false, redirectTo: '/' });
  });

  it('asks anyone who is not staff to sign in and come back', () => {
    expect(adminAccess({ kind: 'anonymous' })).toEqual({
      allowed: false,
      redirectTo: '/login?next=/admin',
    });
    expect(
      adminAccess({
        kind: 'guest',
        guestSessionId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f01',
        tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f02',
        restaurantId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f03',
        tableNumber: 7,
        expiresAt: '2026-09-04T10:00:00.000Z',
      }),
    ).toEqual({ allowed: false, redirectTo: '/login?next=/admin' });
  });
});
