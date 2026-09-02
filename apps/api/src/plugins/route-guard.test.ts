import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/helpers';
import { requireAction } from './rbac';

describe('route guard invariant', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>> | undefined;
  afterEach(async () => {
    await ctx?.close();
    ctx = undefined;
  });

  // Fastify may run onRoute either inline in app.get() or while draining app.ready(),
  // depending on whether a plugin registration is still pending; treat boot as one step.
  const boot = async (register: (app: FastifyInstance) => void): Promise<void> => {
    ctx = await createTestApp({ seed: false, ready: false });
    register(ctx.app);
    await ctx.app.ready();
  };

  it('refuses to boot when a route declares neither a guard nor public access', async () => {
    await expect(boot((app) => app.get('/unguarded', async () => ({})))).rejects.toThrow(/GET \/unguarded/);
  });

  it('names the ways to fix an unguarded route', async () => {
    await expect(boot((app) => app.get('/unguarded', async () => ({})))).rejects.toThrow(/public: true[\s\S]*requireAction/);
  });

  it('does not accept an arbitrary preHandler as a guard', async () => {
    await expect(boot((app) => app.get('/looks-guarded', { preHandler: async () => {} }, async () => ({})))).rejects.toThrow(/GET \/looks-guarded/);
  });

  it('accepts a route marked public and a route carrying an rbac guard', async () => {
    await boot((app) => {
      app.get('/open', { config: { public: true, principal: false } }, async () => ({ ok: true }));
      app.get('/closed', { preHandler: requireAction('menu.read') }, async () => ({ ok: true }));
      app.get('/closed-array', { preHandler: [requireAction('menu.read')] }, async () => ({ ok: true }));
    });
    expect((await ctx!.app.inject({ method: 'GET', url: '/open' })).statusCode).toBe(200);
    expect((await ctx!.app.inject({ method: 'GET', url: '/closed' })).statusCode).toBe(401);
    expect((await ctx!.app.inject({ method: 'GET', url: '/closed-array' })).statusCode).toBe(401);
  });
});
