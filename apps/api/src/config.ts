import { z } from 'zod';
import type { PaymentProviderName } from '@tabletap/shared';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  COOKIE_SECRET: z.string().min(32),
  TABLE_TOKEN_SECRET: z.string().min(32),
  /** Signs the 60-second socket handshake token (typ tt-socket). Distinct from the table token secret. */
  SOCKET_TOKEN_SECRET: z.string().min(32),
  TABLE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(365),
  GUEST_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(4),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Fastify `trustProxy`: only these peers may set the client ip the rate limiter keys on. */
  TRUST_PROXY: z.string().default('loopback,uniquelocal'),
  /**
   * Overrides the `Secure` flag on the tt_guest and better-auth cookies. Left unset, it
   * follows NODE_ENV so containers running a production build over plain HTTP (the local
   * Docker Compose demo) still get non-secure cookies without forcing NODE_ENV=development
   * (which would also enable the dev-only pino-pretty transport, a devDependency absent
   * from the production image).
   */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Gates GET /api/demo/links and the hourly demo reset scheduler. */
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  /** Minutes between automatic demo data resets; 0 disables the scheduler. */
  DEMO_RESET_INTERVAL_MINUTES: z.coerce.number().int().nonnegative().default(60),
  /** Password for the three seeded staff accounts. */
  DEMO_PASSWORD: z.string().min(8).default('tabletap-demo'),
  /** Both must be set for Stripe to be the provider; with either missing the demo one is used. */
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
});
export type Config = z.infer<typeof EnvSchema> & {
  cookieSecure: boolean;
  demoMode: boolean;
  paymentProvider: PaymentProviderName;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const { COOKIE_SECURE, NODE_ENV, DEMO_MODE } = parsed.data;
  const cookieSecure =
    COOKIE_SECURE === undefined ? NODE_ENV === 'production' : COOKIE_SECURE === 'true';
  const paymentProvider: PaymentProviderName =
    parsed.data.STRIPE_SECRET_KEY && parsed.data.STRIPE_WEBHOOK_SECRET ? 'stripe' : 'demo';
  return { ...parsed.data, cookieSecure, demoMode: DEMO_MODE === 'true', paymentProvider };
}
