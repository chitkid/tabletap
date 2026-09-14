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

- ~~Containers run as root.~~ Closed in M6, which is when there was a deployed host: both Dockerfiles set `USER node`, verified with `whoami` inside each running container. The other half of the entry stands — Postgres publishes 5432 with the default demo credentials — and it is scoped to the local demo, since the deployed stack publishes no database port.
- The rate limiter uses the in-memory store, which is per process. Merged with the Socket.io adapter entry below into one item under **Deferred from M6**, where it carries its trigger.
- `AuthClientLike` in `apps/web/components/login-form.tsx` mirrors the better-auth client shape by hand so the form can be tested without the real client. It will drift if better-auth changes; derive it from the client's own types if that becomes a problem.
- ~~In the local demo the API port is published on the host, so a host-side client can set `x-forwarded-for` itself. `TRUST_PROXY` believes loopback, so a caller on the host can pick its own rate-limit bucket.~~ Closed in M6: the web signs the address it forwards and the API honours a forwarded address only when the signature verifies (`FORWARD_SECRET`; spec §4.4), so a host-side caller with no secret is keyed on its own connection address. `.env.example` sets the secret, so a stack brought up from it is defended; one whose `.env` predates the variable still is not.

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
- ~~The landing's "Built with" list renders each tool as a `Badge`.~~ Moot since `163897b`: the technology list was removed from the landing along with the demo cards, when the owner ruled the site must read as a real restaurant's. There is no badge list to restyle.

## Found in the final review wave, 2026-09-15

Three whole-branch reviews read `feat/ru-localisation` before merge; their measurements are in
`.superpowers/sdd/2026-09-14-russian-localisation/final-review-{broad,security,guards}.md`, which are
committed. Everything Critical and Important was fixed in the merge wave. What follows is what was
deliberately not, so nobody re-derives it.

- **`admin.photo.off` is a truncated copy of `errors.photoUploadDisabled`.** It drops
  «Обратитесь к тому, кто её разворачивал.» — the same shape as the two `guest.claim.*` refusals
  that _were_ restored in the wave, and lower stakes for the same reason the merge review ruled it a
  Minor: the reader is an operator looking at a control that is switched off, not a guest standing at
  a table who cannot get any further. It is now the one pair `apps/web/lib/api.test.ts` pins as a
  **prefix** rather than as an equality, so the shared half cannot drift and the missing half is
  visible in one place. Trigger: any decision about what an operator sees when photo upload is off.

- **The printed QR card and the landing bind one space differently.** `apps/api/src/lib/ru.ts`'s
  `qrSheet.instruction` writes «выберите блюда и оформите заказ.» with a plain space after «и»;
  `landing.hero.subtitle` and `landing.meta.description` bind it with U+00A0. `ru.dictionary.test.ts`
  compares the clause with U+00A0 flattened and says so, because the claim being made is about the
  verbs and because changing a sentence a guest reads is the copy owner's. The two homes are one code
  point apart and a reader of either would not notice. Trigger: the copy owner revisiting the card,
  or a decision about whether «и» is bound at all — the contract binds _prepositions_, and «и» is a
  conjunction, so the landing is the side that is arguably over-applying the rule.

- **Nine Minors ruled SHIP by the merge review, listed so they are not rediscovered one at a time.**
  `.gitattributes` has `*.woff2 binary` matching zero tracked files while the two `.woff` faces this
  milestone added match no binary rule; `qrcode` and `@types/qrcode` are dead dependencies since
  `163897b` removed their only consumer; `rush-button.tsx:16`'s default `fetcher` is unreachable;
  five exports are used only inside their own file (`RefusalVerb`, `BUMPABLE_STATUSES`,
  `BumpableStatus`, `Elapsed`, `e2e/dictionary.ts`'s `ru` re-export); `NBSP` is declared 30 times,
  `plain` 26 and `flat` 3, all behaviourally identical; `layout.test.tsx` matches source text with a
  regex that a commented-out occurrence would satisfy and reads one file where a glob would be
  complete by construction; `no-mixed-normalisation.test.ts`'s walk is complete by accident rather
  than by construction (it omits `apps/web/i18n`); a fails-open `not.toMatch(/\d+(?:ms|s)/)`
  survives in six component tests beside the positive assertion that actually catches the defect;
  and `en.json`'s ~258 non-`errors` values are inert (their _keys_ are now gated by
  `i18n/dictionary.test.ts`; their words are not).

- **`GET /api/orders/:id` still answers 403 for a stranger's order and 404 for one that never
  existed**, because the existence check runs before the ownership check
  (`apps/api/src/routes/orders.ts:67` and `:74`). Its two siblings deliberately merge the cases into
  one `orderNotFound` (`lib/payments.ts:26-28`, `routes/payments.ts:81-82`). Unchanged by this
  milestone and small in practice — order ids are v4 UUIDs, so this confirms rather than enumerates,
  and `apps/web/app/orders/[id]/page.tsx:34` folds 400/403/404 into `notFound()` so no browser sees
  the difference. Moving the ownership test above the existence test is the whole fix, and it belongs
  in a change that is about access control rather than about language.

