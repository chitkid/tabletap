import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string, opts: { max?: number } = {}): { db: Db; close: () => Promise<void> } {
  const sql = postgres(url, { max: opts.max ?? 10 });
  const db = drizzle(sql, { schema });
  return { db: db as unknown as Db, close: () => sql.end() };
}
