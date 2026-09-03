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
  });
}
export type Auth = ReturnType<typeof createAuth>;
