import { NextResponse, type NextRequest } from 'next/server';
import { signVisitor, VISITOR_HEADER, VISITOR_SIG_HEADER } from './lib/forward-signature';

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
 *
 * Since the web and the API were split across two platforms (spec section 4.4) the address alone
 * no longer proves anything: the API's peer is an ordinary public address, so `x-forwarded-for`
 * from it is worth exactly what any stranger's would be. `FORWARD_SECRET` fixes that - the address
 * goes out signed, and the API honours it only when the signature verifies.
 *
 * `FORWARD_SECRET` is read at **runtime**, not inlined at build. Measured, not assumed (M6 task 9,
 * the method this milestone's link-preview task used): the web image was built with the variable
 * set to one value and run with it set to another, and the middleware saw the runtime value; built
 * with it set and run with it unset, the middleware saw nothing; and the built edge bundle still
 * contains the literal `process.env.FORWARD_SECRET`, unsubstituted. So it is an ordinary
 * environment variable on the host - **not** a build argument, unlike every `NEXT_PUBLIC_*`.
 *
 * With no secret the two headers are simply not sent, and the demo degrades to the private-network
 * argument the local Compose stack still stands on: a shared bucket at worst, never a hole. An
 * inbound forgery needs no stripping here, because the API cannot verify one either - with no
 * secret it ignores both headers rather than believing them.
 */
export async function middleware(request: NextRequest) {
  const visitor = nearestHop(request.headers.get('x-forwarded-for'));
  if (!visitor) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-for', visitor);
  const secret = process.env.FORWARD_SECRET;
  if (secret) {
    headers.set(VISITOR_HEADER, visitor);
    headers.set(VISITOR_SIG_HEADER, await signVisitor(visitor, secret));
  }
  return NextResponse.next({ request: { headers } });
}

/** Only the rewrite needs this; every other path is served by this container itself. */
export const config = { matcher: '/api/:path*' };
