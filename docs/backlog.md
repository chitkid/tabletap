# Backlog

Out-of-scope items noticed during work. Nothing here is scheduled.

- Secret rotation for table tokens (`kid` header) — spec 17. Since M5 it is the only lever that retires every table's code at once; one table at a time is [ADR 0013](adr/0013-revocable-qr.md).
- Waiter-created orders — not in the brief.
- Multi-restaurant tenancy — non-goal.

## Deferred from M1 review

Noticed while reviewing the M1 branch; none of it blocks the milestone.

- The ESLint 9 line is deprecated upstream. Move to ESLint 10 once typescript-eslint and eslint-config-next support it.
- Root `package.json` has no `"type": "module"`, so lint prints a MODULE_TYPELESS warning.
- `/health` swallows the `select 1` error silently. Log it at debug so a degraded response says why.
- The debug log in `principal` / `resolve-principal` includes the raw caught error object; log `err.message` only.
- The guest cookie's `secure` flag now comes from `COOKIE_SECURE`. Revisit when a staging tier exists that is neither the local demo nor production.
- The `--button-*` component tokens are not consumed by `button.tsx`.
- Generated colour shades above 600 collapse to near-black for the `ink` and `olive` bases. Nothing references them; the semantic layer uses 100-600 only.
- `auth.test.ts` and `guest.test.ts` share per-file rate-limit buckets, which makes them sensitive to test order.
- `TRUST_PROXY` accepts an empty string and then fails deeper inside proxy-addr. Add `.min(1)` to the schema.
- `resolve-principal` clears a forged `tt_guest` cookie when `getSession` throws. Safe, but untested.
- The seed runs the restaurant-slug SELECT unconditionally, including in `--reset` mode where the result is unused.
- The web container has no healthcheck, so Compose `--wait` returns as soon as it is merely running. CI polls `:3000/login` to compensate.

## Deferred from the final M1 review

Noticed in the whole-branch review before merge. Everything here was judged out of scope for M1 and is written down so it is not rediscovered.

- Containers run as root. Add `USER node` to both Dockerfiles. Postgres also publishes 5432 with the default demo credentials. Both are scoped to the local demo; neither is acceptable on a deployed host.
- The rate limiter uses the in-memory store, which is per process. A multi-instance deploy needs a shared store (Redis) or the limit is per instance. M6, with deployment.
- `AuthClientLike` in `apps/web/components/login-form.tsx` mirrors the better-auth client shape by hand so the form can be tested without the real client. It will drift if better-auth changes; derive it from the client's own types if that becomes a problem.
- In the local demo the API port is published on the host, so a host-side client can set `x-forwarded-for` itself. `TRUST_PROXY` believes loopback, so a caller on the host can pick its own rate-limit bucket. Not a concern behind a real proxy, where only the proxy reaches the API.

## Recommendations carried past M2

Not defects. Directions later milestones should take, decided while reviewing M1. The three M2 items on this list — `restaurantId` on `GuestPrincipal`, `requireAction` over explicit role lists, and no Server Actions for API calls — all landed in M2.

- Audit staff sign-in and sign-out. The audit log exists and the guest claim already writes to it; the staff side is the obvious gap.

## Deferred from M2 review

Noticed while building and reviewing the M2 branch. Ordered roughly by how much they would cost to leave.

- `strip` in `apps/api/src/routes/orders.ts` runs `OrderDtoSchema.parse` per order, so a list response is parsed once by `strip` and again by the route's response schema. Correct, and measurable only on a long list. The kitchen board's active-orders query caps at 200, which bounds it for now; revisit if a list ever runs longer.
- `loadMenu` returns `{ restaurant: { id, name: '', currency: 'USD' }, categories: [] }` when the restaurant row is missing. `name` is `z.string().min(1)` in the contract, so that fallback would fail the response schema with a 500 rather than the empty menu it intends. Unreachable today — the id comes from a foreign key — but it should either throw `NOT_FOUND` or stop pretending.
- `ElapsedSince` wraps its interval `setState` in `flushSync` so the test can assert synchronously after `vi.advanceTimersByTime`. An `act()` in the test would have done the same without pinning production code to a testing concern.
- The checkout tests use `tableId="t1"`, which is not a uuid. Nothing validates it — it is only a `localStorage` key — but every other fixture in the repo uses a real uuid, and a reader is entitled to assume the fixture matches the contract.
- Unavailable basket lines are dropped from the payload by `toOrderItems` on the client. Spec §5 wanted the server to be the final judge; it still is (`ITEM_UNAVAILABLE` exists and is tested), but the happy path never asks it. Harmless because the Place order button is disabled while any line is sold out.
- `e2e/` and `scripts/` are not linted. `pnpm lint` runs each package's own ESLint, and neither directory belongs to a package; the root config additionally ignores `scripts/**`. Both hold real code now (the Playwright specs and the Lighthouse audit).
- The seed's option object — `demoPassword`, `tableTokenSecret`, `tableTokenTtlDays`, `webOrigin` — is assembled by hand in three places (`packages/db/src/cli/seed.ts`, `apps/api/src/plugins/demo-reset.ts`, the seed tests). One helper that builds it from a config would stop the fourth caller getting it wrong.
- `apps/web/lib/api.test.ts` puts an import between statements to keep a `vi.mock` above it. It works and it is the common workaround, but a short comment saying why would save the next reader the detour.
- The landing's "Built with" list renders each tool as a `Badge`. Badges usually mean status; this is a list of nouns. A plain list styled the same way would say the same thing without borrowing the semantics.

