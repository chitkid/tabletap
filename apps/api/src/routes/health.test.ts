import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@tabletap/shared';
import { createTestDb } from '@tabletap/db/testing';
import { createTestApp, TEST_CONFIG } from '../test/helpers';
import { buildApp } from '../server';

describe('GET /health', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp({ seed: false });
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('reports ok with a db check and echoes the request id', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-123' } });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body.status).toBe('ok');
    expect(body.checks.db).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.headers['x-request-id']).toBe('req-123');
  });

  it('reports degraded with 503 when the database is gone', async () => {
    const { db, close } = await createTestDb();
    await close();
    const app = await buildApp({ db, config: TEST_CONFIG, logger: false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', checks: { db: 'fail' } });
    await app.close();
  });
});
