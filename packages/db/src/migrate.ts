import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export function resolveMigrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../migrations', import.meta.url));
}

export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: resolveMigrationsDir() });
  } finally {
    await sql.end();
  }
}