- **The scan-honesty discipline is applied to two of three siblings.** `errors.test.ts:185` and
  `no-mixed-normalisation.test.ts:153` each assert a corpus floor with a comment explaining that a
  negative assertion over an empty list passes for the wrong reason; `no-orphan-strings.test.ts` —
  the most load-bearing of the three — asserts only `=== []` twice, and its comment says "69 files,
  0 missing" while pinning neither number. Reachability is low, because `sourcesUnder` throws on a
  missing directory, which is why the merge review ruled it a Minor. The wave's own new gates
  (`i18n/dictionary.test.ts`, the `SHARED` map in `errors.test.ts`) were built with a floor and a
  positive fixture from the first line; making that the repository's rule rather than four
  independent rediscoveries is the item. The largest of the four recommendations — declare the
  dictionary's type — shipped as `apps/web/messages.d.ts`.

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
- A Redis adapter for multi-instance Socket.io. Merged with the rate limiter's in-memory store into one item under **Deferred from M6**: they are the same shape and they fail on the same day.
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

- ~~A browser sends no `x-forwarded-for`, and the Next rewrite forwards only what it receives, so every browser client reaches the API as the web container and shares one rate-limit bucket.~~ Closed in M6 (spec §4.4): `apps/web/middleware.ts` signs the visitor's address with `FORWARD_SECRET` and the API honours a forwarded address only when that signature verifies, keying on the connection's own address otherwise. Measured before and after on a rebuilt Compose stack — two source addresses shared one bucket, then got twenty each. The relay behaviour itself was confirmed rather than assumed: Next sets `x-forwarded-for` on the incoming request and does not add one to the rewrite's outgoing fetch.

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
- `apps/web/components/login-form.test.tsx` > "submits email and password" times out at Vitest's 5 s default under load. Recorded here against one file; M6 hit the same failure on at least six other untouched files and the entry is generalised under **Deferred from M6** below, where it is stated as a mechanism rather than as a test.
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

- The currency literal. `OrderDto` carries the restaurant's currency end to end, `startPayment` and `rush.ts` both read it from the restaurant row, and `formatCents` has no default currency at all, so every call site must state one — including the dashboard's revenue tile, which is the reason the debt was worth closing rather than moving again. `loadMenu`'s fallback for a missing restaurant row is the last `'USD'` in `apps/`, listed below.
- The admin density mechanism. The `--spacing` multiplier that scaled the surface's 44 px controls down to about 35 is gone from `packages/ui/theme.css`; density comes from the grid and the type scale, and the comment beside the admin block says why nothing is scaled there.
- Admin-triggered QR regeneration, which was the milestone's own line item. `POST /api/tables/:id/qr` bumps `tables.qr_version`, the claim endpoint compares it, and the control asks first. See [ADR 0013](adr/0013-revocable-qr.md).

## Deferred from M5

Noticed while building and reviewing the admin branch. Nothing here blocks the milestone. Several of these were found independently by more than one reviewer and are written down once.

**Scope deliberately left for later milestones**

- The waiter surface. `TRANSITION_RIGHTS.waiter` is still unused by any screen: the rights exist in `packages/shared`, and nothing renders a control that would exercise them. It is the last unbuilt role.
- Refunds, and what a cancellation means to the day's figures. A paid order that is later cancelled still counts toward today's orders and revenue on the dashboard. That is correct as specified — the money was taken and not returned, and refunding is an explicit non-goal — but the two questions have to be answered together whenever refunds arrive.
- `GET /api/tables` and `GET /api/tables/:id` are not scoped by restaurant: they answer from the id alone. Harmless while one restaurant exists, and multi-tenancy is a stated non-goal, but this is the concrete thing that has to be fixed before a second one. Pre-existing, untouched by M5.
- A one-press sold-out control on the menu. The availability switch lives inside edit mode, so marking a dish sold out is Edit, toggle, Save — three steps for the thing an operator does mid-service. This is a port, not an open design question: the tables screen ships that exact pattern one task later — a one-press, immediately-writing control in a read-mode row — and its focus handling is already solved in `ReadRow`'s `setActive`/`onToggled`, which reports through a callback that replaces the row without moving the hand. The original reasoning against it (an in-row control that writes immediately contradicts the explicit-Save model) was ratified for the menu and then contradicted on tables; both stand for M5, and what is left is copying the tables pattern onto the dish row.
- Deactivating a menu category is specified and deliberately not implemented. Spec §2 rules that a category holding items is deactivated rather than deleted; tables got both halves, categories only the write half. The M5 fix wave withdrew `isActive` from `MenuCategoryWriteSchema` rather than leave a `PATCH` that could remove a category from the only surface able to restore it. Building it properly needs three things: `isActive` on `MenuCategoryDtoSchema`, a `loadMenu` that stops filtering on it for staff callers while the guest menu keeps filtering, and a control on `/admin/menu` — plus a decision about what a deactivated category does to the dishes inside it.

**Storage and uploads**

