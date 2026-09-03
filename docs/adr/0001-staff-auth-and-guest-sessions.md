# ADR 0001: Staff authentication with better-auth, guests as their own session kind

Date: 2026-09-02
Status: accepted

## Context

TableTap has two kinds of caller and they have nothing in common.

Staff (waiter, kitchen, admin) sign in with an email and a password, keep a session across shifts, and their role decides what they may do. Their accounts are created by the operator, never by self-service.

Guests scan a QR code at a table. They never register, they have no password to lose, and their identity is only meaningful for a few hours: they are "whoever is sitting at table 7 right now". The demo tenant is wiped on a schedule, so guest identity must be cheap to create and cheap to delete.

The API (Fastify, `apps/api`) owns the database and every write. Whatever issues sessions has to live there, or the API ends up trusting a token minted by something else.

## Decision

**Staff: better-auth inside `apps/api`.** Configured in `apps/api/src/auth.ts` with the Drizzle adapter (`provider: 'pg'`, `usePlural: true`), email and password enabled, `disableSignUp: true`, a `role` additional field that the client cannot set (`input: false`), and `trustedOrigins: [WEB_ORIGIN]`. It is mounted as two Fastify routes on `/api/auth/*` that forward to better-auth's own `handler`, so rate limiting, request ids and logging apply to it like any other route.

**Guests: a separate session kind.** `POST /api/guest/claim` verifies the table token from the QR (ADR 0002), inserts a `guest_sessions` row bound to the table, and sets an httpOnly, `SameSite=Lax`, signed `tt_guest` cookie holding the session id. The session slides: a request from a guest whose `last_seen_at` is older than five minutes refreshes `last_seen_at` and `expires_at`. Claiming again from the same browser expires the previous session first, so one browser never holds two live sessions.

**One resolution step.** `apps/api/src/plugins/principal.ts` runs on every request and puts a `Principal` on it — a discriminated union of `staff`, `guest` and `anonymous`. The order in `lib/resolve-principal.ts` is: better-auth session, then an unexpired guest session behind a validly signed cookie, then anonymous. When the request resolves to anonymous, an expired, unknown or forged guest cookie is cleared; a valid staff session takes precedence and the guest cookie is left alone. Everything downstream — the RBAC guards, the routes, the audit log — reads `request.principal` and nothing else.

### Rejected

- **Auth.js / NextAuth.** It is built around the Next.js app. Sessions would be created on the web side while the API owns the data, giving two sources of truth and forcing the API to re-verify a token it did not mint. It also has no notion of an actor without an account, so guests would have needed a parallel mechanism anyway.
- **better-auth's anonymous plugin.** It turns every guest into a real `users` row. Guests would then be indistinguishable from staff at the schema level, the role column would need a fourth value, and the hourly demo reset would have to delete users while leaving the three seeded staff accounts intact. A `guest_sessions` table that can be truncated is simpler and says what it means.

## Consequences

- One auth truth: the API decides who a caller is, and both surfaces get the same answer.
- Resetting the demo is a table wipe (`guest_sessions`, orders, audit rows). No user records are touched.
- Staff accounts exist only through the seed until the admin surface arrives in M5; there is deliberately no sign-up endpoint.
- The `Principal` union is the vocabulary of the whole API. Adding a fourth kind later means touching every guard, which is the point: it is a visible change, not a silent one.
- Because a missing guard is invisible at runtime — an unguarded route simply answers everyone — `apps/api/src/plugins/route-guard.ts` makes the route table default-deny. Any route registered without either `config.public: true` or a `preHandler` produced by the `require*` factories throws at boot. Forgetting an access check fails the build rather than shipping an open endpoint.
