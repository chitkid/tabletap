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

## Resolved in M3

Items from the lists above that the kitchen display closed. Listed so a reader of those entries does not go looking for open work.

- The kitchen `font-size` mechanism (final M1 review). `[data-surface='kitchen']` in `packages/ui/theme.css` now overrides Tailwind's `--text-*` scale — `text-xs` 16 px through `text-2xl` 32 px — so the utilities the board actually uses render at the kitchen sizes instead of ignoring the surface's `font-size`.
- `GET /api/orders/:id` answering 400 before 401 (M2 review). Both order routes now validate `params` inside the handler, behind the guard, so an unauthenticated caller gets 401 whether or not the id is well formed. `POST /api/orders/:id/transition` was written the same way.
- Extracting the cookie-unsign plus `resolvePrincipal` pair for the socket handshake (recommendation carried past M2). **Withdrawn**, not done: the handshake authenticates with a socket token, not a cookie jar, and that token is minted by a route which has already run the normal principal pipeline. There is nothing left to share. See [ADR 0008](adr/0008-realtime-delivery.md).

## Deferred from M3 review

Noticed while building and reviewing the M3 branch. Nothing here blocks the milestone.

**Scope deliberately left for later milestones**

- A guest cancel endpoint. `orders.cancel.own` exists in the RBAC matrix and nothing routes to it; the kitchen can cancel, the guest cannot. Needs a window rule (before `cooking`, presumably) more than it needs code.
- A Redis adapter for multi-instance Socket.io (M6, with deployment). The in-memory adapter means two API instances never see each other's rooms. Same shape as the rate limiter's in-memory store, already on this list.
- A waiter surface (M5). `TRANSITION_RIGHTS.waiter` grants `served` and `cancelled`, and there is no screen from which to use them.
- Served and cancelled history on the board. Tickets leave when they leave; there is no way to look at the last hour, and no undo for a mis-bump.
- The `kitchen` room is global while the snapshot it answers is restaurant-scoped (`apps/api/src/realtime/server.ts`). Correct for one tenant, wrong the day there are two — and multi-restaurant tenancy is a stated non-goal, so this is a marker rather than a task.

**Security and privacy**

- The transition rate limit keys on the raw `cookie` header (`apps/api/src/routes/orders.ts`), chosen at `onRequest` where no principal exists yet. Owner's ruling on 2026-09-03: keep it as planned. A junk cookie opens a fresh 60/min bucket before the guard rejects the request, which costs nothing against the in-memory store; revisit with a shared store, and add an ip-wide limit across the guarded routes at the same time (M6).
- A guest socket outlives its guest session. After a table is re-claimed by a new party, a tab left open on the old session still receives `table:<tableId>` payloads for the new one. No identifiers leak — every payload passes the public `OrderDtoSchema` — but the order lines do. Expiring the socket with the session, or re-checking the principal on each broadcast, would close it.
- `subscribe` is not rate limited: it is a socket message, and `@fastify/rate-limit` only sees HTTP requests. A client can re-subscribe in a loop and each one runs the active-orders query.
- A throw inside the `publish` listener in `apps/api/src/realtime/server.ts` would surface as a 500 on a request whose row is already committed. Wrap the listener and log instead.

**Real-time behaviour**

- The offline banner takes about 45 seconds to appear, because engine.io's defaults (25 s `pingInterval` plus 20 s `pingTimeout`) are what detect the loss. A kitchen board should know within seconds: lower the server heartbeat, and/or have the board listen to the window `offline` event, then tighten `OFFLINE_DETECTION_MS` in `e2e/kitchen-live.spec.ts`. Recommended for the final fix wave.
- The demo reset cancels a running rush (`app.rush.stop()` in `apps/api/src/plugins/demo-reset.ts`) rather than pausing it. Pausing and resuming after the reseed would keep the demo's minute of orders intact for whoever pressed the button.
- `apps/api/src/realtime/server.ts` awaits `io.close()` in `onClose`, which also closes the HTTP server and can wait out keep-alive sockets before Fastify force-closes them. Only visible as a slow shutdown.
- `createRush({ count: 0 })` never resolves its run, and `rush.stop()` puts no timeout on the drain; its doc comment says "the stopped run" while `inFlight` is not generation-scoped (conservative, so it over-waits rather than under-waits). `apps/api/src/lib/rush.ts`.

