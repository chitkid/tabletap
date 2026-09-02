import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { createDb } from '../client';
import { seed } from '../seed/run';

loadDotenv({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')], quiet: true });

const arg = process.argv.slice(2).find((a) => a === '--if-empty' || a === '--reset');
if (!arg) {
  console.error('usage: seed --if-empty | --reset');
  process.exit(1);
}
const env = process.env;
const url = env.DATABASE_URL;
const tableTokenSecret = env.TABLE_TOKEN_SECRET;
if (!url || !tableTokenSecret) {
  console.error('DATABASE_URL and TABLE_TOKEN_SECRET must be set');
  process.exit(1);
}
const { db, close } = createDb(url, { max: 1 });
try {
  const result = await seed(db, {
    mode: arg === '--reset' ? 'reset' : 'if-empty',
    demoPassword: env.DEMO_PASSWORD ?? 'tabletap-demo',
    tableTokenSecret,
    tableTokenTtlDays: Number(env.TABLE_TOKEN_TTL_DAYS ?? 365),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
  });
  if (result.skipped) console.log('seed: demo data already present, skipped');
  else {
    console.log(`seed: ${JSON.stringify(result.counts)}`);
    console.log('guest URLs:');
    for (const u of result.guestUrls) console.log(`  ${u}`);
  }
} finally {
  await close();
}
