# ADR 0004: The API sits behind a Next.js rewrite; sockets connect directly

Date: 2026-09-03
Status: accepted. The container host named in Context ("Railway or Fly") is superseded in part by M6 section 4.1 — the API runs on **Render** and the web on Vercel (M6, 2026-09-05, `docs/deploy.md`). The decision below is unchanged: it never depended on which container host, only on the origins being split.

## Context

The two apps deploy to different places: the web app to Vercel, the API to a container host such as Railway or Fly. That splits the origins, and session cookies do not survive a split origin gracefully. `SameSite=Lax` cookies are not sent on cross-site requests; `SameSite=None` requires `Secure`, invites third-party-cookie blocking, and turns every browser privacy default into a support question.

The other half of the problem is the opposite shape: WebSockets. Vercel's rewrites do not proxy them, so the kitchen display (M3) cannot reach the API the same way the REST calls do.

## Decision

**REST goes through the web origin.** The browser only ever calls `/api/*` on its own origin. `apps/web/next.config.ts` rewrites `/api/:path*` to `${API_URL}/api/:path*`, and `Set-Cookie` passes back through the proxy unchanged. Auth cookies are therefore first-party in every browser, with no `SameSite=None` and no CORS preflight on the happy path. `API_URL` is read at build time, so each environment builds with its own target (Compose passes `http://api:4000` as a build arg).

**Sockets go straight to the API.** In M3 the Socket.io client connects to the API origin directly, authenticated with a short-lived token minted by the API over the proxied REST path. The cookie stays first-party; only the socket handshake crosses origins, and it carries its own credential rather than relying on one.

**The API still behaves as if it were exposed.** `@fastify/cors` is configured with `origin: WEB_ORIGIN, credentials: true`, and better-auth gets the same value in `trustedOrigins`, which is what backs its CSRF check. Because every request now arrives from the proxy, rate limiting would otherwise share a single bucket for the whole internet: Fastify's `trustProxy` is set from `TRUST_PROXY` (default `loopback,uniquelocal`), so `x-forwarded-for` is honoured only from those peers and `@fastify/rate-limit` keys on the real client IP. Setting `TRUST_PROXY` too wide lets a caller spoof its own IP and defeat the limiter; that is the reason it is an explicit environment variable rather than a hardcoded `true`.

**One carve-out in the error contract.** Every non-2xx TableTap produces uses the envelope `{ error: { code, message, details? } }`. Responses from the delegated better-auth handler under `/api/auth/*` are proxied through unchanged, because the better-auth web client parses better-auth's own `{ code, message }` shape. The single exception is an unknown path under `/api/auth/`, which better-auth answers with an empty 404; the forwarder replaces that with the `NOT_FOUND` envelope, since an empty body is no answer at all.

## Consequences

- The web app must be rebuilt when `API_URL` changes; it is not a runtime setting.
- CSRF protection rests on better-auth's `trustedOrigins` plus `SameSite=Lax`, so `WEB_ORIGIN` must be correct in every environment or sign-in silently stops working.
- A wrong `TRUST_PROXY` is a security setting, not a convenience one, and it is easy to get wrong on a new platform. It is documented in `.env.example` and covered by a test that gives each forwarded client IP its own sign-in bucket.
- One extra network hop on every API call in production. Acceptable: the alternative costs cross-site cookies.
- The rewrite forwarding `Set-Cookie` is what the Playwright smoke test exists to prove — it signs in through the web origin and reads back the signed-in state. It has not run yet.
