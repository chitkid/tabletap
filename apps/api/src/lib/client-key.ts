import type { FastifyRequest } from 'fastify';

/** `::ffff:203.0.113.9` and `203.0.113.9` are one visitor, and must be one bucket. */
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * One rate-limit bucket per visitor, for the routes no session reaches: the QR claim a visitor
 * makes before it has a cookie, and the two demo routes. The session-keyed routes use `guestKey`
 * or `staffKey`, both of which fall back to this same `ip:` namespace when there is no cookie yet
 * - which for a first-time visitor is the common path, not the edge case.
 *
 * **Can a caller reaching the public API directly pick its own bucket? No.** `request.ip` is
 * `proxy-addr` reading the forwarded chain under `TRUST_PROXY`, which lists the private network in
 * front of the API and nothing else. A caller from the public internet is therefore not a trusted
 * peer, its `x-forwarded-for` is not read at all, and its bucket is the source address of its own
 * connection - which the network sets and the caller cannot choose. A caller that does arrive
 * through the platform's proxy is keyed on the address that proxy appended as the last hop, and
 * everything the caller wrote to the left of it is skipped: the chain is trusted for the one hop
 * we actually control, and no further. That is the whole reason `TRUST_PROXY` is a list of
 * addresses rather than `true` or a hop count - either of those would believe any caller's header.
 *
 * The remaining reliance is on that proxy appending rather than passing through, which is the
 * assumption every `trust proxy` setting behind every reverse proxy makes, and which spec §7 has
 * verified on the live stack. `Fly-Client-IP` was considered and rejected: believing it would
 * still require the peer to be trusted, so it adds no safety, and it would open a second forgery
 * path anywhere the platform does not overwrite it.
 *
 * Two things this does not do. It does not defend the *local* Compose demo, where the API's port
 * is published straight onto the developer's host with no proxy in front of it, so a host-side
 * caller is inside the trust boundary and can still set the header (docs/backlog.md). And it is
 * per process: the in-memory store means the limit is per instance until a shared store exists.
 */
export function clientKey(request: FastifyRequest): string {
  return `ip:${IPV4_MAPPED.exec(request.ip)?.[1] ?? request.ip}`;
}
