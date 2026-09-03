import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { createDb } from '@tabletap/db';
import { loadConfig } from './config';
import { buildApp } from './server';

loadDotenv({
  path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')],
  quiet: true,
});
const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL);
const app = await buildApp({ db, config });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
