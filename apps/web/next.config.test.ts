// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The first deployment of this app to Vercel died on
 * `ENOENT: .../apps/web/.next/next-server.js.nft.json`. The cause was `output: 'standalone'` with a
 * tracing root above `apps/web`: Next then writes its trace manifests relative to that root, and
 * Vercel's `onBuildComplete` looks for them under the app. Both settings are needed by
 * `Dockerfile.web` and neither may reach Vercel, so the config chooses between them - and this is
 * the test that keeps the choice from being quietly undone.
 */
const loadConfig = async () => {
  vi.resetModules();
  return (await import('./next.config')).default;
};

describe('next.config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Not inherited from the runner: a developer with VERCEL exported would otherwise see the
    // wrong branch, the same way middleware.test.ts had to pin FORWARD_SECRET.
    vi.stubEnv('VERCEL', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('builds a standalone bundle everywhere except Vercel, for Dockerfile.web', async () => {
    const config = await loadConfig();
    expect(config.output).toBe('standalone');
    expect(config.outputFileTracingRoot).toBeTruthy();
  });

  it('sets neither output nor tracing root on Vercel, whose builder traces the monorepo itself', async () => {
    vi.stubEnv('VERCEL', '1');
    const config = await loadConfig();
    expect(config.output).toBeUndefined();
    expect(config.outputFileTracingRoot).toBeUndefined();
  });

  it('compiles the rewrite against API_URL, which is why turbo.json declares it', async () => {
    vi.stubEnv('API_URL', 'https://api.example.test');
    const config = await loadConfig();
    const rewrites = await config.rewrites?.();
    expect(rewrites).toEqual([
      { source: '/api/:path*', destination: 'https://api.example.test/api/:path*' },
    ]);
  });
});
