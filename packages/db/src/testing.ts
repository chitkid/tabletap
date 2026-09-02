import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from './client';
import { resolveMigrationsDir } from './migrate';
import * as schema from './schema/index';

/** In-memory Postgres (PGlite) with all migrations applied. One per test file. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolveMigrationsDir() });
  return { db: db as unknown as Db, close: () => client.close() };
}
