import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { schema, type Db } from '@tabletap/db';
import { betterAuth } from 'better-auth';
import type { Config } from './config';

export function createAuth(opts: { db: Db; config: Config }) {
  const { config } = opts;
  return betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: [config.WEB_ORIGIN],
    database: drizzleAdapter(opts.db, { provider: 'pg', usePlural: true, schema }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: {
      additionalFields: {
        role: { type: 'string', required: true, defaultValue: 'waiter', input: false },
      },
    },
    advanced: { useSecureCookies: config.cookieSecure },
    /**
     * better-auth runs its own limiter inside the handler `routes/auth` forwards to, and its
     * default rule for `/sign-in/email` is three attempts per ten seconds — stricter than the
     * ten a minute this project documents and applies at the route, and invisible from there.
     * Two budgets meant the smaller, undocumented one decided: three sign-ins in a row (a shift
     * change, or a test suite) locked the next caller out. The numbers are stated here so the
     * documented one is the real one. Off outside production, as better-auth defaults it.
     */
    rateLimit: {
      enabled: config.NODE_ENV === 'production',
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 10 } },
    },
  });
}
export type Auth = ReturnType<typeof createAuth>;
