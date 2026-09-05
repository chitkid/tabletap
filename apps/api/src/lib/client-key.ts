import { normalizeIP } from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';

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
 * **Can a caller reaching the public API directly pick its own bucket? No - but read why, because
 * it is not the reason it first appears to be.** `request.ip` is `@fastify/proxy-addr`: `alladdrs`
 * walks the socket address and the forwarded chain from the right, truncating at the first entry
 * that is not a trusted peer, and `request.ip` is the last entry left standing.
 *
 * It is tempting to say a direct caller's header is never read at all. On Fly that is false: all
 * public ingress terminates at fly-proxy, whose address is `fdaa::` - inside `fc00::/7`, inside
 * `uniquelocal`, and therefore trusted. The header *is* read. The property rests on where the
 * walk stops instead: fly-proxy appends the caller's real address as the last hop, that address is
 * public and so is not trusted, the walk stops there, and everything the caller wrote to its left
 * is discarded. Padding the chain with private addresses does not help - they sit to the left of
 * the appended one. So the bucket is the address the platform observed, never the one the caller
 * typed. That single leg is what this stands on, which is why spec §7 verifies it on the live
 * stack: it holds exactly as long as the platform's proxy appends rather than relays. (Where a
 * peer genuinely is untrusted - an API exposed with no proxy in front of it - the chain is
 * discarded entirely and the socket address is the key. True, but not this deployment's shape.)
 *
 * This is why `TRUST_PROXY` has to be a list of addresses. `true` trusts every peer, so any
 * caller's header would be believed. A number is worse than it looks: Fastify 5.12.1's
 * `getTrustProxyFn` returns `() => false` for one, failing closed - it trusts nobody, the walk
 * stops at the socket, and every request through the rewrite is keyed on the web container again,
 * which is the defect this task closed. Both are wrong, in opposite directions.
 *
 * `Fly-Client-IP` was considered and rejected: believing it would still require the peer to be
 * trusted, so it adds no safety, and it would open a second forgery path anywhere the platform
 * does not overwrite it.
 *
 * Two things this does not do. It does not defend the *local* Compose demo, where the API's port
 * is published straight onto the developer's host with no proxy in front of it, so a host-side
 * caller is a trusted peer whose header is read and believed (docs/backlog.md). And it is per
 * process: the in-memory store means the limit is per instance until a shared store exists.
 */
export function clientKey(request: FastifyRequest): string {
  return `ip:${normalizeIP(request.ip)}`;
}