## Resolved in the M2 fix wave

Found in the M2 reviews and fixed on the branch before merge. Listed so a reader of the entries above does not go looking for them.

- `crypto.randomUUID()` minted the checkout's `Idempotency-Key` and does not exist in an insecure context, so a phone on plain http over a LAN address could not order at all. `apps/web/lib/uuid.ts` falls back to `crypto.getRandomValues`.
- The rate limiter ran at `preHandler`, behind schema validation and the access guards, so it never counted the requests they answered: an anonymous `POST /api/orders` was unlimited, and 20 claims with a body `ClaimRequestSchema` rejects — or an unparseable sign-in body — were all free. It is back on the default `onRequest` hook, and `POST /api/orders` keys on the signed guest cookie instead of the principal.
- `GET /api/demo/links` allowed 30 a minute for one bucket shared by every landing visitor, because the Next server calls it on the visitor's behalf: past thirty renders in a minute the landing silently lost its QR link and its staff accounts. The route allows 300 a minute and the web tier caches a successful answer for 30 seconds.
- `seed --reset` re-minted every id, so a signed table token resolved to a table that no longer existed and a basket keyed on the table id was orphaned — against the reasoning in ADR 0002 for a 365-day TTL. Seed ids are now derived from natural keys (`packages/db/src/seed/ids.ts`).
- The Lighthouse gate scored whatever page the browser ended on, so a redirect (an expired claim sending `/menu` to `/session-ended`) could pass it. The audit now fails unless `finalDisplayedUrl` is the path it asked for.
- A 409 `CONFLICT` from `POST /api/orders` showed "Can't reach the server". It now says the basket was already sent from another table.

## Resolved in M3

Items carried on the M1 and M2 lists until the kitchen display closed them. Their old entries have been retired from the sections above, so this is the only place they are recorded.

- The kitchen `font-size` mechanism (final M1 review). `[data-surface='kitchen']` in `packages/ui/theme.css` now overrides Tailwind's `--text-*` scale — `text-xs` 16 px through `text-2xl` 32 px — so the utilities the board actually uses render at the kitchen sizes instead of ignoring the surface's `font-size`.
- `GET /api/orders/:id` answering 400 before 401 (M2 review). Both order routes now validate `params` inside the handler, behind the guard, so an unauthenticated caller gets 401 whether or not the id is well formed. `POST /api/orders/:id/transition` was written the same way.
- Extracting the cookie-unsign plus `resolvePrincipal` pair for the socket handshake (recommendation carried past M2). **Withdrawn**, not done: the handshake authenticates with a socket token, not a cookie jar, and that token is minted by a route which has already run the normal principal pipeline. There is nothing left to share. See [ADR 0008](adr/0008-realtime-delivery.md).

## Deferred from M3 review

Noticed while building and reviewing the M3 branch. Nothing here blocks the milestone.

**Scope deliberately left for later milestones**

- A guest cancel endpoint. `orders.cancel.own` exists in the RBAC matrix and nothing routes to it; the kitchen can cancel, the guest cannot. Needs a window rule (before `cooking`, presumably) more than it needs code.
- A Redis adapter for multi-instance Socket.io (M6, with deployment). The in-memory adapter means two API instances never see each other's rooms. Same shape as the rate limiter's in-memory store, already on this list.
- Deployment order, for whoever writes the M6 pipeline: **API before web.** `OrderDtoSchema` requires `updatedAt` and the per-status timestamps — `paidAt` among them since M4 — so a newer web against an older API fails to parse every order response: the menu still works and nothing after it does. The reverse order is safe, since an older web ignores fields it does not know about.
- A waiter surface (M5). `TRANSITION_RIGHTS.waiter` grants `served` and `cancelled`, and there is no screen from which to use them.
- Served and cancelled history on the board. Tickets leave when they leave; there is no way to look at the last hour, and no undo for a mis-bump.
- The `kitchen` room is global while the snapshot it answers is restaurant-scoped (`apps/api/src/realtime/server.ts`). Correct for one tenant, wrong the day there are two — and multi-restaurant tenancy is a stated non-goal, so this is a marker rather than a task.

**Security and privacy**

- The transition rate limit keys on the raw `cookie` header (`apps/api/src/routes/orders.ts`), chosen at `onRequest` where no principal exists yet. Owner's ruling on 2026-09-03: keep it as planned. A junk cookie opens a fresh 60/min bucket before the guard rejects the request, which costs nothing against the in-memory store; revisit with a shared store, and add an ip-wide limit across the guarded routes at the same time (M6).

**Real-time behaviour**

