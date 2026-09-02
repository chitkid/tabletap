import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  COOKIE_SECRET: z.string().min(32),
  TABLE_TOKEN_SECRET: z.string().min(32),
  TABLE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(365),
  GUEST_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(4),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(`Invalid environment:\n${lines.join('\n')}`);
}