- An upload nobody confirms is an orphan, and there is no sweep. Four ways to make one: the browser completes its `PUT` and the tab closes before the confirmation; two photo changes race and the loser's object is superseded the moment it is confirmed; a post-commit `remove` of the previous object fails, in which case that object is orphaned for ever; and — the only one that fires on a timer — the scheduled demo reset. `packages/db/src/seed/run.ts` does `tx.delete(schema.menuItems)`, which bypasses `deleteItem`, the sole code path that removes an object, and `DEMO_RESET_INTERVAL_MINUTES` defaults to 60, so in the deployed demo every photograph uploaded in an hour is an unreferenced world-readable object at the end of it. A lifecycle rule on the `menu/` prefix, or a sweep that lists it against `image_url`, closes all four; making the reset itself delete the objects closes only the last. See [ADR 0012](adr/0012-object-storage-uploads.md). **Still open after M6**, which answered the deployed half by removing it rather than by sweeping: the deployed demo configures no object storage at all and refuses uploads ([ADR 0014](adr/0014-the-demo-is-public.md)), so it makes no orphans. The local stack still does, and so would any future deployment that turns storage back on — which is what makes this a sweep that is owed rather than a defect that is gone.
- Confirming a key that is already in use can delete the object it points at. A presigned `PUT` is reusable for its minute and signs no size, so re-confirming the current key runs `checkUpload` against a live object and deletes it if the second upload was too large.
- `POST /api/menu/items/:id/photo-url` writes no audit row, so nothing records that a bucket-write URL was asked for. (It took a rate limit of twenty a minute per session in the M5 fix wave; the missing audit row is what is left.)
- The 503 for an unconfigured store carries the `INTERNAL` error code, because `ERROR_CODES` has no `SERVICE_UNAVAILABLE`. `requireStorage` also runs before the id is validated, so a malformed id on a store-less deployment answers 503 rather than 400.
- `.env.example` says blanking the four storage variables disables photographs, which is true on a host but not under Compose, where the `api` service sets them itself. The compose interpolation for `S3_PUBLIC_URL` nests a default inside a default.
- Untested: the null-storage branch. Two identical `preprocess` helpers sit side by side in `apps/api/src/config.ts`.

**Concurrency and the database**

- The optimistic-concurrency guard compares `updatedAt`, which migration 0005 pinned to millisecond precision. Two writes to the same row inside one millisecond are indistinguishable, so a genuinely stale write can win instead of getting a 409 — and for `reissueQr` that means the version moves by one while two audit rows each claim to have moved it from 1 to 2. Inherent to a timestamp-based guard; a version counter or `xmin` closes it properly, and closes it everywhere at once. Found independently by three reviewers.
- ~~`orders` has no index on `restaurant_id` at all.~~ Closed in M6 by migration `0006_orders-restaurant-idx.sql`, confirmed against a running container with `\d orders` rather than from the migration file alone.
- Migration 0005 takes `ACCESS EXCLUSIVE` and rewrites eight tables to change the timestamp precision — `restaurants`, `tables`, `menu_categories`, `menu_items`, `guest_sessions`, `order_items`, `orders` and `payments`, every table that goes through the shared `timestamps` helper. (`audit_log` and the four better-auth tables declare their own and are untouched.) Harmless today, with no deployed environment; worth knowing before it ever meets a populated database. The count read "three" here until the M6 fix wave read the migration file, and `docs/case-study.md` had inherited it.
- The stale-write block — read `before`, guard the `UPDATE` on it, re-read to tell a 404 from a 409 — is written out twice in `tables-admin.ts` and three times in `menu-admin.ts`. One `staleWrite(db, restaurantId, id, noun)` helper would remove all five, the way `changedFields` was lifted into `lib/audit.ts`.
- `loadMenu` keeps a `'USD'` fallback for a missing restaurant row — the last remnant of the literal M5 removed everywhere else. (`rush.ts` no longer hardcodes it; the M5 fix wave made it read the restaurant like every other write path.)

**The printed code and the sheet**

- ~~The QR sheet prints in Helvetica.~~ Closed in the Russian localisation milestone. It was worse than untranslated: with Russian labels seeded, Helvetica wrote «Стол 7» as the WinAnsi bytes `42 14 42 43 e4 3b 20 37`, which a reader shows as `B BCä; 7`. PT Sans Narrow is embedded now, as the two static TTFs Google Fonts releases (`apps/api/public/fonts`, SIL OFL) rather than the woff `@fontsource` ships, which pdfkit cannot read. This entry warned that the new face would be **wider** than Helvetica and would wrap the instruction line; it is the other way round, and the task-13 report first recorded the re-measurement wrong as well. Measured twice, with pdfkit’s `widthOfString` against the committed face and against the rendered page: PT Sans Narrow is **narrower** — the old English line is 166.41 pt in it against 216.10 pt in Helvetica at 8.5 pt — so the face change gave the card room rather than consuming it. The Russian instruction now measures **220.5 pt in a 229.6 pt text box** (the box runs 52 → 281.64 pt: `left = box.x + 16`, `contentWidth = box.width - 32`), leaving about 9 pt — roughly three characters — of headroom on one line. The foot of every card is where it was.
- **A sheet that cannot be printed is indistinguishable from any other 500.** A missing or unreadable brand face now refuses rather than printing mojibake (`apps/api/src/lib/qr-pdf.ts`), and the log line names the files and the paths, but `plugins/error-handler.ts:81` answers the admin the generic `serverError` envelope. A dedicated `ErrorMessageKey` is the obvious repair and **is not sufficient on its own**: `apps/web/components/admin/tables-table.tsx:116` reaches this route as `<a href="/api/tables/qr.pdf">`, a navigation rather than a fetch, so no React code sees the envelope and the admin would read raw JSON in a new tab whatever key it carried. Closing it properly means the download fetching the blob (and handling the refusal) or the route answering HTML on error — a web change, not an API one, which is why task 13 did not take it.
- `GET /api/tables/qr.pdf` writes no audit row, though it hands out a live token for every active table. It also reads every table and filters `isActive` in JS rather than in the `WHERE`. (It took a rate limit of five a minute per session in the M5 fix wave.)
- A guest holding a retired code is told less than the server said. The claim endpoint answers 401 `TOKEN_INVALID` with "This QR code is no longer valid. Ask staff for a new one.", but `apps/web/components/claim-table.tsx` maps by error code alone and shows its own "This QR code is not valid." — the same sentence a forged token gets, and no instruction to ask staff. Either give revocation its own error code or pass the server's message through. Noticed when the version claim was added and still open.
- Reseeding recreates tables at `qr_version` 1, so a demo reset revalidates a code that was deliberately retired. Correct for a demo that returns to a known state; surprising if it is read as a bug.
- No end-to-end test drives a versionless token — an M4-era code — through the claim; the default-to-1 rule is covered as a unit test only.

