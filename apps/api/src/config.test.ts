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

  describe('demoUploadsEnabled', () => {
    it('defaults to enabled when unset', () => {
      expect(loadConfig(valid).demoUploadsEnabled).toBe(true);
    });
    it('derives true from DEMO_UPLOADS_ENABLED=true', () => {
      expect(loadConfig({ ...valid, DEMO_UPLOADS_ENABLED: 'true' })).toMatchObject({
        demoUploadsEnabled: true,
      });
    });
    // The one assertion that matters: under z.coerce.boolean(), Boolean('false') is true, so this
    // is exactly the case a reverted schema would get backwards and still ship looking green.
    it('derives false from DEMO_UPLOADS_ENABLED=false', () => {
      expect(loadConfig({ ...valid, DEMO_UPLOADS_ENABLED: 'false' })).toMatchObject({
        demoUploadsEnabled: false,
      });
    });
    it('rejects anything but true or false rather than defaulting', () => {
      expect(() => loadConfig({ ...valid, DEMO_UPLOADS_ENABLED: 'yes' })).toThrow(
        /DEMO_UPLOADS_ENABLED/,
      );
    });
  });

  describe('FORWARD_SECRET', () => {
    // Optional on purpose: `lib/client-key.ts` reads "unset" as "verify nothing, key on the
    // connection address". A blank value has to reach it as unset rather than as an empty secret,
    // or a platform that hands over `FORWARD_SECRET=` would have the API verifying signatures
    // against the empty string - which the web, seeing the same blank value, never sends.
    it('is unset when it is absent', () => {
      expect(loadConfig(valid).FORWARD_SECRET).toBeUndefined();
    });
    it('is unset when it is blank, as a deployment platform or .env hands it over', () => {
      expect(loadConfig({ ...valid, FORWARD_SECRET: '' }).FORWARD_SECRET).toBeUndefined();
    });
    it('is the value when it is set', () => {
      expect(loadConfig({ ...valid, FORWARD_SECRET: 's'.repeat(32) }).FORWARD_SECRET).toBe(
        's'.repeat(32),
      );
    });
  });

  describe('paymentProvider', () => {
    it('derives demo when both Stripe keys are unset', () => {
      expect(loadConfig(valid).paymentProvider).toBe('demo');
    });
    it('derives demo when both Stripe keys are blank, as a deployment platform or .env hands them over', () => {
      expect(
        loadConfig({ ...valid, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' }).paymentProvider,
      ).toBe('demo');
    });
    it('derives demo when only one Stripe key is set', () => {
      expect(loadConfig({ ...valid, STRIPE_SECRET_KEY: 'sk_test_1' }).paymentProvider).toBe('demo');
      expect(loadConfig({ ...valid, STRIPE_WEBHOOK_SECRET: 'whsec_test_1' }).paymentProvider).toBe(
        'demo',
      );
    });
    it('derives stripe when both Stripe keys are set', () => {
      expect(
        loadConfig({
          ...valid,
          STRIPE_SECRET_KEY: 'sk_test_1',
          STRIPE_WEBHOOK_SECRET: 'whsec_test_1',
        }).paymentProvider,
      ).toBe('stripe');
    });
  });

  describe('object storage', () => {
    const storage = {
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'tabletap',
      S3_ACCESS_KEY_ID: 'tabletap',
      S3_SECRET_ACCESS_KEY: 'tabletap-secret',
    };
    it('defaults the region and path-style addressing', () => {
      const c = loadConfig(valid);
      expect(c.S3_REGION).toBe('us-east-1');
      expect(c.S3_FORCE_PATH_STYLE).toBe('true');
      expect(c.S3_PUBLIC_URL).toBeUndefined();
    });
    it('leaves storage unconfigured when nothing is set', () => {
      expect(loadConfig(valid).storageConfigured).toBe(false);
    });
    it('leaves storage unconfigured when the variables are blank, as a .env hands them over', () => {
      const blank = {
        ...valid,
        S3_ENDPOINT: '',
        S3_REGION: '',
        S3_BUCKET: '',
        S3_ACCESS_KEY_ID: '',
        S3_SECRET_ACCESS_KEY: '',
        S3_PUBLIC_URL: '',
        S3_FORCE_PATH_STYLE: '',
      };
      const c = loadConfig(blank);
      expect(c.storageConfigured).toBe(false);
      expect(c.S3_REGION).toBe('us-east-1');
      expect(c.S3_FORCE_PATH_STYLE).toBe('true');
      expect(c.S3_PUBLIC_URL).toBeUndefined();
    });
    it('needs the endpoint, the bucket and both credentials before it counts as configured', () => {
      expect(loadConfig({ ...valid, ...storage }).storageConfigured).toBe(true);
      for (const missing of Object.keys(storage)) {
        expect(loadConfig({ ...valid, ...storage, [missing]: '' }).storageConfigured).toBe(false);
      }
    });
    it('leaves the presign endpoint unset unless it is named, blank included', () => {
      expect(loadConfig(valid).S3_PRESIGN_ENDPOINT).toBeUndefined();
      expect(loadConfig({ ...valid, S3_PRESIGN_ENDPOINT: '' }).S3_PRESIGN_ENDPOINT).toBeUndefined();
      expect(
        loadConfig({ ...valid, S3_PRESIGN_ENDPOINT: 'http://localhost:9000' }).S3_PRESIGN_ENDPOINT,
      ).toBe('http://localhost:9000');
    });
    it('does not need the presign endpoint to count storage as configured', () => {
      expect(loadConfig({ ...valid, ...storage }).storageConfigured).toBe(true);
    });
    it('rejects an S3_FORCE_PATH_STYLE that is neither true nor false', () => {
      expect(() => loadConfig({ ...valid, S3_FORCE_PATH_STYLE: 'yes' })).toThrow(
        /S3_FORCE_PATH_STYLE/,
      );
    });
  });
});