- A ticket transitioned between the moment `subscribe` stamps `serverTime` and the moment its query reads the table comes back as active in that snapshot, so a board that had already removed it on the event puts it back until the next one arrives. The window is one query wide and the same ticket's next bump clears it; closing it properly needs the board to remember what it removed, not just what it holds.
- The demo reset cancels a running rush (`app.rush.stop()` in `apps/api/src/plugins/demo-reset.ts`) rather than pausing it. Pausing and resuming after the reseed would keep the demo's minute of orders intact for whoever pressed the button.
- `apps/api/src/realtime/server.ts` awaits `io.close()` in `onClose`, which also closes the HTTP server and can wait out keep-alive sockets before Fastify force-closes them. Only visible as a slow shutdown.
- `createRush({ count: 0 })` never resolves its run, and `rush.stop()` puts no timeout on the drain; its doc comment says "the stopped run" while `inFlight` is not generation-scoped (conservative, so it over-waits rather than under-waits). `apps/api/src/lib/rush.ts`.
- The per-socket `subscribe` throttle (`apps/api/src/realtime/server.ts`) acks `null` on a second call inside its one-second window, the same ack a failed read uses. The board cannot tell the two apart, so a resync that lands inside the window — two lost bump races, or a `demo:reset` resync right after a connect resync — shows "Couldn't refresh the board. Retrying…" although nothing is stale. Give the throttle its own signal, or suppress the notice for a resync issued inside the window.
- The clock offset (`clockOffsetOf` in `apps/web/lib/board-store.ts`) is `serverTime − Date.now()` measured after the `subscribe` ack returns, while `serverTime` is stamped before the snapshot query runs, so the offset absorbs the whole ack latency rather than half the round trip. Invisible at tens of milliseconds; a slow snapshot can rewind every timer on the board by a second or more, and each snapshot re-applies it. Halve it with a round-trip measurement, or carry the query duration in the ack.
- `apps/web/app/kitchen/page.tsx` passes the web server's own clock as the SSR timer base, not the API's — the two containers can drift, and the first paint would show skewed ages until the first snapshot corrects them. Closing it properly means `OrdersResponse` carrying a `serverTime`.

**Kitchen board polish**

- The live regions mount with their text already in them, so a screen reader may not announce the first one. Render the region empty and fill it.
- `OrderLive` keeps applying `setOrder` after the order was cleared by a reset (`apps/web/components/order/order-live.tsx`); harmless, since the cleared notice replaces the screen, but it is state nobody reads. The same component has no `serverTime` guard on its snapshot: when a snapshot does not contain the order it shows "This order was cleared by the hourly demo reset." unconditionally, where the kitchen board keeps a local copy newer than the snapshot's `serverTime` (`mergeSnapshot`) before saying the same thing. Unreachable today, because the guest snapshot is `listOrders(db, { guestSessionId })` with no status filter, so the only way an order is missing is that the demo reset deleted it — add the guard if the guest snapshot ever becomes status-filtered.
- `kitchen-board.tsx` is 338 lines after the fix waves and holds the socket lifecycle, the resync-and-retry logic, the server-clock offset, the optimistic moves and the layout. Splitting the lifecycle into a hook would make both halves testable on their own; it is the largest single thing on this list now.
- `globals.css`'s `body:has` rule for the kitchen surface reaches for the night-background primitive rather than the semantic `--background`, and it cannot do otherwise: `--background` is redefined on `[data-surface='kitchen']`, which is a descendant of `<body>`, and custom properties inherit downward only. The two values are the same colour and the primitive is the only one in scope at `body` level, so this is not fixable as written. Closing it properly means a surface attribute the document element carries — a decision about how surfaces are declared, not a CSS tweak.
- A redundant flex wrapper sits around `RushButton` on the landing page.
- `handOverFocus` in `apps/web/components/kitchen/ticket-card.tsx` sends focus to the first bump button in the column after a cancel, not to the ticket next to the cancelled one.

**Tests**

- `columnsOf` indexes `COLUMNS` by position (`apps/web/lib/board-store.ts`), so reordering the column list silently reorders the board.
- Gaps worth closing: a token with an invalid `role` claim (the title in `packages/shared/src/server/socket-token.test.ts` promises the case, the body never signs one); an idempotency replay not emitting `order:created` (holds by inspection in `apps/api/src/lib/orders.ts`); a cancelled transition, the `readyAt`/`servedAt` stamps and `details.current` over HTTP; the equal-`updatedAt` event boundary in the board store; `POST /api/demo/rush` answering 404 outside demo mode; `useNow` and `useSoundPreference`.
- The audit assertion in `apps/api/src/lib/transitions.test.ts` depends on test order.
- The fake socket in the board tests has a no-op `removeAllListeners`, so a listener leak in the real component would go unnoticed; the `nextEvent` helper casts through `unknown` where two literal call sites would typecheck.
- Small type debt in `apps/api/src`: a redundant `String()` in the transition `keyGenerator`, a computed-key spread in `lib/transitions.ts` that bypasses Drizzle's column typing, and a non-null assertion on the post-commit reload.
- Light-surface `timer-ok` (3.87:1) and `timer-warn` (3.24:1) are still asserted on the kitchen surface only. M1 deferred the light-surface assertions to M2, M2 deferred them to M3 expecting the board to need them, and M3 could not add them either: every `timer-*` token is consumed on the kitchen (dark) surface, and the guest order page shows an elapsed counter in body text using none of them. The gap is not a missing test but a missing consumer — either give a light surface a timer, or drop the light values from the token file. Deciding that is the actual task.