**The admin surface**

- `[data-surface='admin']` in `packages/ui/theme.css` is now an empty rule, and `layout.tsx` still sets the attribute. Both are kept on purpose — the empty block's comment is the record of why nothing is scaled on this surface, and `packages/ui/tokens.test.ts` anchors on the selector — but an attribute with no behaviour is a question worth answering rather than inheriting: either the admin token set grows into it, or the attribute and its test anchor go and the reasoning moves to `design-system/tabletap/pages/admin.md` alone.
- Deleting takes one press with no confirmation, on both admin screens. A category with dishes, a dish on an order and a table with orders are all refused outright with 409 `IN_USE`, and Delete sits inside the expanded panel rather than beside Save, so the reachable damage is an empty category, an unordered dish or an unused table. It now spans two screens, which is why it is written down rather than left as a per-screen judgement.
- Deleting a table that a guest has claimed but not ordered from ends that guest's session: `guest_sessions.table_id` cascades. Judged correct — the table is gone, so the session sitting at it should be too, and the cascade is scoped to that one table — and recorded here because it is a consequence nobody decided in writing. Orders still block the delete outright, so no history is reachable this way.
- Three reads of `GET /api/menu` per dashboard view. The admin layout fetches it for the restaurant's name and the dashboard page fetches it again for the currency, on top of the dashboard's own query. A `GET /api/restaurant` route, or `restaurant` on `MeResponse`, retires all of them.
- `GET /api/dashboard` has no caching. `MenuCategoryDto` still carries no `isActive`, which is why the write field was withdrawn rather than left in — see the deactivate-a-category entry above.
- WCAG 2.5.3 (Label in Name) is half satisfied on the availability switch: the visible word reads "Sold out" while the accessible name reads "Available", so a voice-control user saying the word they can see does not hit the control. Accepted deliberately — the brief mandates both visible words, and a switch's on/off text is conventionally a value rather than a label — but it belongs in the first real screen-reader and voice pass.
- Smaller, on the menu screen: `sameAllergens` is order-sensitive, so uncheck-then-recheck sends a spurious patch; the dish `onDeleted` omits the `setDraftId(null)` its category twin has; the no-op close in `EditRow.save` — the branch that closes a row nothing was changed in — has no test; Save and Cancel can be scrolled out of view under 672 px; and `menu-table.tsx` is over 450 lines holding four components.
- Smaller, on the tables screen: `addTable`'s double-press guard has no test and reads `tables` from the render closure rather than through a functional updater, unlike its neighbour; the label suppression is an exact-string compare, so a label of "table 7" still reads the number twice; and the reissued sentence never clears for the rest of the session.
- On the dashboard, the week strip's day item carries an `aria-label` while its visible content is entirely `aria-hidden`, with no `sr-only` fallback — and `week-bars.test.tsx` asserts that attribute rather than the accessible name, so a change that broke the name while leaving the attribute would pass. (Recorded under the tables screen in an earlier draft: it came out of the same task, which built both.)

**Tests and tooling**

