# Backlog

Out-of-scope items noticed during work. Nothing here is scheduled.

- Secret rotation for table tokens (`kid` header) — spec 17.
- Admin-triggered QR regeneration — M5.
- Waiter-created orders — not in the brief.
- Multi-restaurant tenancy — non-goal.

## Deferred from M1 review

Noticed while reviewing the M1 branch; none of it blocks the milestone.

- The ESLint 9 line is deprecated upstream. Move to ESLint 10 once typescript-eslint and eslint-config-next support it.
- Root `package.json` has no `"type": "module"`, so lint prints a MODULE_TYPELESS warning.
- `/health` swallows the `select 1` error silently. Log it at debug so a degraded response says why.
- The debug log in `principal` / `resolve-principal` includes the raw caught error object; log `err.message` only.
- The guest cookie's `secure` flag now comes from `COOKIE_SECURE`. Revisit when a staging tier exists that is neither the local demo nor production.
- ~~`--status-ready` (`#2F8A3E`) as a filled badge on light surfaces is 4.28:1. Darken to `#2D853C` in the brand document and the token if a filled badge is wanted (M2).~~ Done in M2: the token is `#2D853C` (4.56:1) and `tokens.test.ts` gates the badge label against its fill.
- The admin surface's `--spacing: 0.2rem` scales `h-11` buttons down to about 35 px. Revisit the density mechanism before M5 builds real admin screens.
- The `--button-*` component tokens are not consumed by `button.tsx`.
- Generated colour shades above 600 collapse to near-black for the `ink` and `olive` bases. Nothing references them; the semantic layer uses 100-600 only.
- `auth.test.ts` and `guest.test.ts` share per-file rate-limit buckets, which makes them sensitive to test order.
- `TRUST_PROXY` accepts an empty string and then fails deeper inside proxy-addr. Add `.min(1)` to the schema.
- `resolve-principal` clears a forged `tt_guest` cookie when `getSession` throws. Safe, but untested.
- The seed runs the restaurant-slug SELECT unconditionally, including in `--reset` mode where the result is unused.
- The web container has no healthcheck, so Compose `--wait` returns as soon as it is merely running. CI polls `:3000/login` to compensate.

## Deferred from the final M1 review

Noticed in the whole-branch review before merge. Everything here was judged out of scope for M1 and is written down so it is not rediscovered.

- Kitchen `font-size` mechanism. `[data-surface="kitchen"]` sets `font-size: var(--kitchen-body-size)` on the surface root, but Tailwind's `text-*` utilities are rem-based and ignore it, so the kitchen type scale is not actually enforced. Override the `--text-*` scale under the surface before M3 builds the board.
- Light-surface `timer-ok` (3.87:1) and `timer-warn` (3.24:1) are asserted on the kitchen surface only. Add the same assertions for the guest surface in M2, when the guest order-tracking screen first renders a timer.
- Containers run as root. Add `USER node` to both Dockerfiles. Postgres also publishes 5432 with the default demo credentials. Both are scoped to the local demo; neither is acceptable on a deployed host.
- The rate limiter uses the in-memory store, which is per process. A multi-instance deploy needs a shared store (Redis) or the limit is per instance. M6, with deployment.
- Missing indexes: `orders.table_id`, `orders.status`, `order_items.order_id`, `guest_sessions.expires_at`, `audit_log.action`. Nothing queries them at M1 volumes; add them with the M2 migrations, when the queries that need them arrive.
- `NEXT_PUBLIC_APP_URL` is declared and unused. M2 needs it for `metadataBase`.
- `AuthClientLike` in `apps/web/components/login-form.tsx` mirrors the better-auth client shape by hand so the form can be tested without the real client. It will drift if better-auth changes; derive it from the client's own types if that becomes a problem.
- In the local demo the API port is published on the host, so a host-side client can set `x-forwarded-for` itself. `TRUST_PROXY` believes loopback, so a caller on the host can pick its own rate-limit bucket. Not a concern behind a real proxy, where only the proxy reaches the API.

## Recommendations carried into M2

Not defects. Directions the next milestone should take, decided while reviewing M1.

- Add `restaurantId` to `GuestPrincipal`. The claim join already selects it, and M2's menu and order queries all scope by restaurant.
- Prefer `requireAction('tables.read')` over an explicit role list wherever the RBAC matrix already has the answer. A role list at the route duplicates the matrix and can disagree with it.
- Extract the cookie-unsign plus `resolvePrincipal` pair into one reusable function before M3: the Socket.io handshake needs exactly that, and it must not re-implement it.
- Register the Stripe webhook in its own encapsulated scope with a buffer content-type parser and `config.public`, so raw-body parsing cannot leak into the JSON routes (M4).
- All mutations go through the `/api/*` rewrite to the Fastify API. No Server Actions for API calls: a Server Action runs on the Next.js origin and does not carry the guest cookie to Fastify (ADR 0004).
- Audit staff sign-in and sign-out. The audit log exists and the guest claim already writes to it; the staff side is the obvious gap.
