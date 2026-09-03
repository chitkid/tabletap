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
- Containers run as root. Add `USER node` to both Dockerfiles. Postgres also publishes 5432 with the default demo credentials. Both are scoped to the local demo; neither is acceptable on a deployed host.
- The rate limiter uses the in-memory store, which is per process. A multi-instance deploy needs a shared store (Redis) or the limit is per instance. M6, with deployment.
- `AuthClientLike` in `apps/web/components/login-form.tsx` mirrors the better-auth client shape by hand so the form can be tested without the real client. It will drift if better-auth changes; derive it from the client's own types if that becomes a problem.
- In the local demo the API port is published on the host, so a host-side client can set `x-forwarded-for` itself. `TRUST_PROXY` believes loopback, so a caller on the host can pick its own rate-limit bucket. Not a concern behind a real proxy, where only the proxy reaches the API.

## Recommendations carried past M2

Not defects. Directions later milestones should take, decided while reviewing M1. The three M2 items on this list — `restaurantId` on `GuestPrincipal`, `requireAction` over explicit role lists, and no Server Actions for API calls — all landed in M2.

- Extract the cookie-unsign plus `resolvePrincipal` pair into one reusable function before M3: the Socket.io handshake needs exactly that, and it must not re-implement it.
- Register the Stripe webhook in its own encapsulated scope with a buffer content-type parser and `config.public`, so raw-body parsing cannot leak into the JSON routes (M4).
- Audit staff sign-in and sign-out. The audit log exists and the guest claim already writes to it; the staff side is the obvious gap.

## Deferred from M2 review

Noticed while building and reviewing the M2 branch. Ordered roughly by how much they would cost to leave.

- `GET /api/orders/:id` declares `schema.params`, so a malformed id answers 400 before the guard answers 401. `POST /api/orders` deliberately does the opposite (ADR 0006). Pick one and make both routes agree.
- `strip` in `apps/api/src/routes/orders.ts` runs `OrderDtoSchema.parse` per order, so a list response is parsed once by `strip` and again by the route's response schema. Correct, and measurable only on a long list; revisit if the kitchen board (M3) lists hundreds.
- `loadMenu` returns `{ restaurant: { id, name: '', currency: 'USD' }, categories: [] }` when the restaurant row is missing. `name` is `z.string().min(1)` in the contract, so that fallback would fail the response schema with a 500 rather than the empty menu it intends. Unreachable today — the id comes from a foreign key — but it should either throw `NOT_FOUND` or stop pretending.
- `ElapsedSince` wraps its interval `setState` in `flushSync` so the test can assert synchronously after `vi.advanceTimersByTime`. An `act()` in the test would have done the same without pinning production code to a testing concern.
- The checkout tests use `tableId="t1"`, which is not a uuid. Nothing validates it — it is only a `localStorage` key — but every other fixture in the repo uses a real uuid, and a reader is entitled to assume the fixture matches the contract.
- Unavailable basket lines are dropped from the payload by `toOrderItems` on the client. Spec §5 wanted the server to be the final judge; it still is (`ITEM_UNAVAILABLE` exists and is tested), but the happy path never asks it. Harmless because the Place order button is disabled while any line is sold out.
- `e2e/` and `scripts/` are not linted. `pnpm lint` runs each package's own ESLint, and neither directory belongs to a package; the root config additionally ignores `scripts/**`. Both hold real code now (the Playwright specs and the Lighthouse audit).
- The seed's option object — `demoPassword`, `tableTokenSecret`, `tableTokenTtlDays`, `webOrigin` — is assembled by hand in three places (`packages/db/src/cli/seed.ts`, `apps/api/src/plugins/demo-reset.ts`, the seed tests). One helper that builds it from a config would stop the fourth caller getting it wrong.
- `apps/web/lib/api.test.ts` puts an import between statements to keep a `vi.mock` above it. It works and it is the common workaround, but a short comment saying why would save the next reader the detour.
- The landing's "Built with" list renders each tool as a `Badge`. Badges usually mean status; this is a list of nouns. A plain list styled the same way would say the same thing without borrowing the semantics.
- `OrderDto` carries no currency, so `/orders/[id]` passes `currency="USD"` as a literal. One restaurant, priced in USD, makes that true today. M5 should put the currency on the DTO.
- Light-surface `timer-ok` (3.87:1) and `timer-warn` (3.24:1) are still asserted on the kitchen surface only. M1 deferred this to M2 on the assumption that the guest order screen would render a timer; it renders an honest elapsed counter in body text instead, using no `timer-*` token. Add the assertions in M3, with the kitchen board.

## Resolved in the M2 fix wave

Found in the M2 reviews and fixed on the branch before merge. Listed so a reader of the entries above does not go looking for them.

- `crypto.randomUUID()` minted the checkout's `Idempotency-Key` and does not exist in an insecure context, so a phone on plain http over a LAN address could not order at all. `apps/web/lib/uuid.ts` falls back to `crypto.getRandomValues`.
- The rate limiter ran at `preHandler`, behind schema validation and the access guards, so it never counted the requests they answered: an anonymous `POST /api/orders` was unlimited, and 20 claims with a body `ClaimRequestSchema` rejects — or an unparseable sign-in body — were all free. It is back on the default `onRequest` hook, and `POST /api/orders` keys on the signed guest cookie instead of the principal.
- `GET /api/demo/links` allowed 30 a minute for one bucket shared by every landing visitor, because the Next server calls it on the visitor's behalf: past thirty renders in a minute the landing silently lost its QR link and its staff accounts. The route allows 300 a minute and the web tier caches a successful answer for 30 seconds.
- `seed --reset` re-minted every id, so a signed table token resolved to a table that no longer existed and a basket keyed on the table id was orphaned — against the reasoning in ADR 0002 for a 365-day TTL. Seed ids are now derived from natural keys (`packages/db/src/seed/ids.ts`).
- The Lighthouse gate scored whatever page the browser ended on, so a redirect (an expired claim sending `/menu` to `/session-ended`) could pass it. The audit now fails unless `finalDisplayedUrl` is the path it asked for.
- A 409 `CONFLICT` from `POST /api/orders` showed "Can't reach the server". It now says the basket was already sent from another table.

## Found on the first Compose run

Docker was not available on the owner's machine until 2026-09-03, so `docker compose up`, the Playwright suite against the stack and the Lighthouse gate had never executed before that day. The first run found three defects, all fixed on `main`:

- The api container never became healthy: its `HEALTHCHECK` probed `localhost`, which resolves to `::1` inside the container, while the server listens on `0.0.0.0` only. `web` waits for a healthy api, so it never started. The probe now targets `127.0.0.1`.
- The web image received `API_URL` as a build arg for the rewrite but never carried it into the runtime stage, so every server-side read fell back to `localhost:4000` and the landing rendered without its demo block. The runner stage now sets `API_URL` from the same build arg.
- `getByRole('alert')` in the invalid-QR e2e matched two elements: the page's alert and the empty route announcer Next.js appends to the body. The locator is scoped to `main`.

Local-only, not a repo defect: the Playwright `chrome.exe` on that Windows host fails side-by-side activation ("dependent assembly could not be found"), while `chrome-headless-shell.exe` and Edge start normally. `scripts/lighthouse-audit.mjs` honours `CHROME_PATH` so the audit can run on either.