- A reissue leaves the landing's demo link dead for up to thirty seconds. `apps/web/lib/demo-links.ts` remembers a successful `GET /api/demo/links` for 30 s, so the landing keeps handing out the code that was just retired until that memory expires. In the demo that is a visitor scanning the landing's QR and being told it is not valid; in the e2e suite it was a cross-spec hazard, now held off by `workers: 1` in `playwright.config.ts` plus the wait `e2e/admin.spec.ts` does before it finishes. A shorter memory, or dropping it when a table is reissued, fixes the product side — and would let the suite go parallel again.
- The e2e suite spends five of the ten sign-ins a minute the API allows one address, so two full runs inside a minute trip the limit and a test reads "Too many attempts. Wait a minute and try again." `retries: 1` makes it worse rather than better: a failed spec re-spends its sign-ins inside the same minute, so one flake retries straight back into the limiter. Fine for CI and for one local run; worth knowing before a sixth sign-in is added.
- `/admin` cannot be audited by Lighthouse, and the reason is the audit script's own redirect guard rather than anything about cookies: `scripts/lighthouse-audit.mjs` fails any page whose final path differs from the one requested, and `/admin` is a bare redirect onto `/admin/dashboard`. Auditing the door would need that guard to take a per-page expected destination. `/pay/<id>` is still not audited either (already on the M4 list): it needs a guest cookie and an order still waiting for payment.
- `e2e/admin.spec.ts` leaves the dish it adds on the menu; nothing cleans it up, so a stack that is never torn down grows one dish per run. Harmless — the name carries a timestamp and the hourly demo reset removes it — but it is state a test left behind.
- ~~No test asserts that a card's **text** appears on the QR sheet.~~ Closed in the Russian localisation milestone, and without the `compress: false` flag this entry proposed: `qr-pdf.test.ts` now reads the page back the way a PDF reader does — inflating the content stream and resolving each run's codes through its font's `/ToUnicode` CMap — so it asserts the characters a reader resolves rather than bytes that happen to be in the file. Deleting a `doc.text()` call now fails a test. The PDF route tests still hard-code the seed counts (12 and 11), so they still depend on every earlier test cleaning up after itself.
- Dashboard edges: `revenueCents ::int` overflows above 21.47M cents of daily revenue and `averageReadyMs` above about 24.8 days — both raise a Postgres error rather than return a wrong number, so this is liveness rather than correctness; a malformed `timezone` column value surfaces as a 500 rather than a clean envelope; the route's 401/403 tests assert `statusCode` without checking the error envelope; two unreachable bare `Error` throws bypass the `AppError` envelope; `asNumberConflict` returns `unknown` on a path where it always throws; the test helper `insertOrder` takes a `db` parameter that is always `ctx.db`, which is already in scope; and no DST-transition case is actually executed.
- The row-height test compares an `h-*` class against itself, both sides sourced from `ROW_LINE`, so it can only catch a deliberate override. Recorded as a decision rather than a defect: the brief mandated that exact form and jsdom does no layout, so the real assurance is the shared constant plus the 56 px line over the 44 px control.
- The `opens a new category at the end of the menu` test in `menu-table.test.tsx` did not assert placement when it was written — it checked only that a draft row opened. It asserts the sort order now, but the name is worth reading as a warning: a test named for a behaviour it does not check reads as coverage that is not there.
- There is no harness in this repository for rendering a Next server component, so a server component's own wiring can only be verified by running the stack. Two behaviour changes in the final M5 fix wave rest on that gap — the admin layout's `catch` around the restaurant-name lookup, and the landing page passing the demo notice through — and so do `kitchen/page.tsx`, `login/page.tsx` and all three admin pages, which have never had one. The halves that hold logic are tested; the wiring is not. A render harness would close all of it at once.
- `loadDemoLinks` decides between the landing's notice and the plain product page on `err.status === 404` alone rather than on the error code, so any other failure — a 500, a 503, or a 429 from the route's own limiter — now prints the API's sentence to a visitor. "Too many requests. Try again in a minute." is written for a client, not for someone looking at a landing page with no cards on it. Branch on the code.
- The per-route rate limits added in the final M5 fix wave bucket on the raw `Cookie` header (`apps/api/src/lib/staff-key.ts`, inherited from the transition route), so appending a junk cookie yields a fresh bucket. That bounds a runaway loop, which is what the presign and QR-sheet ceilings were for, but it does not bound the threat the presign limit was argued from: a holder of one stolen admin cookie can still fill the world-readable `menu/` prefix. `guestKey` shows the fix — unsign the cookie to a session id and bucket on that.
- `GET /api/tables/qr.pdf` is limited to 5/min per session, and `apps/api/src/routes/tables.test.ts` already makes two admin-cookie calls to it inside one bucket. Fine today; a third and fourth print test in that file would start failing as 429s rather than for their own reason.
- `packages/shared/src/api.test.ts` has a second import block from `./index` three hundred lines into the file. The lockfile now carries two majors each of `@noble/ciphers` and `@noble/hashes`, pulled in through `pdfkit`.

## Resolved in the final M5 fix wave

One pass over the whole branch before merge, from two reviews that found nothing critical. Listed here because most of these entries appeared on the lists above and would otherwise read as still open.

- `head()` read a missing `ContentLength` as `0`, so the 5 MB ceiling failed open on the one value it depends on. `StoredObject.size` is nullable and `checkUpload` refuses an unmeasured object with a reason of its own, deleting it like any other refusal. `ObjectStorage.exists()` went with it: it had no production caller since `checkUpload` subsumed it, which also answers the "`exists` calls `this.head`, so a destructured reference breaks" note.
- The presign route and `GET /api/tables/qr.pdf` each declare a rate limit — twenty and five a minute, keyed per signed-in browser through a shared `staffKey`, which `POST /api/orders/:id/transition` now uses instead of its own inline copy. `server.ts` sets `global: false`, so a route with no limit had none at all.
- `rush.ts` reads the restaurant's currency instead of writing `'USD'` into its payments row.
- `POST /api/payments/demo/complete` picks the newest pending attempt with `desc(createdAt), desc(id)`. Migration 0005 coarsened that column to milliseconds, so two attempts opened in the same millisecond were previously ordered by nothing.
- `isActive` is out of `MenuCategoryWriteSchema` and out of `createCategory`. The deactivate-a-category decision is listed above as deliberately unimplemented rather than left as a `PATCH` with no way back.
- `GET /api/demo/links` distinguishes "no demo data" (404) from "the demo restaurant is here but table 7 is not" (409), and filters on `isActive`, so an admin deactivating table 7 is seen. `apps/web/lib/demo-links.ts` degrades the landing to a plain product page only for the 404 and puts anything else on the page.
- The landing's Admin card points at `/login?demo=admin&next=/admin` and its copy describes the surface that now exists.
- A new dish opens past the last one rather than at the count of dishes, and neither Add control lets a discarded draft push the next one along.
- The admin layout's `/api/menu` call is guarded, so a 5xx on the restaurant-name lookup no longer takes all three admin screens to the error boundary.
- `aria-invalid` is true on an emptied price, number or seats field — the exact case that refuses the save — and the whole admin surface uses one convention for the attribute, behind `invalidAttr`. The tables screen's incomplete-save message names seats.
- `refusal()` takes the caller's verb, so a refused Deactivate and a refused Reissue QR no longer read "Couldn't save."
- `formatCents` has no default currency.
- `isPhotoKeyFor` has a table-driven unit test at the port level, over the shapes that would pass a `startsWith` check.
- `week-bars.test.tsx` no longer accepts `min-h-0` for the zero-day baseline; `playwright.config.ts` states `workers: 1` with the reason; `qrVersionOf` in `e2e/admin.spec.ts` reads an absent `v` claim as version 1, per ADR 0013.
- The Lighthouse gate audits `/admin/menu` and `/admin/tables` as well as the dashboard — six pages, still gated at 95 for accessibility.
- The MinIO images are pinned (`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`,
  `quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z`). They moved to quay.io on 2026-09-13: Docker Hub
  answers 404 for both repositories now, and the pull failure is instant and blames the commit
  rather than the registry.
