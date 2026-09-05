/**
 * Proof that this container, and not some other caller, observed the visitor's address.
 *
 * The web and the API are deployed to two different platforms (spec section 4.4), so the API's
 * peer for a request that came through the `/api/:path*` rewrite is an ordinary public address on
 * the open internet - indistinguishable from an attacker's. Believing a forwarded address from an
 * untrusted peer would let anyone mint rate-limit buckets; refusing to believe one collapses every
 * visitor onto a single bucket. Neither is a rate limiter. So the address travels with an HMAC
 * over it, keyed by a secret only these two apps hold, and the API honours the address exactly
 * when the HMAC verifies (`apps/api/src/lib/client-key.ts`).
 *
 * **No timestamp and no nonce, deliberately.** Replaying a captured address only puts the replayer
 * in the bucket of the visitor it was captured from, which costs that visitor nothing an attacker
 * could not already do by exhausting its own bucket, and gains the attacker nothing at all. Every
 * extra field is one more thing to get wrong, and a clock skew away from silently verifying
 * nothing.
 *
 * Web Crypto rather than `node:crypto`: middleware is bundled for the edge runtime, which has
 * `crypto.subtle` and no Node built-ins, so a `node:crypto` import here does not resolve.
 */

/** The address the web observed. Meaningless on its own; the API reads it only with the next one. */
export const VISITOR_HEADER = 'x-tt-visitor';
/** Hex HMAC-SHA256 of that address. The API spells both names out again; each side's test pins them. */
export const VISITOR_SIG_HEADER = 'x-tt-visitor-signature';

const utf8 = new TextEncoder();

/** Hex, not base64: it survives a header verbatim and the API's `Buffer.from(_, 'hex')` reads it. */
function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function signVisitor(address: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, utf8.encode(address)));
}
