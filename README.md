# TableTap

TableTap is a QR table-ordering system for a single restaurant: a guest scans the code on the table, orders from their phone, and the kitchen sees the ticket appear in real time. It is a portfolio project built milestone by milestone, with the design pipeline, the tests and the infrastructure treated as part of the product rather than as an afterthought.

The demo tenant is **Little Furnace**, a neighbourhood wood-fired place — flatbreads, grain bowls, a short list of sides and drinks.

## Milestones

| Milestone                    | Scope                                                                                                                  | Status  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| M1 Foundation                | Monorepo, schema and migrations, staff auth, guest sessions, RBAC, shared contracts, design tokens, Docker Compose, CI | Done    |
| M2 Guest flow + demo landing | Menu, basket, order placement, illustrated dishes, demo landing with QR, hourly demo reset                             | Done    |
| M3 Kitchen display           | Socket.io, kitchen board, order-state enforcement                                                                      | Done    |
| M4 Payments                  | Payment port with a Stripe adapter and a demo terminal, signed webhook, idempotent settlement                          | Done    |
| M5 Admin                     | Menu CRUD, photo uploads, QR PDFs, dashboard                                                                           | Planned |
| M6 Polish + portfolio        | Motion, Lighthouse CI, deployment, case study                                                                          | Planned |

M2 makes the product visible: a guest scans the QR on the table, reads the menu, fills a basket and places an order. M3 closes the loop — the ticket is on the kitchen board in well under half a second, the kitchen moves it through the statuses, and the guest's phone follows along without a reload. M4 puts the money in the middle of it: an order is placed, then paid, and only a payment event sends it to the kitchen.

## Try the demo

Bring the stack up (Docker section below, or local development), then open <http://localhost:3000>.

1. **Landing.** Three cards — Guest, Kitchen, Admin — plus a QR code for table 7, a note saying how often the demo data resets, and one saying what paying costs here: "Payments run in demo mode: no card, no money.", or the Stripe test card when a key is configured.
2. **Become a guest.** Scan the QR with a phone on the same network, or click **Table 7 as a guest**. Either way you land on `/t/<token>`, which claims the table and forwards you to the menu.
3. **Menu.** Four categories, twenty dishes, each with its own drawn plate (ADR 0007). `Add` turns into a `−`/`+` stepper; sold-out dishes say "Sold out today" and cannot be added. A sticky bar at the bottom counts the basket.
4. **Basket.** **View basket** opens a bottom sheet: quantities, removals, subtotal, **Go to checkout**.
5. **Checkout.** Prices are re-read from the server, not from the basket. Add a note for the kitchen and press **Place order**.
6. **Order page.** "Order #42 is waiting for payment.", the table, a status badge, the lines, the note, and "Placed 2 min ago" ticking every 30 seconds. A **Pay $28.00** button sits under the headline.
7. **Pay.** The button opens a payment attempt and follows wherever the provider points. In demo mode that is `/pay/<order id>`, the restaurant's own terminal — the amount, a dead keypad, **Pay** and **Decline** side by side, and "This is a demo. No card, no money." Pay, and you land back on the order page reading "Order #42 sent to the kitchen."; decline, and it says "Payment declined. Try again." with the Pay button still there.
8. **Watch it cook.** The ticket is on the kitchen board the moment the payment settles. The status updates in place as the kitchen works it, and "Order #42 is ready." is announced when it is.

The two staff cards sign you in with one click: **Open the kitchen display** and **Open the admin** go to `/login?demo=kitchen` and `/login?demo=admin`, which sign in with the seeded credentials below. Since M3 the kitchen button lands on the board itself; the admin card still shows the signed-in state until M5. **Simulate rush** on the landing gives the board something to do without a second device.