- Documents: `design-system/tabletap/MASTER.md` no longer describes the `--spacing` override Task 1 deleted; ADR 0012 no longer claims the application keeps objects and rows in step, and names the scheduled reset; the README states what CI has actually run, describes `GET /api/tables`'s real guard, and leads with the redirect guard rather than an unverified claim about cookies.

## Deferred from M6

Noticed while building and reviewing the polish-and-portfolio branch. What M6 **closed** is struck
through where it stood on the lists above — the root containers, the missing `orders` index, the
single shared rate-limit bucket — rather than repeated here.

**Scope deliberately left for later milestones**

- **A shared store for rate limits and Socket.io rooms, and its trigger is a second instance.** Both
  are in-memory and therefore per process: two API instances never see each other's rooms, and each
  rate limit becomes per instance. One machine per app is what makes them correct today, so the
  trigger is precise — the day a second instance exists, they are wrong together. Redis is the
  obvious answer for both. Merged here from the M1 and M3 lists, which each held half of it
  ([ADR 0014](adr/0014-the-demo-is-public.md)).
- **The orphan sweep for unconfirmed uploads** stands, and the entry under _Deferred from M5_ carries
  the four ways to make one. M6 answered only the deployed half, by configuring no object storage and
  refusing uploads.

**The deployment**

- **Cold start on the first page after idle.** A free Render service stops without traffic, and the
  landing is `force-dynamic` and awaits `GET /api/demo/links` from the server, so the wait falls on
  the first _page_ rather than the first press: 34 s cold against 0.6 s warm, measured 2026-09-06.
  M6's answer is to say so in a line on the landing and in the README; a keep-alive ping was rejected
  because it games the tier it depends on and would stop the reset-on-boot from ever running. The
  fix that costs nothing is architectural rather than commercial: render the landing without the demo
  block and fetch the links from the browser, so the page paints at once and only the cards wait.
  That is a real change to a page whose first paint is the milestone's headline, which is why it is
  written down rather than done at the end of a milestone.
- **Vercel's edge runtime exposing `FORWARD_SECRET` to middleware is a platform fact nothing local
  can measure.** It was established that a non-`NEXT_PUBLIC` variable read in `middleware.ts` is read
  at runtime rather than inlined at build; whether the platform then supplies it to the edge function
  is a different claim. The failure mode is the silent one — no headers sent, one bucket, nothing to
  see — so check 5 in [the runbook](deploy.md) is the only thing that observes it, and it is marked
  non-skippable for that reason.
- **The middleware's degradation branch has no test and fails quietly.** With no secret it sends no
  headers and every visitor shares one bucket, which is the safe direction and the invisible one.
- **Local Compose is spoofable through the front door, and the earlier "closed" was measured against
  the back one.** Closing the API's published port answered a host-side caller writing its own
  `x-forwarded-for` straight at the API. The web's port 3000 is still published with no proxy in
  front; Next fills `x-forwarded-for` only when it is absent; `nearestHop` (`apps/web/middleware.ts`)
  takes the last entry with no check that it is shaped like an address; and `normalizeIP` returns a
  non-IP string unchanged. So a host-side caller sends whatever it likes, **the web signs it**, the
  API verifies the signature and keys on it — an unlimited supply of buckets, through the other door.
  An IP-shape check on `nearestHop` is worth having and bounds the key space, but it does not close
  this: under the relay hypothesis an attacker supplies valid addresses. What carries the property
  off a private network is the platform assumption check 5b in [the runbook](deploy.md) tests, not a
  shape check. Trigger: anything that can reach the Compose stack's web port, which today is the
  laptop it runs on.
- **The middleware does not strip an inbound `x-tt-visitor` before setting its own.** Verified inert
  in all four configurations — `Headers.set` replaces rather than appends when the secret is set, and
  the API ignores both headers when it is not — so this is defence in depth rather than a hole. Worth
  the one line so the property does not rest on a reader re-deriving it.
- **The sign-in rate limit has no `keyGenerator`.** `apps/api/src/plugins/auth.ts` declares ten a
  minute on `POST /api/auth/sign-in/email` and lets it key on the plugin default. It is the route
  [ADR 0014](adr/0014-the-demo-is-public.md)'s Context names by its symptom, and the one route the M6
  hardening did not convert while `guest/claim`, `demo/links`, `demo/rush` and `socket-token` all
  took `clientKey`. After the pivot it is not even per deployment: one bucket per Cloudflare edge
  node, shared between strangers and re-rollable by retrying. `clientKey` plus a test is the fix.
  Trigger: any credential-stuffing attempt against the deployed demo.
