import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECRET: 'y'.repeat(32),
  TABLE_TOKEN_SECRET: 'z'.repeat(32),
  SOCKET_TOKEN_SECRET: 'w'.repeat(32),
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
    expect(loadConfig({ ...valid, PORT: '5000', GUEST_SESSION_TTL_HOURS: '2' })).toMatchObject({
      PORT: 5000,
      GUEST_SESSION_TTL_HOURS: 2,
    });
  });
  it('lists every invalid variable in one readable error', () => {
    expect(() =>
      loadConfig({ ...valid, BETTER_AUTH_SECRET: 'short', WEB_ORIGIN: 'not a url' }),
    ).toThrow(/BETTER_AUTH_SECRET[\s\S]*WEB_ORIGIN/);
  });

  describe('cookieSecure', () => {
    it('defaults to true when NODE_ENV=production', () => {
      expect(loadConfig({ ...valid, NODE_ENV: 'production' }).cookieSecure).toBe(true);
    });
    it('defaults to false when NODE_ENV is not production', () => {
      expect(loadConfig(valid).cookieSecure).toBe(false);
      expect(loadConfig({ ...valid, NODE_ENV: 'test' }).cookieSecure).toBe(false);
    });
    it('honours an explicit COOKIE_SECURE=false under production', () => {
      expect(
        loadConfig({ ...valid, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure,
      ).toBe(false);
    });
    it('honours an explicit COOKIE_SECURE=true under development', () => {
      expect(
        loadConfig({ ...valid, NODE_ENV: 'development', COOKIE_SECURE: 'true' }).cookieSecure,
      ).toBe(true);
    });
  });

  it('defaults demo mode off with an hourly reset interval', () => {
    const c = loadConfig(valid);
    expect(c.demoMode).toBe(false);
    expect(c.DEMO_RESET_INTERVAL_MINUTES).toBe(60);
    expect(c.DEMO_PASSWORD).toBe('tabletap-demo');
  });
  it('enables demo mode from the environment', () => {
    expect(
      loadConfig({ ...valid, DEMO_MODE: 'true', DEMO_RESET_INTERVAL_MINUTES: '0' }),
    ).toMatchObject({ demoMode: true, DEMO_RESET_INTERVAL_MINUTES: 0 });
    expect(() => loadConfig({ ...valid, DEMO_MODE: 'yes' })).toThrow(/DEMO_MODE/);
  });
});
