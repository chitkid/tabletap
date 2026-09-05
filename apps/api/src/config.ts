import { z } from 'zod';
import type { PaymentProviderName } from '@tabletap/shared';

/**
 * An empty string means "not set" here, not "set to an empty string": a deployment platform
 * and a `.env` file both hand over `KEY=` as `''` rather than omitting the variable, and plain
 * `.optional()` only short-circuits on `undefined`.
 */
const optionalNonEmpty = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
/** The same blank-is-unset rule for a variable that falls back to a default instead. */
const blankAsUnset = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

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
   * Shared with the web, which signs the visitor address it forwards over the `/api/*` rewrite
   * (`apps/web/lib/forward-signature.ts`). The two apps are deployed to different platforms
   * (spec section 4.4), so the web's call arrives from a public address this API has no reason to
   * trust; the signature is what replaces that trust.
   *
   * Optional, and unset means **verify nothing** - `lib/client-key.ts` then ignores both headers
   * and keys on the address of the connection it actually received, exactly as it did before this
   * existed. It must never come to mean "accept anything": a deployment that forgets the secret
   * should degrade to one shared bucket, not to a bucket every caller can choose. The local
   * Compose stack sets it anyway, which is what closes the spoofability a published API port
   * would otherwise leave open there.
   */
  FORWARD_SECRET: optionalNonEmpty,
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
  /**
   * Refuses new menu photo uploads while leaving every other admin action alone (spec §2): a
   * visitor to the public demo may do anything an admin can except put an object in storage the
   * hourly reset does not undo. Defaults to on so the local Compose demo keeps working exactly as
   * M5 built and verified it, and `.env.example` stays a working local configuration; the public
   * deployment sets it to `false` (see `docs/deploy.md`).
   *
   * The web reads `NEXT_PUBLIC_UPLOADS_ENABLED` to decide what to render, but that is only an
   * explanation - this value is the control, and it is enforced here regardless of what the web
   * was built with. If the two ever disagree, a visitor sees a button that fails politely rather
   * than a hole. `z.coerce.boolean()` would not work here: `Boolean('false')` is `true`, so a
   * coerced flag could never be turned off from an env file.
   */
  DEMO_UPLOADS_ENABLED: z.enum(['true', 'false']).default('true'),
  /** Minutes between automatic demo data resets; 0 disables the scheduler. */
  DEMO_RESET_INTERVAL_MINUTES: z.coerce.number().int().nonnegative().default(60),
  /** Password for the three seeded staff accounts. */
  DEMO_PASSWORD: z.string().min(8).default('tabletap-demo'),
  /** Both must be set for Stripe to be the provider; with either missing the demo one is used. */
  STRIPE_SECRET_KEY: optionalNonEmpty,
  STRIPE_WEBHOOK_SECRET: optionalNonEmpty,
  /**
   * S3-compatible object storage for menu photographs: MinIO locally, AWS S3 or Cloudflare R2 in
   * production. All optional - without the four required ones the API simply serves no uploads.
   */
  S3_ENDPOINT: optionalNonEmpty,
  S3_REGION: blankAsUnset(z.string().min(1).default('us-east-1')),
  S3_BUCKET: optionalNonEmpty,
  S3_ACCESS_KEY_ID: optionalNonEmpty,
  S3_SECRET_ACCESS_KEY: optionalNonEmpty,
  /**
   * The origin an upload is *signed* for. SigV4 covers the Host header, so a URL signed against an
   * endpoint only the API can reach (`http://minio:9000` under Compose) is unusable in a browser.
   * Unset, the endpoint signs its own uploads, which is right whenever the two are the same host.
   * Deliberately not derived from S3_PUBLIC_URL: that may be a CDN that accepts no writes.
   */
  S3_PRESIGN_ENDPOINT: optionalNonEmpty,
  /** Browser-facing base URL of the bucket. Unset, the endpoint and the bucket stand in for it. */
  S3_PUBLIC_URL: optionalNonEmpty,
  /** MinIO and R2 want path-style addressing; AWS S3 wants the bucket in the hostname. */
  S3_FORCE_PATH_STYLE: blankAsUnset(z.enum(['true', 'false']).default('true')),
});
export type Config = z.infer<typeof EnvSchema> & {
  cookieSecure: boolean;
  demoMode: boolean;
  demoUploadsEnabled: boolean;
  paymentProvider: PaymentProviderName;
  storageConfigured: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const { COOKIE_SECURE, NODE_ENV, DEMO_MODE, DEMO_UPLOADS_ENABLED } = parsed.data;
  const cookieSecure =
    COOKIE_SECURE === undefined ? NODE_ENV === 'production' : COOKIE_SECURE === 'true';
  const paymentProvider: PaymentProviderName =
    parsed.data.STRIPE_SECRET_KEY && parsed.data.STRIPE_WEBHOOK_SECRET ? 'stripe' : 'demo';
  const storageConfigured = Boolean(
    parsed.data.S3_ENDPOINT &&
    parsed.data.S3_BUCKET &&
    parsed.data.S3_ACCESS_KEY_ID &&
    parsed.data.S3_SECRET_ACCESS_KEY,
  );
  return {
    ...parsed.data,
    cookieSecure,
    demoMode: DEMO_MODE === 'true',
    demoUploadsEnabled: DEMO_UPLOADS_ENABLED === 'true',
    paymentProvider,
    storageConfigured,
  };
}
