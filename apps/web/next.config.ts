import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import path from 'node:path';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

/**
 * `output: 'standalone'` and the tracing root beneath it exist for `Dockerfile.web`, which copies
 * `.next/standalone` and needs the workspace's dependencies traced from the repository root rather
 * than from `apps/web`.
 *
 * Vercel must build the same app without either, and this is not a preference. With a tracing root
 * outside `apps/web`, Next writes its trace manifests relative to that root, and Vercel's own
 * `onBuildComplete` step then fails looking for `apps/web/.next/next-server.js.nft.json` - which is
 * exactly how the first deployment died. Vercel traces a monorepo itself, from the project's root
 * directory plus "include files outside the root directory".
 *
 * `VERCEL` is set to `1` in every Vercel build, and it is declared in `turbo.json` so that Turbo's
 * strict environment mode passes it through; without that declaration this check reads `undefined`
 * on Vercel and the build breaks again in a way that looks nothing like its cause.
 */
const onVercel = process.env.VERCEL === '1';

const nextConfig: NextConfig = {
  // `next dev` otherwise writes an unreviewed AGENTS.md/CLAUDE.md into apps/web on every run.
  agentRules: false,
  ...(onVercel
    ? {}
    : {
        output: 'standalone' as const,
        outputFileTracingRoot: path.join(process.cwd(), '../../'),
      }),
  transpilePackages: ['@tabletap/ui', '@tabletap/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withNextIntl(nextConfig);
