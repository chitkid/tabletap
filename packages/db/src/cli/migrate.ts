import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { runMigrations } from '../migrate';

loadDotenv({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
await runMigrations(url);
console.log('migrations applied');