- **`docker-compose.yml` reads `FORWARD_SECRET` from the shell for the web (`${FORWARD_SECRET:-}`)
  and from `.env` for the API (`env_file`).** Harmless on the documented path, where `.env.example`
  is copied to `.env` and nothing is exported — but a value exported in a shell gives the two sides
  different secrets, and a mismatch fails as silently as an absent one: nothing verifies, everyone
  shares a bucket, no log line anywhere. The obvious fix is wrong: the same interpolation on the
  `api` service would resolve to `''` with the shell unset and override the `.env` value. Both sides
  should read one source.
- **`clientKey` leaves two staff browsers behind one NAT sharing a bucket.** `staffKey` and
  `guestKey` would split them but both fall back to the raw connection address when there is no
  cookie, which is the 401 path the sign-in limit most needs to count. Same limitation
  `POST /api/guest/claim` already carries.
- **Every browser call to `/api/*` now pays an edge-middleware invocation.** Cheap, and it is a cost
  the previous design did not have.

**The design system**

- **Two duration token families, with colliding names and different values.** `--duration-fast: 120ms`
  and `--duration-base: 180ms` are generated into `packages/ui/tokens.css` from
  `assets/design-tokens.json` and consumed as `duration-(--duration-fast)` by `button`, `badge`,
  `input`, `textarea` and `sheet`. M6 added `--motion-fast: 180ms`, `--motion-base: 280ms`,
  `--motion-stagger`, `--motion-ease` and `--motion-instant` **by hand** to `packages/ui/theme.css`,
  whose own first line says values live in the generated file. So the system has a "fast" that is
  120 ms and a "fast" that is 180 ms, in two files, one generated and one not — and `validate-tokens`
  cannot see the second, because it scans `apps/` and `packages/ui/src` only. Either family can be
  the one that survives; both cannot. No task owned it, because Task 3's brief did not mention the
  family that already existed. Trigger: the next component that wants a transition and has to choose
  a name, or the first reader who takes one "fast" for the other.

**Tests and tooling**

- **Web tests that drive `userEvent` time out at Vitest's 5000 ms default under Turbo saturation.**
  Roughly sixteen occurrences across this milestone, on unrelated and untouched files each time, and
  the signature is always the same line. It is not a defect in any of those tests: the worst offender
  measured **263 ms in isolation against over 5000 ms saturated**, and `--concurrency=1` passes the
  whole workspace. The honest fix is bounding test concurrency, not raising `testTimeout` — a raised
  timeout would hide a genuine regression, where a bounded runner hides nothing. It was first written
  down against one file in M4 and re-diagnosed most of a dozen times before being stated as a
  mechanism.
- **`pnpm e2e` and the Lighthouse audit are not in a task's own gate**, and a reviewer reads a diff.
  M6 shipped user-visible UI that broke two Playwright specs and nothing caught it; an unrelated task
  three tasks later ran e2e for its own reasons and found it. A task that adds user-visible UI should
  run e2e whether or not its brief names it.
- **The milestone's headline accessibility fix has no automated protection, and the two gaps that
  leave it open are complementary.** Nothing in CI's `check` job runs `next build`, and Tailwind v4
  emits nothing rather than erroring for a variant it cannot resolve, so a removed or mistyped `dark:`
  arbitrary variant compiles to no rule with every gate green. `packages/ui/src/tokens.test.ts`
  cannot cover it from the other side either: `fillOf`'s `(?:^|\s)bg-` prefix cannot match a
  `dark:bg-*` override, so it measures the light fill against the dark palette, where `inkOf` does
  honour the `dark:text-*` one. Neither gap covers the other, and the cooking badge returning to
  1.60:1 on the kitchen board would pass the whole suite. A grep of the emitted CSS in the
  `compose-e2e` job closes most of it — the M6 review caught one class by reading the built
  stylesheet in `.next` by hand, which is not something CI does. Trigger: the next edit to a `dark:`
  arbitrary variant, which is where the fix lives.
- **`ConnectionBanner` reserves the height of the shorter of its two strings.** The offline string is
  about 23% longer than the connecting one and wraps between roughly 360 and 430 px of viewport,
  which includes common phones, so an offline↔online transition shifts the page there — the shift the
  reserved band exists to prevent. **The one-word fix is wrong:** reserving `MESSAGE.offline` instead
  trades a rare shift for one on connecting→online, which runs on every load. Reserve the maximum of
  both.
- **The token validator's comment skip only skips a line whose trimmed text _starts_ with `//` or
  `/*`**, so a trailing comment or a JSDoc continuation line is scanned. Pre-existing, and it applies
  to the hex and px rules too; it now means prose that mentions a duration — "debounced by 300ms" —
  fails the gate. It tripped the very file that introduced the duration rule.
- Smaller: `menu/page.test.tsx` clears `localStorage` implying a reset that does not happen, since
  `Entrance` keys off a module-level `Set`; `connection-banner.test.tsx` couples an assertion to
  React Testing Library's cleanup timing across two renders in one test; `STATUS_STYLE` is public API
  purely so a test can read the real source rather than a copy; and two tests in
  `apps/api/src/plugins/demo-reset.test.ts` build the same config override verbatim (`:47` and `:89`).

**Documents and identity**

- `apps/web/app/icon.svg`'s comment names `mark.tsx` but not `apple-icon.tsx`. Not a gap in practice —
  the chain closes, because `icon.svg` points at `mark.tsx` and `mark.tsx` enumerates all three copies
  of the geometry — so it is only worth touching if someone is in that file anyway.