- A browser sends no `x-forwarded-for`, and the Next rewrite forwards only what it receives, so every browser client reaches the API as the web container and shares one rate-limit bucket. A caller that sets the header gets its own bucket, which is what `TRUST_PROXY` is for behind a real reverse proxy. In the Compose demo the sign-in limit is therefore per deployment, not per member of staff.

## Resolved in the final M3 fix wave

Found in the whole-branch review of M3 and fixed on the branch before merge. Listed so a reader of the entries above does not go looking for them.

- A guest socket outlived its guest session: a tab left open on a table's last sitting kept receiving the next party's `table:<tableId>` payloads. Rooms are now `session:<guestSessionId>` (owner's decision 2026-09-04; [ADR 0008](adr/0008-realtime-delivery.md)), and the leak itself is a test.
- A snapshot replaced the board wholesale, so an order committed while the snapshot query was running — already delivered as `order:created`, because the socket joins its room at connection time — was erased and never came back. `serverTime` is stamped before the read and `mergeSnapshot` keeps whatever the board learned after it.
- A failed `subscribe` acked `{ orders: [] }`, which every client reads as "everything is gone". The ack is `BoardSnapshot | null`; the board keeps its tickets, says "Couldn't refresh the board. Retrying…" and retries with a backoff, and the guest's order page stays quiet.
- The offline banner took about 45 seconds. The server heartbeat is 10 s with a 5 s timeout, the board listens for the browser's own `offline` and `online` events, and `OFFLINE_DETECTION_MS` in `e2e/kitchen-live.spec.ts` is down to 20 s.
- `publish` is wrapped, so a broadcast that throws cannot answer 500 for a write that already committed. `subscribe` is throttled to one a second per socket.
- Timers followed the display's clock. The board keeps the offset between `serverTime` and its own clock; `/kitchen` passes its render-time clock into `useNow`'s server snapshot, so the server's HTML paints real ages rather than `0:00` — which was also most of the page's layout shift.
- A restored `Sound on` preference now builds the chime on the first gesture anywhere on the page, so the label is honest.
- A 403 says "You can't move #42." rather than blaming the ticket's status.
- Confirming a cancel hands focus to the next ticket's bump button, or to the column heading when there is none.
- "Couldn't start a rush." clears on the same cool-down as every other message.
- The plan's claim that `guestSessionId` "never leaves the API" was contradicted by the socket token's subject. The wording is narrowed everywhere (spec §6, the plan's Global Constraints, ADR 0008, README): the id never appears in an order payload and never reaches another client, and the token hands the guest's own session id back to the browser that already holds it in its cookie.

## Resolved in M4

Carried on the lists above until payments closed them.

- Registering the Stripe webhook in its own encapsulated scope with a buffer content-type parser and `config.public`, so raw-body parsing cannot leak into the JSON routes (recommendation carried past M2). `paymentWebhookRoutes` in `apps/api/src/routes/payments.ts` is registered with `app.register` rather than `fastify-plugin`, and its `addContentTypeParser` applies to that scope only. See [ADR 0010](adr/0010-payments-one-port.md).
- The interim `placed → cooking` edge ([ADR 0009](adr/0009-interim-state-machine.md)), removed in full by commit `d25508a`: `ORDER_TRANSITIONS.placed` is `['paid', 'cancelled']`, the board's New column holds `paid` alone, and `paid` has one writer. ADR 0009 is superseded by [ADR 0010](adr/0010-payments-one-port.md).

## Deferred from M4 review

Noticed while building and reviewing the payments branch. Nothing here blocks the milestone.

**Scope deliberately left for later milestones**

- Refunds, and cancelling a paid order with the money back. `settlePayment` only moves an order forward; cancelling a paid order today writes the cancellation and moves no money, and the audit trail says so. Out of M4 by the design spec's own scope line, and the first thing a real deployment would need.
- A sweeper for orders that are never paid. A `placed` order with an abandoned attempt stays in the guest's list forever and counts as active in `GET /api/orders?active=1`. This needs a timeout rule — how long an order may sit unpaid, and whether the guest is told — more than it needs code.

**Configuration and provider selection**

- A half-set Stripe pair silently resolves to `demo`: with only one of `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` present the API boots, takes no money, and says nothing. A startup warning line would fix it. The derivation itself is covered by the `paymentProvider` block in `apps/api/src/config.test.ts`; what is missing is the deployment noticing.
- `optionalNonEmpty` in `apps/api/src/config.ts` turns `''` into "absent" but still accepts a whitespace-only key, which selects `stripe` and then fails at the first API call rather than at boot.
- The `demo` provider with `DEMO_MODE=false` is a dead end: the Pay button opens an attempt and points at `/pay/<id>`, but the completion route is not registered, so nothing can settle it. It is a misconfiguration rather than a mode, and it should fail at boot rather than at the terminal ([ADR 0011](adr/0011-demo-payment-provider.md)).
- `createDemoProvider().readEvent` throws `PaymentSignatureError`, so a callback posted to the webhook while the demo provider is live answers 400 `SIGNATURE_INVALID`. Right outcome, misleading reason: there is no signature to check because there is no webhook.

**Settlement and the audit trail**

- A crash between the `processed_events` insert and the settlement leaves the event recorded as seen and the order unpaid: the provider's retry is answered `replayed` and nothing ever pays it. Safe in the direction that matters, but it needs a reconciliation pass to close.
- `payment.mismatch` covers two different failures — an amount that does not match the order, and an event naming a payment that belongs to another order. The event type is recoverable from `processed_events` in either case, but the audit row alone does not say which happened. (`payment.late` no longer shares this problem: a late success is `payment.overpaid`.)
- Currency is never compared. `settlePayment` checks `amountCents` against the order's total and ignores `SettleInput.currency`; one currency is what makes that safe.
- Stripe's `amount_total` is nullable, and the adapter settles a null as `0`, relying on the mismatch check to refuse it. Correct, but "no amount" reaches the comparison as a real figure.
- `startPayment` inserts a fresh pending `payments` row per attempt and nothing ever reaps them; the demo completion route picks the newest by `created_at` with no tie-break. It also stamps the session-id write with a new `Date()` instead of the `now` it was given.
- `SessionInput.number` is read by neither adapter.
- The rush transaction in `apps/api/src/lib/rush.ts` falls back with `payment?.id ?? null` and `paid ?? order`, where every sibling insert throws on a missing `returning` row.
- `recordOverpaid` in `apps/api/src/lib/payments.ts` scopes its update to the payment id and the order id but, unlike `fail`, carries no `status = 'pending'` clause. A late success naming an attempt that is already `failed` — declined, or closed by a mismatch — would walk that row forward to `succeeded`. Hard to reach with either provider; the asymmetry with `fail` is what makes it worth closing.
- The late-success branch has no `ForeignPayment` equivalent. If such an event names a payment belonging to another order, the scoped update in `recordOverpaid` correctly touches nothing, but a `payment.overpaid` audit row is still written under this order, carrying the foreign payment id and amount — an audit row asserting a closure that did not happen. The settling path handles the same situation as `payment.mismatch` and rolls back.

**The guest surface**

- `PAYMENT_REQUIRED` is overloaded, and the demo terminal reads it as one thing. A 409 from `POST /api/payments/demo/complete` means "this attempt is over", and the terminal answers correctly by opening a fresh attempt; but an order that was cancelled while the terminal was open produces the same code from `POST /api/orders/:id/payment` on that second call, and the guest is told "Couldn't reach the terminal. Try again." when the truth is that there is nothing left to pay. A distinct code, or the order status in the details, would let the terminal say which.
- A declined attempt is closed for good at the API: the payment row is `failed` and nothing can settle it again. The terminal recovers by opening a fresh attempt on the 409, so a guest never sees this, but the API on its own offers no way to retry an attempt — worth knowing before a second client is written against it.
- `searchParams` on `/orders/[id]` is typed `{ paid?: string }`, while Next hands over `string | string[] | undefined` for a repeated query parameter. `?paid=1&paid=1` would arrive as an array and fall through to "no claim at all", which is harmless but is not what the type says.
- The landing's Stripe test card falls back to a hardcoded `4242 4242 4242 4242` when `testCard` is null, and no test covers the fallback.

**Board and contract**

- `GET /api/orders?active=1` still counts `placed` orders. The board holds them in state and never draws them, now that the New column is `paid` alone — dead weight on every snapshot and every reconnect, and the reason `e2e/kitchen-live.spec.ts` compares the board against the drawable subset rather than against the whole list. Either narrow what `active=1` means for the kitchen, or give the board the filter explicitly.
- `apps/web/components/kitchen/kitchen-board.tsx` keeps a synchronous `stateRef` that only the socket-event handler writes eagerly; the snapshot ack, the demo reset and the optimistic move instead rely on the post-render effect that mirrors `state` into it. A socket event landing in the same batch as one of those, before that effect runs, compares against a stale board, so it can chime and mark a ticket the snapshot already drew, or stay silent for one that just arrived. Two socket events in the same tick are safe, since the handler updates `stateRef` itself before dispatching.
- `applyEvent` in `apps/web/lib/board-store.ts` replaces on an equal `updatedAt`, so an event arriving with the same stamp as a ticket the board holds further along can move it back into the New column — which the entry guard in `kitchen-board.tsx` now reads as an arrival and answers with a chime and a fresh mark. The boundary is already on the list above as untested; this is what it now costs.

**Tests**

- The parser-encapsulation test cannot actually fail from a leak — the demo-route tests are what protect that property today.
- Untested: `POST /api/payments/demo/complete` against an order that was paid and then cancelled, which answers 200 (paid-then-cooking and placed-then-cancelled are both covered).
- Two audit-count assertions in the payments tests depend on test order — the same shape as the M3 entry for `apps/api/src/lib/transitions.test.ts`.
- `apps/web/components/kitchen/kitchen-board.test.tsx` builds its 409 payload with `from: 'placed'`, while the shared fixture defaults to `paid` and a real refusal would say `from: 'paid'`. Nothing reads the field; it is stale test data beside a live assertion.
- `/pay/<id>` is outside the Lighthouse audit. It needs a guest cookie _and_ an order still waiting for payment, which `scripts/lighthouse-audit.mjs` does not set up, so the one screen M4 added is the one screen the accessibility gate does not see.
- One test name in `apps/web/components/order/pay-button.test.tsx` claims more than the assertion under it checks.
- `apps/web/components/login-form.test.tsx` > "submits email and password" times out at Vitest's 5 s default under load: it passed twelve runs in a row on its own and failed once while fifteen Turbo tasks were running in parallel. Untouched since M1 and nothing to do with payments; it is `userEvent` typing two fields character by character with no headroom. Give that one test an explicit timeout, or type into the fields directly.
- A stale comment at `apps/api/src/lib/payments.test.ts:34` explains the `entityId` scope on `auditCount` by saying more than one test writes `payment.late` rows. After the final fix wave only one test does; it is `payment.overpaid` that two tests write now.

## Resolved in the final M4 fix wave

Found in the whole-branch review of M4 and fixed on the branch before merge. Listed so a reader of the entries above does not go looking for them.

- The chime announced a ticket the board does not draw and was silent for the one it does. `order:created` carries an order a guest has just placed, which is unpaid, and the New column is `paid` alone; the ticket lands on the settlement, which arrives as `order:updated`. Both events now go through one handler that marks and announces an order when it _enters_ the first column.
- A genuine success for an order that is no longer `placed` left its `payments` row `pending` for ever, with the charge findable only through the provider's event id. It now closes that attempt as `succeeded` and writes `payment.overpaid` carrying the payment id, the amount and the order's real status. The refund itself is still out of scope — it is the entry above about refunds.
- The concurrent double delivery of one event, which the spec names and the insert-first ordering exists for, had no test; nor did the webhook's 200 path. Both are in `apps/api/src/lib/payments.test.ts` and `apps/api/src/routes/payments.test.ts` now.
- `README.md` gave the demo-completion body as `{ outcome }`, where the route requires `{ orderId, outcome }`, and its test counts were a gate behind.

## Found on the first Compose run

Docker was not available on the owner's machine until 2026-09-03, so `docker compose up`, the Playwright suite against the stack and the Lighthouse gate had never executed before that day. The first run found three defects, all fixed on `main`:

- The api container never became healthy: its `HEALTHCHECK` probed `localhost`, which resolves to `::1` inside the container, while the server listens on `0.0.0.0` only. `web` waits for a healthy api, so it never started. The probe now targets `127.0.0.1`.
- The web image received `API_URL` as a build arg for the rewrite but never carried it into the runtime stage, so every server-side read fell back to `localhost:4000` and the landing rendered without its demo block. The runner stage now sets `API_URL` from the same build arg.
- `getByRole('alert')` in the invalid-QR e2e matched two elements: the page's alert and the empty route announcer Next.js appends to the body. The locator is scoped to `main`.

Local-only, not a repo defect: the Playwright `chrome.exe` on that Windows host fails side-by-side activation ("dependent assembly could not be found"), while `chrome-headless-shell.exe` and Edge start normally. `scripts/lighthouse-audit.mjs` honours `CHROME_PATH` so the audit can run on either.

## Resolved in M5

Carried on the lists above until the admin surface closed them.

- The currency literal. `OrderDto` carries the restaurant's currency end to end, `startPayment` reads it from the restaurant row, and every one of the twelve `formatCents` call sites in `apps/` passes an explicit currency — including the dashboard's revenue tile, which is the reason the debt was worth closing rather than moving again. The one place still hardcoding `'USD'` is `rush.ts`, listed below.
- The admin density mechanism. The `--spacing` multiplier that scaled the surface's 44 px controls down to about 35 is gone from `packages/ui/theme.css`; density comes from the grid and the type scale, and the comment beside the admin block says why nothing is scaled there.
- Admin-triggered QR regeneration, which was the milestone's own line item. `POST /api/tables/:id/qr` bumps `tables.qr_version`, the claim endpoint compares it, and the control asks first. See [ADR 0013](adr/0013-revocable-qr.md).

## Deferred from M5

Noticed while building and reviewing the admin branch. Nothing here blocks the milestone. Several of these were found independently by more than one reviewer and are written down once.

**Scope deliberately left for later milestones**

- The waiter surface. `TRANSITION_RIGHTS.waiter` is still unused by any screen: the rights exist in `packages/shared`, and nothing renders a control that would exercise them. It is the last unbuilt role.
- Refunds, and what a cancellation means to the day's figures. A paid order that is later cancelled still counts toward today's orders and revenue on the dashboard. That is correct as specified — the money was taken and not returned, and refunding is an explicit non-goal — but the two questions have to be answered together whenever refunds arrive.
- `GET /api/tables` and `GET /api/tables/:id` are not scoped by restaurant: they answer from the id alone. Harmless while one restaurant exists, and multi-tenancy is a stated non-goal, but this is the concrete thing that has to be fixed before a second one. Pre-existing, untouched by M5.
- A one-press sold-out control on the menu. The availability switch lives inside edit mode, so marking a dish sold out is Edit, toggle, Save — three steps for the thing an operator does mid-service. The placement is deliberate: an in-row control that wrote immediately would contradict the explicit-Save model the whole row is built on. A dedicated control is the thing to consider, not moving this one.

**Storage and uploads**

- An upload nobody confirms is an orphan, and there is no sweep. Three ways to make one: the browser completes its `PUT` and the tab closes before the confirmation; two photo changes race and the loser's object is superseded the moment it is confirmed; and a post-commit `remove` of the previous object fails, in which case that object is orphaned for ever. A lifecycle rule on the `menu/` prefix, or a sweep that lists it against `image_url`, closes all three. See [ADR 0012](adr/0012-object-storage-uploads.md).
- Confirming a key that is already in use can delete the object it points at. A presigned `PUT` is reusable for its minute and signs no size, so re-confirming the current key runs `checkUpload` against a live object and deletes it if the second upload was too large.
- `POST /api/menu/items/:id/photo-url` mints a write capability into the bucket with no rate limit of its own and no audit row, so nothing records that a URL was asked for.
- The 503 for an unconfigured store carries the `INTERNAL` error code, because `ERROR_CODES` has no `SERVICE_UNAVAILABLE`. `requireStorage` also runs before the id is validated, so a malformed id on a store-less deployment answers 503 rather than 400.
- `head()` reads a missing `ContentLength` as `0` — failing open on the very value the 5 MB ceiling depends on. `exists` calls `this.head`, so a destructured reference to it breaks.
- `.env.example` says blanking the four storage variables disables photographs, which is true on a host but not under Compose, where the `api` service sets them itself. The MinIO images are unpinned (`minio/minio` and `minio/mc` with no tag), and the compose interpolation for `S3_PUBLIC_URL` nests a default inside a default.
- Untested: the null-storage branch, both `isMissing` branches in the S3 adapter, and `isPhotoKeyFor` at the port level — it is exercised through the route rather than directly. Two identical `preprocess` helpers sit side by side in `apps/api/src/config.ts`.

**Concurrency and the database**

- The optimistic-concurrency guard compares `updatedAt`, which migration 0005 pinned to millisecond precision. Two writes to the same row inside one millisecond are indistinguishable, so a genuinely stale write can win instead of getting a 409 — and for `reissueQr` that means the version moves by one while two audit rows each claim to have moved it from 1 to 2. Inherent to a timestamp-based guard; a version counter or `xmin` closes it properly, and closes it everywhere at once. Found independently by three reviewers.
- `orders` has no index on `restaurant_id` at all — only `table_id`, `status`, `number` and `paid_at`. Every restaurant-scoped query in the API is paying for that, and the dashboard is only its loudest caller.
- Migration 0005 takes `ACCESS EXCLUSIVE` and rewrites `orders`, `order_items` and `payments` to change the timestamp precision. Harmless today, with no deployed environment; worth knowing before it ever meets a populated database.
- The stale-write block — read `before`, guard the `UPDATE` on it, re-read to tell a 404 from a 409 — is written out twice in `tables-admin.ts` and three times in `menu-admin.ts`. One `staleWrite(db, restaurantId, id, noun)` helper would remove all five, the way `changedFields` was lifted into `lib/audit.ts`.
- `rush.ts` still hardcodes `'USD'` in the payments row it inserts directly, and `loadMenu` keeps a `'USD'` fallback for a missing restaurant row. Both are the last remnants of the literal M5 removed everywhere else.

**The printed code and the sheet**

- The QR sheet prints in Helvetica. `@fontsource/ibm-plex-sans` ships woff and woff2 only, neither of which pdfkit can embed, and `resolveBrandFont()` is wired so that dropping a TTF into the package switches the face with no other edit. **It is not a no-op.** The instruction line clears Helvetica by roughly 6 pt at the width it is drawn in, so the wider IBM Plex Sans will wrap it and shift the foot of every card. Whoever adds the font has to re-measure that line: the card layout, not just the font path, is what changes.
- `GET /api/tables/qr.pdf` has no rate limit and writes no audit row, though it hands out a live token for every active table. It also reads every table and filters `isActive` in JS rather than in the `WHERE`.
- A guest holding a retired code is told less than the server said. The claim endpoint answers 401 `TOKEN_INVALID` with "This QR code is no longer valid. Ask staff for a new one.", but `apps/web/components/claim-table.tsx` maps by error code alone and shows its own "This QR code is not valid." — the same sentence a forged token gets, and no instruction to ask staff. Either give revocation its own error code or pass the server's message through. Noticed when the version claim was added and still open.
- Reseeding recreates tables at `qr_version` 1, so a demo reset revalidates a code that was deliberately retired. Correct for a demo that returns to a known state; surprising if it is read as a bug.
- No end-to-end test drives a versionless token — an M4-era code — through the claim; the default-to-1 rule is covered as a unit test only.

**The admin surface**

- The landing's Admin card does not reach the admin. It points at `/login?demo=admin` with no `next`, and `/login` defaults to `/kitchen`, so the card signs an admin in and drops them on the kitchen board — and its own copy still reads "Arrives later; today it opens the kitchen board as an admin." An `&next=/admin` and a rewritten sentence in `apps/web/components/landing/landing-content.tsx` is the whole fix. Until then the surface is reachable only by typing `/admin`.
- Deleting takes one press with no confirmation, on both admin screens. A category with dishes, a dish on an order and a table with orders are all refused outright with 409 `IN_USE`, and Delete sits inside the expanded panel rather than beside Save, so the reachable damage is an empty category, an unordered dish or an unused table. It now spans two screens, which is why it is written down rather than left as a per-screen judgement.
- Deleting a table that a guest has claimed but not ordered from ends that guest's session: `guest_sessions.table_id` cascades. Judged correct — the table is gone, so the session sitting at it should be too, and the cascade is scoped to that one table — and recorded here because it is a consequence nobody decided in writing. Orders still block the delete outright, so no history is reachable this way.
- Three reads of `GET /api/menu` per dashboard view. The admin layout fetches it for the restaurant's name and the dashboard page fetches it again for the currency, on top of the dashboard's own query. A `GET /api/restaurant` route, or `restaurant` on `MeResponse`, retires all of them.
- `GET /api/dashboard` has no caching, and `MenuCategoryDto` carries no `isActive`, so the admin UI can neither see nor reactivate a deactivated category.
- WCAG 2.5.3 (Label in Name) is half satisfied on the availability switch: the visible word reads "Sold out" while the accessible name reads "Available", so a voice-control user saying the word they can see does not hit the control. Accepted deliberately — the brief mandates both visible words, and a switch's on/off text is conventionally a value rather than a label — but it belongs in the first real screen-reader and voice pass.
- Smaller, on the menu screen: `aria-invalid` on the price field is `false` in exactly the case that triggers the invalid state, because `Number('')` is `0` and finite; a new dish takes `sortOrder = items.length` rather than `max + 1`, so it can land mid-category while `addCategory` gets this right; the layout's second fetch has no `catch`, so a 5xx on the name lookup takes the whole admin surface to the error boundary; `sameAllergens` is order-sensitive, so uncheck-then-recheck sends a spurious patch; the dish `onDeleted` omits the `setDraftId(null)` its category twin has; Save and Cancel can be scrolled out of view under 672 px; and `menu-table.tsx` is 459 lines holding four components.
- Smaller, on the tables screen: `aria-invalid` on Number and Seats is `false` when the field is emptied, for the same `Number('')` reason, and the message never mentions seats though `seats < 1` raises it; the QR list item carries an `aria-label` while its visible content is entirely `aria-hidden`, with no `sr-only` fallback; `addTable`'s double-press guard has no test and reads `tables` from the render closure rather than through a functional updater, unlike its neighbour; the label suppression is an exact-string compare, so a label of "table 7" still reads the number twice; and the reissued sentence never clears for the rest of the session.

**Tests and tooling**

- A reissue leaves the landing's demo link dead for up to thirty seconds. `apps/web/lib/demo-links.ts` remembers a successful `GET /api/demo/links` for 30 s, so the landing keeps handing out the code that was just retired until that memory expires. In the demo that is a visitor scanning the landing's QR and being told it is not valid; in the e2e suite it is a cross-spec hazard, which `e2e/admin.spec.ts` handles by waiting for the landing to come good again before it finishes. A shorter memory, or dropping it when a table is reissued, fixes the product side.
- The e2e suite spends five of the ten sign-ins a minute the API allows one address, so two full runs inside a minute trip the limit and a test reads "Too many attempts. Wait a minute and try again." Fine for CI and for one local run; worth knowing before a sixth sign-in is added.
- `/admin` cannot be audited by Lighthouse. The `Cookie` header the audit injects does not survive the redirect onto `/admin/dashboard`, so asking for the door scores the sign-in page; the audit points at the dashboard instead. `/admin/menu` and `/admin/tables` are not audited at all, and neither is `/pay/<id>` (already on the M4 list) — the accessibility gate sees one of the three admin screens.
- `e2e/admin.spec.ts` leaves the dish it adds on the menu; nothing cleans it up, so a stack that is never torn down grows one dish per run. Harmless — the name carries a timestamp and the hourly demo reset removes it — but it is state a test left behind.
- No test asserts that a card's **text** appears on the QR sheet, only that the link annotations are there: deleting every `doc.text()` call in `drawCard` would pass all four PDF tests. A `compress: false` flag through `QrSheetInput` would put the strings literally in the stream and make the assertion possible. The PDF route tests also hard-code the seed counts (12 and 11), so they depend on every earlier test cleaning up after itself.
- Dashboard edges: `revenueCents ::int` overflows above 21.47M cents of daily revenue and `averageReadyMs` above about 24.8 days — both raise a Postgres error rather than return a wrong number, so this is liveness rather than correctness; a malformed `timezone` column value surfaces as a 500 rather than a clean envelope; the route's 401/403 tests assert `statusCode` without checking the error envelope; two unreachable bare `Error` throws bypass the `AppError` envelope; `asNumberConflict` returns `unknown` on a path where it always throws; and no DST-transition case is actually executed.
- The row-height test compares an `h-*` class against itself, both sides sourced from `ROW_LINE`, so it can only catch a deliberate override. Recorded as a decision rather than a defect: the brief mandated that exact form and jsdom does no layout, so the real assurance is the shared constant plus the 56 px line over the 44 px control.
- `apps/web/components/admin/week-bars.test.tsx` asserts the bar height with `/min-h-\d+/`, which passes on `min-h-0` — the one value that would make the zero-day baseline invisible. A test that permits the bug it exists to prevent.
- `packages/shared/src/api.test.ts` has a second import block from `./index` three hundred lines into the file. The lockfile now carries two majors each of `@noble/ciphers` and `@noble/hashes`, pulled in through `pdfkit`.
