import { schema } from '../index';
import { createTestDb } from '../testing';
import { describe, expect, it } from 'vitest';

describe('processed_events', () => {
  it('refuses the same event from the same provider twice', async () => {
    const { db, close } = await createTestDb();
    try {
      const row = {
        provider: 'stripe' as const,
        eventId: 'evt_1',
        type: 'checkout.session.completed',
      };
      await db.insert(schema.processedEvents).values(row);
      await expect(db.insert(schema.processedEvents).values(row)).rejects.toMatchObject({
        cause: { code: '23505' },
      });
      // The same id from another provider is a different event.
      await db.insert(schema.processedEvents).values({ ...row, provider: 'demo' });
      expect(await db.select().from(schema.processedEvents)).toHaveLength(2);
    } finally {
      await close();
    }
  });
});