**Kitchen board polish**

- The board server-renders every timer as `0:00` with the ok threshold, then grows the cards on hydration: Lighthouse measures CLS 0.212 and performance 84 on `/kitchen` (accessibility is 100). Passing the server clock into `getServerSnapshot` for `useNow` would fix both the shift and the flash.
- A restored `Sound on` preference stays silent until the toggle is pressed again, because the `AudioContext` is only built on the click. Expected given the browser gesture rule, but the toggle should say so rather than look enabled and do nothing.
- `"Couldn't start a rush."` never clears — only the success and 409 messages are put on a timer (`apps/web/components/kitchen/rush-button.tsx`).
- Confirming a cancel drops focus to `<body>` (`apps/web/components/kitchen/ticket-card.tsx`); it should return to the card's remaining control.
- The live regions mount with their text already in them, so a screen reader may not announce the first one. Render the region empty and fill it.
- `OrderLive` keeps applying `setOrder` after the order was cleared by a reset (`apps/web/components/order/order-live.tsx`); harmless, since the cleared notice replaces the screen, but it is state nobody reads.
- `kitchen-board.tsx` is 204 lines and holds the socket lifecycle, the optimistic-move logic and the layout. Splitting the lifecycle into a hook would make both halves testable on their own.
- `globals.css`'s `body:has` rule for the kitchen surface reaches for the night-background primitive instead of the surface's own `--background`.
- A redundant flex wrapper sits around `RushButton` on the landing page.

**Tests**

- `columnsOf` indexes `COLUMNS` by position (`apps/web/lib/board-store.ts`), so reordering the column list silently reorders the board.
- Gaps worth closing: a token with an invalid `role` claim (the title in `packages/shared/src/server/socket-token.test.ts` promises the case, the body never signs one); an idempotency replay not emitting `order:created` (holds by inspection in `apps/api/src/lib/orders.ts`); a cancelled transition, the `readyAt`/`servedAt` stamps and `details.current` over HTTP; the equal-`updatedAt` event boundary in the board store; `POST /api/demo/rush` answering 404 outside demo mode; `useNow` and `useSoundPreference`.
- The audit assertion in `apps/api/src/lib/transitions.test.ts` depends on test order.
- The fake socket in the board tests has a no-op `removeAllListeners`, so a listener leak in the real component would go unnoticed; the `nextEvent` helper casts through `unknown` where two literal call sites would typecheck.
- Small type debt in `apps/api/src`: a redundant `String()` in the transition `keyGenerator`, a computed-key spread in `lib/transitions.ts` that bypasses Drizzle's column typing, and a non-null assertion on the post-commit reload.
- Light-surface `timer-ok` and `timer-warn` contrast is still unasserted (M2 review expected M3 to close it). It could not be: every `timer-*` token is consumed on the kitchen surface only, and the guest order page still shows an elapsed counter in body text. Either add a light-surface consumer or drop the light values.

## Found on the first Compose run

Docker was not available on the owner's machine until 2026-09-03, so `docker compose up`, the Playwright suite against the stack and the Lighthouse gate had never executed before that day. The first run found three defects, all fixed on `main`:

- The api container never became healthy: its `HEALTHCHECK` probed `localhost`, which resolves to `::1` inside the container, while the server listens on `0.0.0.0` only. `web` waits for a healthy api, so it never started. The probe now targets `127.0.0.1`.
- The web image received `API_URL` as a build arg for the rewrite but never carried it into the runtime stage, so every server-side read fell back to `localhost:4000` and the landing rendered without its demo block. The runner stage now sets `API_URL` from the same build arg.
- `getByRole('alert')` in the invalid-QR e2e matched two elements: the page's alert and the empty route announcer Next.js appends to the body. The locator is scoped to `main`.

Local-only, not a repo defect: the Playwright `chrome.exe` on that Windows host fails side-by-side activation ("dependent assembly could not be found"), while `chrome-headless-shell.exe` and Edge start normally. `scripts/lighthouse-audit.mjs` honours `CHROME_PATH` so the audit can run on either.