Guest URLs added in M2: `/t/<token>`, `/menu`, `/checkout`, `/orders/<id>`, `/session-ended`. M3 adds the staff board at `/kitchen`, M4 the demo terminal at `/pay/<id>`. `/` is the landing page (M1's redirect to `/login` is gone).

The demo data is wiped and re-seeded every `DEMO_RESET_INTERVAL_MINUTES` (default 60). A reset deletes orders and guest sessions, so a guest who was mid-order gets sent to `/session-ended` on their next tap and starts again by scanning. Table ids are stable across resets, so the printed QR code and the basket kept under it both survive one. With `DEMO_MODE=false` the landing degrades gracefully — the same page without the QR code and without the sign-in buttons — and `GET /api/demo/links` answers 404.

## Kitchen display

`/kitchen` is a dark, full-bleed ticket board for signed-in staff, meant to be read from a metre away. An anonymous visit redirects to `/login?next=/kitchen`; a guest session is sent back to the landing.

**Three columns.** New (`paid` only — an order that is placed but unpaid belongs to the guest's phone, not to the pass), Cooking, Ready. The oldest ticket sits at the top of each column, because that is the order a cook works in; the newest carries an ember left edge so it is still easy to find, and the tab title counts the untouched ones — `(3) Kitchen · TableTap`. Served and cancelled tickets leave the board; there is no history view yet.

**Timers.** Each ticket shows elapsed time in mono digits, restarted at each step: waiting counts from `placedAt`, cooking from `cookingAt`, ready from `readyAt`. It ticks once a second and crosses two thresholds — warning at 5 minutes, late at 10 — which colour the timer and a thin rule at the top of the card. Colour is never the only carrier: the badge always says "5 min" or "late" and carries an icon.

**Bumping.** One control at the bottom edge of every ticket: **Start** on a New ticket, **Ready** on a Cooking one, **Served** on a Ready one, each naming its number in the accessible label ("Start #42"). New tickets also carry **Cancel** behind a confirm. The move is optimistic — the ticket shifts column immediately and the request follows. If another screen got there first the API answers 409 and the board says so: "Couldn't move #42. It is Cooking now.", then resyncs.

**Sound.** A **Sound** toggle plays a two-note chime when a ticket enters the New column — the moment the payment settles, not the moment the guest places the order, since an unpaid ticket is not work the kitchen can start. It is synthesized with the Web Audio API rather than shipped as an asset, and it is off until pressed, because browsers only allow audio after a gesture. The choice is remembered in `localStorage`.

**Simulate rush.** In demo mode a **Simulate rush** button sits in the board header and on the landing page. It asks `POST /api/demo/rush` to place twelve orders over sixty seconds through the same insert path a guest uses, from random tables with one to four dishes each, so a rush ticket is indistinguishable from a real one. A second rush while one is running is refused, and the button goes quiet for the length of the run. The hourly demo reset stops a running rush before it reseeds and then broadcasts `demo:reset`, which tells every open board and every guest order page to clear and subscribe again.

**How the live connection works.** The board asks `POST /api/socket-token` over the ordinary proxied REST path — where the session cookie is first-party — and gets back a 60-second JWT, typed `tt-socket` and signed with `SOCKET_TOKEN_SECRET`; a fresh one is minted before every connection attempt, reconnects included. The Socket.io handshake verifies that token, and the **server** puts the socket in its room from the token's principal — `kitchen` for staff, `session:<guestSessionId>` for a guest — so no client can ask to listen to somebody else's orders, and a tab left open on a table's last sitting goes quiet when the next party claims it. On connect the client emits `subscribe` and receives the whole board as a snapshot; the board merges it over what it holds rather than replacing it, so an order placed while the snapshot was being read is not erased by the snapshot that could not know about it. If the server cannot answer, it says so and the board keeps its tickets and retries. Between snapshots an event is ignored when its `updatedAt` is older than the copy the board holds, and every timer is measured against the server's clock rather than the screen's. When the connection goes, the board says so within seconds — it listens for the browser's own offline event, and the server's heartbeat (10 s interval, 5 s timeout) catches whatever the browser does not notice. The reasoning is in [ADR 0008](docs/adr/0008-realtime-delivery.md).

M3 let a cook start a placed order that nobody had paid for. That edge was deliberate, narrow and dated, and M4 removed it: `placed` now reaches only `paid` or `cancelled`, and `paid` has exactly one writer. See [ADR 0009](docs/adr/0009-interim-state-machine.md), now superseded by [ADR 0010](docs/adr/0010-payments-one-port.md).

## Payments

An order is placed, then paid, and only a payment event sends it to the kitchen. `paid` has exactly one writer — `settlePayment` in `apps/api/src/lib/payments.ts` — and it is reached from two places: the signed Stripe webhook, and the demo terminal's completion route. No role can set `paid` through the transition API, and the browser coming back from a payment page is treated as a hint rather than as evidence. The reasoning is in [ADR 0010](docs/adr/0010-payments-one-port.md).

**Two providers behind one port.** `PaymentProvider` (`apps/api/src/payments/types.ts`) is `createSession` plus `readEvent`, and that is the whole surface a processor gets. Which adapter runs is decided at boot and by configuration alone:

| `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` | Provider | What a guest sees                                                                       |
| ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| both set                                        | `stripe` | Stripe Checkout in test mode, and the landing shows the test card `4242 4242 4242 4242` |
| either empty                                    | `demo`   | The in-app terminal at `/pay/<id>`, and the landing says "no card, no money"            |

Setting one variable and forgetting the other resolves to `demo` — the deployment boots and takes no money. Check the landing's payment line, or `GET /api/demo/links`, which reports the resolved provider.

**The demo terminal** is the restaurant's own card machine, drawn honestly: the amount at display size, a dead keypad that is hidden from assistive technology because none of its keys is a control, and **Pay** and **Decline** side by side at the same weight. Where a bank page would put a card number, this one says "This is a demo. No card, no money." It is not a mock of the settlement — pressing Pay posts to `POST /api/payments/demo/complete`, which builds the same event shape the webhook carries and calls the same `settlePayment`, so the demo run exercises the idempotency guard, the amount check, the transaction and the socket broadcast that would carry a real payment. Every row it writes says `demo`. See [ADR 0011](docs/adr/0011-demo-payment-provider.md).

That route is registered only when the resolved provider is `demo` **and** `DEMO_MODE=true`. With Stripe configured it does not exist — not guarded, absent — because it grants `paid` to a guest-authenticated call, which is only acceptable where no money exists to move.

**Environment.**

| Variable                | Side | What it does                                                                                                                                             |
| ----------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`     | API  | Stripe API key. Optional; blank or unset counts as absent. Set together with the next one to run Stripe.                                                 |
| `STRIPE_WEBHOOK_SECRET` | API  | The signing secret the webhook verifies against (`whsec_…`, printed by `stripe listen`). Optional, and only meaningful with the key above.               |
| `DEMO_MODE`             | API  | Already documented under Demo mode. It also gates the demo completion route: `demo` provider with `DEMO_MODE=false` leaves an attempt nobody can finish. |

**Running Stripe locally.** Set both variables, then forward events to the API with the Stripe CLI:

```bash
stripe listen --forward-to localhost:4000/api/payments/webhook
```

It prints a `whsec_…` secret; that is `STRIPE_WEBHOOK_SECRET` for this session. The webhook takes its body as raw bytes inside its own Fastify scope — the signature covers what was sent, not what a parser rebuilt — and answers 200 for anything it accepts, including a replayed event and an amount that does not match the order, because any other status only makes Stripe retry something that will never change. Neither is silent: a replay is already recorded in `processed_events` from the delivery that did the work, and a mismatch writes a `payment.mismatch` audit row carrying both figures. A success for an order that is already paid — a guest who completed checkout twice — is answered the same way: the order is left alone, the attempt the event names is closed, and a `payment.overpaid` row records the amount and the payment id, so the second charge can be found without asking Stripe what an event id meant.

**Endpoints.**

| Method and path                    | Who                                 | What                                                                                                              |
| ---------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST /api/orders/:id/payment`     | the guest who owns a `placed` order | Opens an attempt and answers `{ url }` — Stripe's absolute checkout URL, or `/pay/<id>`. 10/min per guest cookie. |
| `POST /api/payments/webhook`       | the provider                        | Signature first, then `settlePayment`. 400 `SIGNATURE_INVALID` if it does not verify.                             |
| `POST /api/payments/demo/complete` | the guest, demo mode only           | `{ orderId, outcome: 'paid' \| 'declined' }`. Same settlement, synthetic event.                                   |

**Simulate rush** places orders that are already paid, with a `demo` payment row and a `payment.succeeded` audit line marked `source: 'rush'` — otherwise the narrowed New column would stay empty.

## Stack

- **Web** — Next.js 16 (App Router), React 19, Tailwind 4, shadcn components consumed from `@tabletap/ui`
- **API** — Fastify 5, Zod 4 via `fastify-type-provider-zod`, pino, better-auth 1.7 for staff sessions
- **Real-time** — Socket.io 4.8 on both ends, with the event map typed once in `@tabletap/shared`
- **Data** — PostgreSQL 17, Drizzle ORM 0.45, SQL migrations generated by drizzle-kit and committed
- **Tests** — Vitest 4 everywhere; the API and database tests run on PGlite (embedded Postgres, no Docker needed), Playwright 1.62 for the end-to-end smoke tests, Lighthouse 13 for the accessibility gate
- **Tooling** — pnpm workspaces via corepack, Turborepo, TypeScript strict, ESLint 9 flat config, Prettier
- **Infra** — Docker Compose (postgres, api, web), GitHub Actions

Architecture decisions are recorded in [`docs/adr/`](docs/adr/).

## Quick start with Docker

```bash
cp .env.example .env
docker compose up --build
```

- Web: <http://localhost:3000> — the demo landing
- API: <http://localhost:4000> — try <http://localhost:4000/health>

The API container applies the migrations and runs `seed --if-empty` before starting, so the demo data and the three staff accounts are there on first boot. `.env.example` sets `DEMO_MODE=true`, which is what puts the QR code and the sign-in buttons on the landing page.

**Honest caveat:** the repository still has no remote, so the `compose-e2e` job — which brings the stack up, runs the Playwright specs and then the Lighthouse audit against it — has never run in CI. It has now run locally: Docker arrived on the owner's machine on 2026-09-03, and M3 and M4 each exercised the whole sequence on 2026-09-04. If you hit a problem with Compose, e2e or the audit, an untested CI job is the likeliest reason.

**HTTPS deployments:** the Compose file defaults `COOKIE_SECURE` to `false`, because the local demo is served over plain HTTP while the container itself runs `NODE_ENV=production`. Behind TLS, set `COOKIE_SECURE=true` — otherwise session cookies are issued without the `Secure` flag. Left unset, the flag follows `NODE_ENV`.

**Behind a proxy or load balancer:** `TRUST_PROXY` (default `loopback,uniquelocal`) lists the peers whose `x-forwarded-for` the API believes. The rate limiter keys on the client IP it derives from that header, so a value that is too permissive lets a caller spoof its own address and slip the limit.

## Environment

`.env.example` documents every variable, and `cp .env.example .env` is a working local configuration. Four of them decide whether the real-time layer works at all (the payment pair is in the Payments section above):

| Variable                 | Side               | What it does                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SOCKET_TOKEN_SECRET`    | API                | Signs the 60-second Socket.io handshake token (HS256). At least 32 characters, and a different value from `TABLE_TOKEN_SECRET`: a QR table token must not open a socket, nor the reverse (ADR 0008). Required — the API refuses to boot without it.          |
| `NEXT_PUBLIC_API_ORIGIN` | Web, at build time | The API origin the browser opens the WebSocket against, because the Next.js rewrite cannot proxy one (ADR 0004). Baked into the bundle, so moving the API means rebuilding the web image; Compose passes it as a build arg. Default `http://localhost:4000`. |
| `WEB_ORIGIN`             | API                | CORS origin for REST and, since M3, for the socket server too, plus better-auth's `trustedOrigins`. Wrong here and the board cannot connect.                                                                                                                 |
| `API_URL`                | Web, at build time | Rewrite target for `/api/*` (ADR 0004). Unchanged in M3.                                                                                                                                                                                                     |

## Local development

Node 24 (anything `>= 22` works) and a Postgres to talk to.

```bash
corepack enable
pnpm install

cp .env.example .env
docker compose up -d postgres        # or point DATABASE_URL at any Postgres 17

pnpm db:migrate
pnpm db:seed -- --if-empty           # prints the twelve guest URLs it signs
pnpm dev                             # web on :3000, api on :4000
```

`pnpm test` needs none of that — the suite runs on PGlite in memory: 371 tests across the five packages (shared 44, db 16, ui 31, api 158, web 122).

## Scripts

Run from the repository root.

| Script                       | What it does                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                   | Runs every package's dev task through Turbo (web on :3000, api on :4000)                                                                                          |
| `pnpm build`                 | Builds every package                                                                                                                                              |
| `pnpm lint`                  | ESLint across the workspace                                                                                                                                       |
| `pnpm typecheck`             | `tsc --noEmit` in every package                                                                                                                                   |
| `pnpm test`                  | Vitest in every package, over PGlite                                                                                                                              |
| `pnpm e2e`                   | Playwright smoke tests against a running stack (`E2E_BASE_URL`, default <http://localhost:3000>)                                                                  |
| `pnpm lighthouse`            | Lighthouse audit of `/`, `/menu` and `/kitchen` against a running stack; `--base`, `--min-a11y` (default 95), `--out` (default `docs/lighthouse-results.json`)    |
| `pnpm tokens`                | Regenerates `packages/ui/tokens.css` from `assets/design-tokens.json`                                                                                             |
| `pnpm validate-tokens`       | Fails if `apps/` or `packages/ui/src` contains a raw hex, `rgb()`/`hsl()` or a px/rem value (0 and 1px excepted), Tailwind arbitrary values included              |
| `pnpm brand:sync`            | Rebuilds the `ember` / `olive` / `ink` primitive scales in `assets/design-tokens.json` from `docs/brand-guidelines.md`, then regenerates `packages/ui/tokens.css` |
| `pnpm db:generate`           | drizzle-kit: generates a migration from the schema                                                                                                                |
| `pnpm db:migrate`            | Applies committed migrations to `DATABASE_URL`                                                                                                                    |
| `pnpm db:seed -- --if-empty` | Seeds the demo data unless it is already there                                                                                                                    |
| `pnpm db:seed -- --reset`    | Wipes the demo data and re-seeds it in one transaction                                                                                                            |
| `pnpm format`                | Prettier over the repository                                                                                                                                      |

## Tests

`pnpm test` is the unit and integration suite: Vitest across the five packages, with the API and database tests on PGlite so nothing needs a container. The socket tests are the one place that does real I/O — they start the Fastify app on an ephemeral port and connect a real `socket.io-client`, which is the only honest way to show that a token-less handshake is refused, that a table token cannot open a socket, and that a guest of table 3 never receives table 7's events.

`pnpm e2e` runs Playwright against a running stack — six specs in three files:

- `e2e/guest-order.spec.ts` — a guest orders from the landing page's QR link and pays for it: the receipt says the order is waiting for payment, the terminal shows the amount and the disclaimer, and paying lands back on a receipt that says the kitchen has it. A second test declines instead and asserts the order is exactly where it was, with the Pay button still offering another attempt. A third checks that an expired QR code explains itself.
- `e2e/staff-login.spec.ts` — kitchen staff signs in through the same-origin API proxy and lands on the board; a wrong password shows the brand-voice message.
- `e2e/kitchen-live.spec.ts` — the milestone's definition of done, in two browser contexts at once. Context K signs in as kitchen and opens `/kitchen`; context G claims table 7 from the landing and places an order. While that order is unpaid the board must have no heading for it at all — an unpaid ticket was never on the pass, not merely gone from it. G then pays at the terminal; the test reads the order's `paidAt` from the API and records the wall-clock moment its ticket becomes visible in K, and the gap must be under 500 ms. K bumps the ticket through **Start** and **Ready**, and G's order page must say "Order #42 is ready." without a reload. Finally K goes offline and back online: the reconnect banner appears, then clears, and the board is compared against the orders in `GET /api/orders?active=1` that the board actually draws. The spec prints both numbers it measures.

On the local Compose stack that payment-to-kitchen latency measured **30–53 ms** across six runs against the 500 ms budget, and the offline banner appeared in **7–9 ms** — the browser's offline event, well inside the 20 s the spec allows for the heartbeat to notice instead.

## Lighthouse

`pnpm lighthouse` claims table 7 through the web origin and signs in as the demo kitchen account, then audits three pages on Lighthouse's mobile preset: `/` without a cookie, `/menu` as a real guest, and `/kitchen` as real staff. It prints a table, writes `docs/lighthouse-results.json`, and exits non-zero when accessibility falls below `--min-a11y` (95). Locally all three scored **100** for accessibility on the M4 branch, with performance 97 / 97 / 95 and a CLS of 0.04 on the board, since the server now renders each ticket's real elapsed time instead of `0:00` and the cards no longer grow on hydration. The demo terminal at `/pay/<id>` is not audited: it needs a guest cookie _and_ an order that is still waiting for payment, which the audit script does not set up. On the backlog.

That gate runs in CI, in the `compose-e2e` job, after the Playwright tests. `docs/lighthouse-results.json` is gitignored: it is written on every run and uploaded as a build artifact, not committed. Accessibility is the only gated category. Performance is measured and reported, and is gated in M6 — the board's first paint currently costs it some layout shift, since server-rendered tickets grow when their timers hydrate.

## Demo mode

The API exposes demo mode behind three variables:

| Variable                      | Default         | What it does                                                                                            |
| ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `DEMO_MODE`                   | `false`         | Gates `GET /api/demo/links` and the reset scheduler. `.env.example` and Compose set it to `true`.       |
| `DEMO_RESET_INTERVAL_MINUTES` | `60`            | Minutes between automatic re-seeds. `0` disables the scheduler and the landing says so.                 |
| `DEMO_PASSWORD`               | `tabletap-demo` | Password for the three seeded staff accounts. Read by the seed and returned by the demo-links endpoint. |

`GET /api/demo/links` is the only public endpoint added in M2 (300 requests a minute per IP, 404 when demo mode is off). The landing calls it from the Next server, so every visitor reaches the API as one address; the web tier caches a successful answer for 30 seconds and the limit is a runaway guard rather than a per-visitor budget. It returns a freshly signed guest URL for table 7, the three staff accounts with their password, and the reset interval — everything the landing page needs, and nothing that is not already in this README. The reset itself is an in-process `setInterval` in the API that runs the seed in `--reset` mode; it never starts under `NODE_ENV=test`.

## Demo accounts

Password for all three: `tabletap-demo` (override with `DEMO_PASSWORD` before seeding).

| Email                        | Name          | Role    |
| ---------------------------- | ------------- | ------- |
| `admin@littlefurnace.demo`   | Mara Quinn    | admin   |
| `kitchen@littlefurnace.demo` | Theo Baptiste | kitchen |
| `waiter@littlefurnace.demo`  | Jun Okafor    | waiter  |

Sign in at `/login`. There is no sign-up: staff accounts come from the seed until the admin surface arrives in M5.

## Project structure

```
tabletap/
  apps/
    api/                Fastify 5, Drizzle, better-auth, pino
      src/plugins/      auth, principal, rbac, route-guard, error-handler, demo-reset, demo-rush
      src/routes/       health, me, guest, tables, menu, orders, socket-token, payments, demo
      src/realtime/     Socket.io server: handshake, rooms, snapshot ack, broadcasts
      src/payments/     the PaymentProvider port and its two adapters (stripe, demo)
      src/lib/          orders, transitions, payments (the one writer of `paid`), order-events (the emitter the socket listens to), rush
    web/                Next.js 16 App Router, Tailwind 4, shadcn
      app/              / (landing), /login, /t/[token], /menu, /checkout, /orders/[id], /pay/[id], /session-ended, /kitchen
      components/       claim-table, menu/, basket/, checkout/, order/, pay/, landing/, kitchen/, login-form
      lib/              api client, socket, board store, timer thresholds, chime, guest cookie, basket store, money and elapsed formatting
  packages/
    db/                 Drizzle schema, migrations/, seed, migrate, PGlite test helper
    shared/             Zod schemas, roles and RBAC matrix, order transitions and rights, socket event map, table and socket tokens
    ui/                 tokens.css (generated), theme.css, shadcn components, plate illustrations
  assets/design-tokens.json     single source of truth for design tokens
  design-system/tabletap/       MASTER.md and the kitchen / admin page specs
  scripts/                      generate-tokens, validate-tokens, sync-brand-to-tokens, lighthouse-audit
  docs/                         brand guidelines, ADRs, design specs, backlog
  e2e/                          Playwright smoke tests (staff sign-in, guest order and payment, kitchen live)
```

`packages/shared` is browser-safe by default; Node-only helpers (the table-token signer) live behind the `@tabletap/shared/server` subpath, and an ESLint rule stops the web app importing it.

## Design pipeline

Colours, type and spacing have one source and flow one way:

```
docs/brand-guidelines.md  →  assets/design-tokens.json  →  packages/ui/tokens.css  →  the apps
```

- `docs/brand-guidelines.md` is the brand document. `pnpm brand:sync` reads its Quick Reference table and its Primary / Secondary / Accent colour sections and rewrites exactly three primitive scales in the token JSON — `ember`, `olive` and `ink`, per the role map at the top of `scripts/sync-brand-to-tokens.cjs`. Nothing else in the file is touched: the neutral primitives, the semantic layer, the dark block and the component layer are authored by hand and gated by the contrast test in `packages/ui/src/tokens.test.ts`. CI reruns the sync and fails on a diff.
- `assets/design-tokens.json` holds three layers — primitive (raw scales), semantic (`background`, `primary`, `status-*`, `timer-*`, …), component (`button`, `order-card`, `status-badge`, …). The semantic layer uses shadcn's variable names, so the components in `packages/ui` work unmodified.
- `pnpm tokens` emits `packages/ui/tokens.css`. With the hand-written `packages/ui/theme.css` those are the two stylesheets the apps consume. `tokens.css` is committed, and CI regenerates it and fails on a diff.
- `packages/ui/theme.css` is hand-written and small: it maps tokens into Tailwind's `@theme`, and defines the surface overrides — the kitchen board is the dark theme plus its own `--text-*` scale, so a `text-base` utility renders at 20 px there and nothing on the surface falls below 16 px; the admin surface is one `--spacing` override.
- `pnpm validate-tokens` and a WCAG contrast test in `packages/ui` both run in CI.

Regenerating after a brand change: edit `docs/brand-guidelines.md`, then `pnpm brand:sync && pnpm test && pnpm validate-tokens`. `brand:sync` regenerates `tokens.css` itself, so `pnpm tokens` is only needed after a hand edit to the semantic, dark or component layer.

## Docs

- [M1 design spec](docs/superpowers/specs/2026-09-02-m1-foundation-design.md) — scope, data model, API surface, definition of done
- [M2 design spec](docs/superpowers/specs/2026-09-03-m2-guest-flow-design.md) — guest flow, demo landing, contracts, states and copy
- [M3 design spec](docs/superpowers/specs/2026-09-03-m3-kitchen-display-design.md) — kitchen board, real-time delivery, transitions, demo rush
- [M4 design spec](docs/superpowers/specs/2026-09-04-m4-payments-design.md) — payment port, webhook, the demo terminal, the ADR 0009 removal
- [Architecture decisions](docs/adr/) — [0001 staff auth and guest sessions](docs/adr/0001-staff-auth-and-guest-sessions.md), [0002 signed table token in the QR](docs/adr/0002-signed-table-token-in-qr.md), [0003 PGlite tests and Compose e2e](docs/adr/0003-pglite-tests-compose-e2e.md), [0004 API behind the Next.js rewrite](docs/adr/0004-api-behind-next-rewrite.md), [0005 one token source, three surfaces](docs/adr/0005-one-token-source-three-surfaces.md), [0006 guest reads, basket and order placement](docs/adr/0006-guest-reads-and-orders.md), [0007 illustrated menu instead of photography](docs/adr/0007-illustrated-menu.md), [0008 real-time delivery](docs/adr/0008-realtime-delivery.md), [0009 the interim order state machine](docs/adr/0009-interim-state-machine.md), [0010 payments through one port, settled once](docs/adr/0010-payments-one-port.md), [0011 the demo payment provider](docs/adr/0011-demo-payment-provider.md)
- [Brand guidelines](docs/brand-guidelines.md) — palette, type, voice
- [Component state specs](docs/design/components.md) and [UX notes](docs/design/ux-notes.md)
- [Backlog](docs/backlog.md) — everything noticed and deliberately not done

Case study, live demo and screenshots arrive in M6.
