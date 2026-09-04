import { describe, expect, it } from 'vitest';
import {
  SocketTokenVerifyError,
  signSocketToken,
  signTableToken,
  verifySocketToken,
} from './index';

const SECRET = 'test-socket-token-secret-0123456789abcdef';
const U1 = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60';
const staff = { kind: 'staff', userId: U1, role: 'kitchen', restaurantId: U1 } as const;
const guest = {
  kind: 'guest',
  guestSessionId: U1,
  tableId: U1,
  tableNumber: 7,
  restaurantId: U1,
} as const;

describe('socket token', () => {
  it('round-trips a staff and a guest principal', async () => {
    expect(
      await verifySocketToken(await signSocketToken(staff, { secret: SECRET, ttlSeconds: 60 }), {
        secret: SECRET,
      }),
    ).toEqual(staff);
    expect(
      await verifySocketToken(await signSocketToken(guest, { secret: SECRET, ttlSeconds: 60 }), {
        secret: SECRET,
      }),
    ).toEqual(guest);
  });
  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const token = await signSocketToken(staff, {
      secret: SECRET,
      ttlSeconds: 60,
      now: new Date('2026-09-03T12:00:00Z'),
    });
    await expect(
      verifySocketToken(token, { secret: SECRET, now: new Date('2026-09-03T12:02:00Z') }),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });
  it('rejects the wrong secret, a table token and a bad role with TOKEN_INVALID', async () => {
    const token = await signSocketToken(staff, { secret: SECRET, ttlSeconds: 60 });
    await expect(
      verifySocketToken(token, { secret: 'another-secret-that-is-long-enough-000' }),
    ).rejects.toBeInstanceOf(SocketTokenVerifyError);
    const table = await signTableToken(
      { tableId: U1, restaurantId: U1, tableNumber: 7, qrVersion: 1 },
      { secret: SECRET, ttlSeconds: 60 },
    );
    await expect(verifySocketToken(table, { secret: SECRET })).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
});
