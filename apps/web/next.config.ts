import type { NextConfig } from 'next';
import path from 'node:path';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // `next dev` otherwise writes an unreviewed AGENTS.md/CLAUDE.md into apps/web on every run.
  agentRules: false,
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  transpilePackages: ['@tabletap/ui', '@tabletap/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async redirects() {
    return [{ source: '/', destination: '/login', permanent: false }];
  },
};
export default nextConfig;
