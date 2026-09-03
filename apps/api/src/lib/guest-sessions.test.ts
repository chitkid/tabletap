import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/helpers';
import {
  createGuestSession,
  expireGuestSession,
  findActiveGuestSession,
  touchGuestSession,
} from './guest-sessions';

describe('guest sessions', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let tableId: string;
  const now = new Date('2026-09-02T10:00:00Z');
  beforeAll(async () => {
    ctx = await createTestApp();
    const [t] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, 3));
    tableId = t!.id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('creates a session that expires ttlHours later', async () => {
    const s = await createGuestSession(ctx.db, { tableId, ttlHours: 4, now });
    expect(s.expiresAt.toISOString()).toBe('2026-09-02T14:00:00.000Z');
    const found = await findActiveGuestSession(ctx.db, s.id, now);
    expect(found).toMatchObject({ id: s.id, tableId, tableNumber: 3 });
  });
  it('does not find an expired session', async () => {
    const s = await createGuestSession(ctx.db, { tableId, ttlHours: 1, now });
    expect(await findActiveGuestSession(ctx.db, s.id, new Date('2026-09-02T11:00:01Z'))).toBeNull();
  });
  it('touch extends expiry and updates lastSeenAt', async () => {
    const s = await createGuestSession(ctx.db, { tableId, ttlHours: 4, now });
    const later = new Date('2026-09-02T12:00:00Z');
    const expiresAt = await touchGuestSession(ctx.db, s.id, { ttlHours: 4, now: later });
    expect(expiresAt.toISOString()).toBe('2026-09-02T16:00:00.000Z');
    expect((await findActiveGuestSession(ctx.db, s.id, later))?.lastSeenAt.toISOString()).toBe(
      '2026-09-02T12:00:00.000Z',
    );
  });
  it('returns null for an unknown id', async () => {
    expect(
      await findActiveGuestSession(ctx.db, '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', now),
    ).toBeNull();
  });
  it('rejects a 36-char id that is not uuid-shaped before it reaches postgres', async () => {
    expect(await findActiveGuestSession(ctx.db, '-'.repeat(36), now)).toBeNull();
    expect(
      await findActiveGuestSession(ctx.db, '018f0d388d5d7c6e8f6a1b2c3d4e5f60aaaa', now),
    ).toBeNull();
  });
  it('does not find a session whose table has been deactivated', async () => {
    const [t] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, 11));
    const s = await createGuestSession(ctx.db, { tableId: t!.id, ttlHours: 4, now });
    expect(await findActiveGuestSession(ctx.db, s.id, now)).not.toBeNull();
    await ctx.db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.id, t!.id));
    expect(await findActiveGuestSession(ctx.db, s.id, now)).toBeNull();
  });
  it('expire marks an unexpired session as done right now', async () => {
    const s = await createGuestSession(ctx.db, { tableId, ttlHours: 4, now });
    await expireGuestSession(ctx.db, s.id, now);
    expect(await findActiveGuestSession(ctx.db, s.id, now)).toBeNull();
  });
});