- [ADR 0004](adr/0004-api-behind-next-rewrite.md) still names a container host that is no longer the
  deployment target. Left as it stands on purpose: a decision record is history, and M6's own
  topology is in [ADR 0014](adr/0014-the-demo-is-public.md) and the M6 spec.

## Found on the live deployment, 2026-09-06

- **`TRUST_PROXY` does not cover Render's front, so the fallback rate-limit key drifts.** Render
  serves through Cloudflare, whose edge addresses are public and therefore outside
  `loopback,uniquelocal`; `proxy-addr` discards the forwarded chain and keys on the edge node, which
  differs from request to request. Signed traffic through the web's rewrite is unaffected - the
  signature decides the key and no proxy is trusted for it (verified live: a signed address is
  refused on the third request, an unsigned one is not). What degrades is the fallback, which is
  what a caller hitting the public API directly gets: instead of one bucket per caller it is one
  bucket per Cloudflare edge node, shared by strangers and re-rollable by retrying. The fix is not
  to trust Cloudflare's ranges by hand - they change - but to key the fallback on a header Render
  documents as trustworthy, or to accept the weaker fallback and say so. Trigger: any abuse of the
  public API that does not come through the rewrite.

## Found during the Russian localisation, 2026-09-14

- **The quantity stepper pushes the guest menu into a sideways scroll below about 338 px of
  viewport.** `apps/web/components/menu/dish-card.tsx:63` puts the price beside a `QuantityStepper`
  whose three 44 px targets and two gaps make it 128 px wide and unshrinkable, in a
  `justify-between` row with no `flex-wrap`, inside a text column that has already given 96 px to
  the plate. Measured in Chromium with a dish in the basket: the stepper's right edge lands at
  337.4 px whatever the viewport, so the document scrolls sideways by 17 px at 320 px, 9 px at
  328 px and 1 px at 336 px, and is clean from 344 px up. **At 375 px — the product's stated small
  breakpoint, and the width every other guest-surface guard is measured at — and at 1280 px there
  is nothing to see**, which is why Task 10 recorded it rather than fixing it inside a task scoped
  to those two widths. Russian is not the cause: the `ru-RU` price is wider than the `en-US` one it
  replaced, but the stepper's 128 px is the half that does not fit.

  **The two-line fix is not a two-line fix.** Adding `flex-wrap` to that row drops the stepper below
  the price under about 338 px, which makes the dish card taller there — and the dish card's height
  is exactly what `apps/web/app/menu/loading.tsx` reserves, deliberately, at the card's provable
  floor of 148.5 px. So the cheap repair reopens a measured deliverable from another task and lands
  in the same decision as the description-clamp arithmetic recorded in that file's own comment.
  Either change the row and re-derive the reservation with it, or leave both. Trigger: a decision to
  support phones narrower than 375 px, or any other reason to reopen the loading slot's arithmetic.

- **The order progress rail's «paid» label overflows its own track at 320 px, by one unbreakable
  word.** `apps/web/components/order/order-live.tsx`'s `OrderProgress` lays the five stages out on
  `grid grid-cols-5` — `minmax(0, 1fr)` tracks, no `gap` — each `li` sized to `288 / 5 = 57.6 px` at
  320 px. Every stage's label wraps inside that, except «Отправлен на кухню» (`paid`): its first
  word, «Отправлен» alone, is **61.47 px**, **3.88 px wider than the 57.59 px track it is in** (a
  live remeasure with the real classes and fonts; the `li` itself is `overflow: visible`). The
  excess paints over the neighbouring column rather than clipping or scrolling the page — document
  sideways scroll is still 0. `el.scrollWidth - el.clientWidth` on this `li` reads **2**, against 0
  on the four healthy stages: attenuated rather than blind, and the attenuation is arithmetic.
  `scrollWidth` grows only at the inline-end edge, so a centred label overhanging 1.94 px on each
  side is counted on one side only, and both figures are then rounded to whole pixels (58 and 60).
  Half the overflow, rounded — which is why the number above was taken from the line boxes and why
  a bare `scrollWidth - clientWidth` threshold is still the wrong instrument for a centred label. The audit's R11 entry says
  "verify at 320 px"; task-10-report.md §2 now carries this row, but no fix was made — the
  product's stated small breakpoint is 375 px, where the rail (including this stage) is clean.
  Trigger: a decision to support phones narrower than 375 px, or a redesign of the rail's label
  wrapping (e.g. `hyphens-auto`, or breaking longer stage words across a line on purpose).

- **IBM Plex Mono is named in the design documents and has never been loaded.** `next/font` registers
  PT Sans Narrow and IBM Plex Sans in `apps/web/app/layout.tsx` and nothing registers a mono face, so
  every `font-mono` site falls back to the system monospace. This predates the Russian localisation
  milestone and was not caused by it — found during that milestone's closing documentation sweep,
  which is the first time anyone read the design documents against the code that serves them. Two
  ways out and they are not equivalent: load the face, or stop naming it and let the design documents
  say what actually ships. Decide which before adding a third `font-mono` call site. Trigger: any
  work that touches numerals, timers or the money column, all of which the milestone moved to
  IBM Plex Sans with `tabular-nums` for a separate reason (the mono zero carries a dot the owner
  rejected) — so the question of what `font-mono` is even for is now open.
