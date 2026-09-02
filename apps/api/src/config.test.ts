import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECRET: 'y'.repeat(32),
  TABLE_TOKEN_SECRET: 'z'.repeat(32),
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(valid);
    expect(c.PORT).toBe(4000);
    expect(c.NODE_ENV).toBe('development');
    expect(c.TABLE_TOKEN_TTL_DAYS).toBe(365);
    expect(c.GUEST_SESSION_TTL_HOURS).toBe(4);
    expect(c.LOG_LEVEL).toBe('info');
    expect(c.TRUST_PROXY).toBe('loopback,uniquelocal');
  });
  it('coerces numbers', () => {
    expect(loadConfig({ ...valid, PORT: '5000', GUEST_SESSION_TTL_HOURS: '2' })).toMatchObject({ PORT: 5000, GUEST_SESSION_TTL_HOURS: 2 });
  });
  it('lists every invalid variable in one readable error', () => {
    expect(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'short', WEB_ORIGIN: 'not a url' })).toThrow(/BETTER_AUTH_SECRET[\s\S]*WEB_ORIGIN/);
  });
});
