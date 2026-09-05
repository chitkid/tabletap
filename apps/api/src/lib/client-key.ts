import { normalizeIP } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** The address the web observed. Ignored unless the next header proves the web wrote it. */
export const VISITOR_HEADER = 'x-tt-visitor';
/** Hex HMAC-SHA256 of that address, keyed by FORWARD_SECRET. */
export const VISITOR_SIG_HEADER = 'x-tt-visitor-signature';

/** SHA-256 is 32 bytes, hex-encoded. Checked before decoding: see `signedVisitor`. */
const SIGNATURE_LENGTH = 64;

/**
 * The address the web signed, or null - which covers a forgery, a replay onto another address, a
 * missing half of the pair, and a signature that is not a signature at all.
 *
 * Two guards stand in front of `timingSafeEqual`, and both are load-bearing: it throws outright on
 * a length mismatch, and `Buffer.from(_, 'hex')` silently drops anything that is not a hex pair
 * rather than rejecting it, so an unchecked garbage header would become a 500 rather than a
 * fallback. A duplicated header arrives as an array and is refused by the same `typeof` check.
 */
function signedVisitor(request: FastifyRequest, secret: string): string | null {
  const claimed = request.headers[VISITOR_HEADER];
  const offered = request.headers[VISITOR_SIG_HEADER];
  if (typeof claimed !== 'string' || typeof offered !== 'string') return null;
  if (offered.length !== SIGNATURE_LENGTH) return null;
  const given = Buffer.from(offered, 'hex');
  const expected = createHmac('sha256', secret).update(claimed).digest();
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? claimed : null;
}

/**
 * One rate-limit bucket per visitor, for the routes no session reaches: the QR claim a visitor
 * makes before it has a cookie, and the two demo routes. The session-keyed routes use `guestKey`
 * or `staffKey`, both of which fall back to this same `ip:` namespace when there is no cookie yet
 * - which for a first-time visitor is the common path, not the edge case.
 *
 * The address is normalised by `@fastify/rate-limit`'s own `normalizeIP`, the exact function its
 * default key generator uses: it lowercases, unwraps `::ffff:` forms, and collapses IPv6 to its
 * /64 start address. That last one is not cosmetic. A home or mobile IPv6 line is delegated a
 * whole prefix, so picking a fresh address inside it costs a visitor nothing, and keying on the
 * full address would let one person mint buckets without limit - the very thing this file exists
 * to stop. A custom key generator is called with the request alone (`applyRateLimit` only passes
 * `ipv6Subnet` to the default one), so this takes `normalizeIP`'s own default of /64; setting
 * `ipv6Subnet` in the plugin options would not reach here, and would have to be passed by hand.
 *
 * **Where the address comes from, and why a caller cannot choose it.** The web and the API are
 * deployed to two different platforms (spec section 4.4), so a request that came through the
 * `/api/*` rewrite reaches this process from an ordinary public address, indistinguishable from
 * any stranger's. An earlier design walked the forwarded chain back to the visitor and rested on
 * every hop sitting inside a private range `TRUST_PROXY` could name; across providers there is no
 * such hop left, and believing `x-forwarded-for` from an untrusted peer would let anyone forge an
 * address and mint buckets without limit.
 *
 * So the address arrives signed. The web holds the same `FORWARD_SECRET` and sends the visitor's
 * address with an HMAC over it (`apps/web/lib/forward-signature.ts`); this honours the address
 * exactly when that HMAC verifies, and otherwise keys on the connection it actually received. A
 * forger has the address, the header names and the algorithm, and still cannot produce the
 * signature. That property depends on no platform's proxy behaviour at all, which is what makes it
 * stronger than what it replaces rather than merely different - it survives this move and the next
 * one, and with the secret set it closes the local Compose hole where the API's published port let
 * a host-side caller write its own `x-forwarded-for` and be believed.
 *
 * **Unset means verify nothing, never accept anything.** With no secret both headers are ignored
 * outright - not waved through - so a deployment that forgets to set it degrades to the fallback
 * below, which is a worse demo and not a hole.
 *
 * **The fallback, which is still what an unsigned request is keyed on.** `request.ip` is
 * `@fastify/proxy-addr`: it walks the socket address and the forwarded chain from the right,
 * truncating at the first entry that is not a trusted peer, and `request.ip` is the last entry left
 * standing. Where the peer is untrusted - a public caller reaching this API directly - the whole
 * chain is discarded and the socket address is the key. Where the peer is a proxy inside
 * `TRUST_PROXY`, the property instead rests on that proxy *appending* the caller's real address as
 * the last hop, so everything the caller wrote to its left is discarded; padding the chain with
 * private addresses does not help, because they sit to the left of the appended one.
 *
 * This is why `TRUST_PROXY` has to be a list of addresses. `true` trusts every peer, so any
 * caller's header would be believed. A number is worse than it looks: Fastify 5.12.1's
 * `getTrustProxyFn` returns `() => false` for one, failing closed - it trusts nobody, the walk
 * stops at the socket, and every request through the rewrite is keyed on the web container again,
 * which is the defect an earlier task closed. Both are wrong, in opposite directions.
 *
 * A platform's own client-address header (`Fly-Client-IP` and its equivalents) was considered and
 * rejected: believing it would still require the peer to be trusted, so it adds no safety, and it
 * would open a second forgery path anywhere the platform does not overwrite it.
 *
 * One thing this still does not do: it is per process. The in-memory store means the limit is per
 * instance until a shared store exists (docs/backlog.md).
 */
export function clientKey(request: FastifyRequest): string {
  const secret = request.server.config.FORWARD_SECRET;
  const visitor = secret === undefined ? null : signedVisitor(request, secret);
  return `ip:${normalizeIP(visitor ?? request.ip)}`;
}
