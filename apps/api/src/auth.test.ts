import { describe, expect, it } from 'vitest';
import { createTestDb } from '@tabletap/db/testing';
import { createAuth } from './auth';
import { TEST_CONFIG } from './test/helpers';

/**
 * better-auth ships its own rate limiter with a hidden rule for `/sign-in/email` that is far
 * stricter than the one this project documents, and it wins because it runs inside the handler
 * the Fastify limit forwards to. These tests pin the two numbers together: whatever
 * `routes/auth` allows per minute is what a caller actually gets.
 */
describe('auth rate limiting', () => {
  it('allows the documented ten sign-in attempts a minute, not better-auth’s default three', async () => {
    const { db, close } = await createTestDb();
    try {
      const auth = createAuth({ db, config: { ...TEST_CONFIG, NODE_ENV: 'production' } });
      const { rateLimit } = auth.options;
      expect(rateLimit?.customRules?.['/sign-in/email']).toEqual({ window: 60, max: 10 });
      expect(rateLimit?.window).toBe(60);
      expect(rateLimit?.max).toBe(100);
    } finally {
      await close();
    }
  });

  it('leaves the limiter off outside production so a test suite is not the attacker', async () => {
    const { db, close } = await createTestDb();
    try {
      const dev = createAuth({ db, config: { ...TEST_CONFIG, NODE_ENV: 'development' } });
      const prod = createAuth({ db, config: { ...TEST_CONFIG, NODE_ENV: 'production' } });
      expect(dev.options.rateLimit?.enabled).toBe(false);
      expect(prod.options.rateLimit?.enabled).toBe(true);
    } finally {
      await close();
    }
  });
});
