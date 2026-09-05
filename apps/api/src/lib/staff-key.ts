import type { FastifyRequest } from 'fastify';

/**
 * One rate-limit bucket per signed-in browser, for the staff routes that declare a limit.
 *
 * The limiter runs at `onRequest`, before any principal has been resolved, so there is no user id
 * to key on yet - and waiting for one would mean not counting the callers a guard turns away,
 * which is most of the abusive ones. The cookie jar is opaque here and already parsed; keying on
 * it puts each session in its own bucket rather than sharing one per address, so a second admin
 * behind the same NAT is not limited by the first. A caller with no cookie falls back to its ip.
 *
 * The guest half of this lives in `guest-sessions.ts` as `guestKey`.
 */
export function staffKey(request: FastifyRequest): string {
  return request.headers.cookie ? `session:${String(request.headers.cookie)}` : `ip:${request.ip}`;
}
