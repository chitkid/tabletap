import { describe, expect, it } from 'vitest';
import { TableTokenVerifyError, signTableToken, verifyTableToken } from './table-token';

const secret = 'test-table-token-secret-0123456789abcdef';
const input = {
  tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
  restaurantId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f61',
  tableNumber: 7,
};
const now = new Date('2026-09-02T10:00:00Z');

describe('table token', () => {
  it('round-trips claims', async () => {
    const token = await signTableToken(input, { secret, ttlSeconds: 3600, now });
    const claims = await verifyTableToken(token, { secret, now });
    expect(claims).toEqual({ ...input, issuedAt: 1788343200, expiresAt: 1788346800 });
  });
  it('rejects a tampered token as TOKEN_INVALID', async () => {
    const token = await signTableToken(input, { secret, ttlSeconds: 3600, now });
    const [h, p, s] = token.split('.');
    const forged = `${h}.${p}.${s?.slice(0, -2)}AA`;
    await expect(verifyTableToken(forged, { secret, now })).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
  it('rejects a token signed with another secret as TOKEN_INVALID', async () => {
    const token = await signTableToken(input, {
      secret: 'another-secret-another-secret-12345678',
      ttlSeconds: 3600,
      now,
    });
    await expect(verifyTableToken(token, { secret, now })).rejects.toBeInstanceOf(
      TableTokenVerifyError,
    );
    await expect(verifyTableToken(token, { secret, now })).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
  it('rejects an expired token as TOKEN_EXPIRED', async () => {
    const token = await signTableToken(input, { secret, ttlSeconds: 60, now });
    const later = new Date(now.getTime() + 61_000);
    await expect(verifyTableToken(token, { secret, now: later })).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
    });
  });
  it('rejects garbage as TOKEN_INVALID', async () => {
    await expect(verifyTableToken('not-a-jwt', { secret, now })).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });
});
