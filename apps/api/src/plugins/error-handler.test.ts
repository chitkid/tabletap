import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorEnvelopeSchema } from '@tabletap/shared';
import { AppError } from '../lib/errors';
import { createTestApp } from '../test/helpers';

describe('error handler', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp({ seed: false, ready: false });
    ctx.app.get('/boom', { config: { principal: false } }, async () => {
      throw new Error('secret stack');
    });
    ctx.app.get('/teapot', { config: { principal: false } }, async () => {
      throw new AppError('NOT_FOUND', 404, 'Nothing here');
    });
    ctx.app.post('/validate', { config: { principal: false }, schema: { body: z.object({ n: z.number() }) } }, async () => ({ ok: true }));
    await ctx.app.ready();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('maps AppError to its status and code', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/teapot' });
    expect(res.statusCode).toBe(404);
    expect(ErrorEnvelopeSchema.parse(res.json()).error).toEqual({ code: 'NOT_FOUND', message: 'Nothing here' });
  });

  it('maps validation failures to 400 VALIDATION_FAILED with details', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/validate', payload: { n: 'x' } });
    expect(res.statusCode).toBe(400);
    const body = ErrorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toBeDefined();
  });

  it('hides internals behind 500 INTERNAL', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
    expect(JSON.stringify(res.json())).not.toContain('secret stack');
  });

  it('returns NOT_FOUND envelope for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route GET /nope not found' } });
  });
});
