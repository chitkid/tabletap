import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import pkg from '../../package.json' with { type: 'json' };

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', { config: { principal: false } }, async (_request, reply) => {
    let db: 'ok' | 'fail' = 'ok';
    try {
      await app.db.execute(sql`select 1`);
    } catch {
      db = 'fail';
    }
    const body = { status: db === 'ok' ? 'ok' : 'degraded', version: pkg.version, uptime: process.uptime(), checks: { db } };
    return reply.status(db === 'ok' ? 200 : 503).send(body);
  });
}
