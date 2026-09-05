import { NextResponse, type NextRequest } from 'next/server';

/**
 * The address of the caller as the nearest hop reported it. Everything to the left of the last
 * entry is whatever that caller chose to send; only the last entry was written by the hop in
 * front of this container - the platform's proxy in the deployment, and Next itself from the
 * socket when nothing else set the header (`base-server.ts`: `x-forwarded-for ??= remoteAddress`).
 * Forwarding that one entry rather than the whole chain is what stops a caller padding the chain
 * with addresses the API would otherwise skip past.
 */
export function nearestHop(forwardedFor: string | null): string | null {
  const hops = (forwardedFor ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  return hops.at(-1) ?? null;
}

/**
 * Carries the visitor's address across the `/api/:path*` rewrite in `next.config.ts`.
 *
 * Measured, not assumed (M6 task 6): a browser sends no `x-forwarded-for`, Next adds one to the
 * incoming request from the socket but does not pass it to the rewrite's destination, and the API
 * therefore saw this container's address for every visitor. `@fastify/rate-limit` keys on that
 * address, so one person exploring the demo exhausted the QR-claim limit for everyone else.
 * `rewrites()` cannot add a header; this can. It runs on every `/api` request, so it carries the
 * one header it exists for and nothing else.
 */
export function middleware(request: NextRequest) {
  const visitor = nearestHop(request.headers.get('x-forwarded-for'));
  if (!visitor) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-for', visitor);
  return NextResponse.next({ request: { headers } });
}

/** Only the rewrite needs this; every other path is served by this container itself. */
export const config = { matcher: '/api/:path*' };
