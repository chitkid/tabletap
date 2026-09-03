# M2 Guest Flow + Demo Landing — Design Spec

Date: 2026-09-03. Status: implemented and merged into main on 2026-09-03 (final review clean after one fix wave; compose, e2e and Lighthouse verified in CI only once a remote exists).
Project: TableTap — QR table ordering with a real-time kitchen display (portfolio full-stack project).
Milestone: M2 of six. Builds on M1 Foundation (`docs/superpowers/specs/2026-09-02-m1-foundation-design.md`, merged into `main` on 2026-09-03). The master brief remains the permanent context; this spec covers M2 only.

## 1. Goal and scope

M2 makes the product visible: a guest scans the QR, sees the menu, fills a basket and places an order (no payment yet), and a recruiter can start the whole demo from a landing page.

In scope:
- Guest pages: `/t/<token>` (claim + redirect), `/menu`, basket sheet with a sticky bar, `/checkout`, `/orders/<id>`, `/session-ended`.
- Landing `/` with Demo mode: QR code and button for table 7, one-click staff sign-in buttons, product overview, hourly-reset notice.
- API: `GET /api/menu`, `POST /api/orders`, `GET /api/orders/:id`, `GET /api/orders`, `GET /api/demo/links`, demo reset scheduler.
- Migration 0001: `orders.number` (identity, unique) and the indexes deferred from M1. `restaurantId` added to `GuestPrincipal`.
- Deterministic dish illustrations (the M2 aesthetic risk) in `packages/ui`.
- Lighthouse audit script with an accessibility gate in CI; Playwright e2e "QR → order created".
- ADR 0006 and ADR 0007; spec, README and backlog updates.

Out of scope: payments and the `paid` transition (M4); Socket.io, kitchen board, order status changes, "Simulate rush" (M3); kitchen and admin screens (M3/M5); motion (M6); photo uploads (M5); Stripe test cards on the landing (M4).

## 2. Decisions from brainstorming

| Question | Decision |
|---|---|
| Reads vs mutations | Menu and order pages are Next.js server components that forward the `tt_guest` cookie to the API (`API_URL`) for the first render. Mutations (claim, place order, sign-in) go from the browser through the `/api/*` rewrite (ADR 0004). No Server Actions. Rejected: fully client-rendered guest app (worse LCP and audit on a slow phone). |
| Basket | Client-side, `localStorage` keyed by table id; cleared after a successful order. Rejected: server-side `draft` orders (extra API and state to reset; nobody moves a basket between devices). |
| Order creation | One transaction inserts the order as `placed` with `placed_at = now` and snapshots of name and price from the database. `draft` stays in the enum as a reserved value (ADR 0006). |
| Dish images | No photography. Each dish gets a deterministic SVG "plate" illustration generated from its category and name in the brand palette; a non-null `image_url` (M5) overrides it (ADR 0007). Owner's choice on 2026-09-03. |
| Demo staff sign-in | The landing links to `/login?demo=kitchen` and `/login?demo=admin`; the login page signs in with the seeded demo credentials returned by `GET /api/demo/links`. In M2 the user lands on the signed-in state of `/login`; M3 changes the target to `/kitchen`. |
| Demo reset | An in-process scheduler in the API (`DEMO_MODE=true`, `DEMO_RESET_INTERVAL_MINUTES`, default 60) runs the seed in reset mode. No external cron. |
| Time estimates | The order page shows an honest elapsed counter ("Placed 2 min ago"). No estimated minutes until M3 has kitchen data (brand voice: time is honest). |
| Public URLs | Added: `/t/<token>`, `/menu`, `/checkout`, `/orders/<id>`, `/session-ended`. Existing URLs unchanged. |

## 3. Visual direction and the aesthetic risk (`frontend-design`)

**Direction: a printed menu card.** Oat paper background (`--background`), dish names in the display grotesque, prices in tabular numerals, generous vertical rhythm, everything reachable with one thumb. The sticky basket bar sits at the bottom of the viewport; the basket opens as a bottom sheet. Kitchen and admin chrome are not touched in M2.

**The one risk: illustrated plates instead of photographs.** Every dish is drawn, not photographed: a circular plate with a composition that depends on the category kind (flatbread, bowl, side, drink) and a seed derived from the dish name, coloured only with brand tokens (ember, olive, oat, ink, night). Why it is worth it: it is honest (no stock photos pretending to be the kitchen's food), it costs zero network requests (helps the Lighthouse targets), it is consistent across twenty dishes, and it stays useful after M5 as the fallback for dishes without a photo. Why it is a risk: some viewers expect photos on a food menu; the mitigation is the M5 photo upload, which overrides the illustration per dish.

Implementation: `packages/ui/src/lib/plate-plan.ts` exports `planPlate(seed: string, kind: PlateKind): PlatePlan` — a pure function (mulberry32 PRNG from a string hash) returning a list of shapes (`circle | ellipse | arc | wedge | stroke`) with positions, sizes, rotations and a palette slot index. `packages/ui/src/components/plate.tsx` renders a `PlatePlan` as inline SVG (`role="img"`, `aria-label` = dish name) using CSS custom properties for fills (`--plate-*` aliases defined in `theme.css` from primitives; no hex in TSX). `kind` is derived from the category name (`Flatbreads → flatbread`, `Bowls → bowl`, `Sides → side`, `Drinks → drink`, anything else → `side`). On a dish card the plate is rendered with `decorative`, which hides it from the accessibility tree (`aria-hidden`, no `role` or `aria-label`), because the heading beside it already carries the dish name; the `Plate` component stays labelled by default.

## 4. Data and contracts

### 4.1 Migration 0001 (`packages/db`)

- `orders.number integer generated always as identity`, `unique` — the human-readable order number ("Order #42").
- Indexes: `orders(table_id)`, `orders(status)`, `order_items(order_id)`, `guest_sessions(expires_at)`, `audit_log(action)`.
- `GuestPrincipal` gains `restaurantId: uuid` (from the `tables.restaurant_id` join already used by `findActiveGuestSession`).

### 4.2 Shared contracts (`packages/shared/src/api.ts`, `menu.ts`, `orders.ts`, `errors.ts`)

```ts
MenuItemDto     = { id, categoryId, name, description, priceCents, allergens: Allergen[], isAvailable, imageUrl: string | null, sortOrder }
MenuCategoryDto = { id, name, sortOrder, items: MenuItemDto[] }
MenuResponse    = { restaurant: { id, name, currency }, categories: MenuCategoryDto[] }

OrderCreateRequest  = { items: { menuItemId: uuid, quantity: int 1..20 }[] (1..50, menuItemId unique), note?: string (trimmed, max 280) }
OrderItemDto        = { id, menuItemId, name, unitPriceCents, quantity, lineTotalCents }
OrderDto            = { id, number, status: OrderStatus, tableId, tableNumber, items: OrderItemDto[], subtotalCents, totalCents, note: string | null, placedAt: iso | null, createdAt: iso }
OrderResponse       = { order: OrderDto }
OrdersResponse      = { orders: OrderDto[] }
DemoLinksResponse   = { guest: { tableNumber: number, url: string }, staff: { role: StaffRole, email: string, name: string, password: string }[], resetsEveryMinutes: number | null }
```
New error codes: `ITEM_UNAVAILABLE` (409, details `{ unavailable: { menuItemId, name }[] }`), `CONFLICT` (409). `ErrorCode` grows accordingly.

### 4.3 API endpoints (`apps/api`)

| Method and path | Guard | Behaviour |
|---|---|---|
| `GET /api/menu` | `requireAction('menu.read')` | Active categories ordered by `sort_order` with all their items (unavailable ones flagged, never omitted) for the principal's restaurant (guest: `restaurantId`; staff: the single restaurant). |
| `POST /api/orders` | `requireAction('orders.create')`, rate limit 10/min keyed by `guestSessionId`, header `Idempotency-Key` (uuid, required → 400 otherwise) | Loads the requested items from the database (must exist, be available, belong to an active category of the guest's restaurant), copies name and price into `order_items`, computes `subtotal_cents = total_cents = Σ line totals`, inserts the order with `status = 'placed'`, `placed_at = now`, `guest_session_id`, `idempotency_key`, writes audit `order.placed` (actor guest, entity order, payload `{ number, totalCents, itemCount }`) — all in one transaction. Returns 201 `{ order }`. Same key from the same guest session → 200 with the existing order; same key from another session → 409 `CONFLICT`. Unknown item → 400 `VALIDATION_FAILED` (details list the ids); unavailable → 409 `ITEM_UNAVAILABLE`. |
| `GET /api/orders/:id` | `requireAuthenticated()` | Guest: 200 only when `order.guest_session_id` equals the principal's session, otherwise 403. Staff: any order (`orders.read.all`). 404 when missing. |
| `GET /api/orders` | `requireAuthenticated()` | Guest: orders of the current session, newest first. Staff: all orders newest first (M3 adds filters). |
| `GET /api/demo/links` | `config.public`, rate limit 30/min per IP | 404 `NOT_FOUND` unless `demoMode`. Otherwise: guest URL `${WEB_ORIGIN}/t/<token>` for table 7 (signed with `TABLE_TOKEN_SECRET`, TTL from config), the three seeded staff accounts with the demo password, and the reset interval. |

Guest scoping rules: the server never reads a table or restaurant id from the request body; it uses `request.principal`. Prices and names never come from the client.

### 4.4 Demo reset scheduler

`apps/api/src/plugins/demo-reset.ts`: when `demoMode` and `DEMO_RESET_INTERVAL_MINUTES > 0`, a `setInterval` calls `seed(db, { mode: 'reset', ... })` and logs the counts at `info`; cleared in `onClose`. Not started when `NODE_ENV === 'test'`; the scheduling function is exported and unit-tested with fake timers. The reset deletes orders and guest sessions, so a guest mid-order gets 401 on the next request and is sent to `/session-ended`.

### 4.5 Config additions

`DEMO_MODE` (`'true' | 'false'`, default `false`, derived boolean `demoMode`), `DEMO_RESET_INTERVAL_MINUTES` (int ≥ 0, default 60), `DEMO_PASSWORD` (already read by the seed; the API reads it too for `DemoLinksResponse`). `.env.example` and `docker-compose.yml` set `DEMO_MODE=true`. `NEXT_PUBLIC_APP_URL` becomes `metadataBase` in the web layout (deferred item from M1).

## 5. Web pages and states (`apps/web`)

Data access: `apps/web/lib/api.ts` — server side `apiFetch(path, { cookie })` targets `API_URL` and forwards the `tt_guest` cookie value; browser side `clientFetch(path, init)` calls `/api/...` on the same origin. Both parse the error envelope into a typed `ApiError`. A 401 on a guest page redirects to `/session-ended`.

| Route | Rendering | Content and states |
|---|---|---|
| `/t/[token]` | client | On mount `POST /api/guest/claim`; shows "Finding your table…" (`role="status"`); on 200 `router.replace('/menu')`. Errors: `TOKEN_EXPIRED` → "This QR code has expired. Ask staff for a new one."; `TOKEN_INVALID` → "This QR code is not valid."; `NOT_FOUND` → "This table is not available right now."; network → "Can't reach the server. Check the connection and try again." Each with a Retry button. |
| `/menu` | server + client islands | Header "Little Furnace · Table 7"; categories as sections with in-page anchor navigation; dish cards: plate illustration (or photo when `imageUrl`), name, description, price, allergens as text ("Contains gluten, dairy"), `Add` button (44 px) that turns into a quantity stepper (`−`/`+` with `aria-label`s); unavailable dishes rendered greyed with "Sold out today" and no button. Sticky bottom bar when the basket is not empty: "2 items · $26.00" and a "View basket" button opening the sheet. Skeleton with reserved heights while streaming. |
| Basket sheet | client | shadcn `Sheet` (bottom): lines with steppers and remove, subtotal, "Go to checkout" (primary) and "Keep browsing". Empty state: "Nothing in the basket yet." Focus trapped, `Esc` closes, returns focus to the bar. |
| `/checkout` | server (menu snapshot) + client form | Lines with quantities and totals (prices from the server-rendered menu snapshot), optional note (`textarea`, 280 chars, counter), "Place order" button with `submitting` state ("Sending to the kitchen…", `aria-busy`). Errors near the problem: `ITEM_UNAVAILABLE` marks the line "Sold out today. Remove it to continue."; validation → "Something in the basket is not right. Go back to the menu."; network → the standard message. Idempotency key generated once per visit (`sessionStorage`), reused on retry. Success: basket cleared, `router.replace('/orders/<id>')`. Empty basket → redirect to `/menu`. |
| `/orders/[id]` | server + client counter | "Order #42 sent to the kitchen." as the heading, table number, status badge (`--status-<status>` background, text always present), lines and total, note if any, elapsed counter "Placed 2 min ago" updated every 30 s inside an `aria-live="polite"` region, "Back to menu" link. 403/404 → the app's not-found page. |
| `/session-ended` | static | "Your session has ended. Scan the QR code on your table to start again." In demo mode also a link "Back to the demo". |
| `/` (landing) | server | Hero (product name, one sentence, no adjectives), three surface cards: Guest (QR SVG for table 7 + "Table 7 as a guest"), Kitchen ("Open the kitchen display" → `/login?demo=kitchen`), Admin ("Open the admin" → `/login?demo=admin`); "How it works" in four steps; stack list; "Demo data resets every hour" notice; footer link to the repository README. When `GET /api/demo/links` returns 404 (demo off) the cards show the product description without buttons. |
| `/login?demo=<role>` | client | `LoginForm` receives the demo credentials as props (fetched server-side from `/api/demo/links`); on mount it signs in once and shows "Signing in as Theo Baptiste…"; on failure it falls back to the normal form with the message. Without `demo`, unchanged from M1. |

Copy is in the brand voice throughout: "Anything else?" as the sheet's secondary prompt, "Order sent to the kitchen." as the confirmation, no exclamation marks, no emoji.

Basket store: `apps/web/lib/cart.ts` — pure functions `addItem`, `setQuantity`, `removeItem`, `clear`, `totals(cart, menuIndex)`, `count(cart)` over `{ items: Record<menuItemId, quantity> }`; persistence in `localStorage['tt-cart:<tableId>']` behind `useCart(tableId)` (`useSyncExternalStore`). Lines whose item is missing or unavailable in the current menu are shown with a warning and excluded from the order payload only when the guest removes them (the server is the final judge).

## 6. Accessibility and Lighthouse

Targets on the guest surface: Lighthouse accessibility ≥ 95 on `/` and `/menu` (DoD); performance reported with a target of ≥ 90 (gated in M6). Rules applied: every control labelled; steppers as buttons with `aria-label` "Add one more Margherita Flatbread" / "Remove one"; `aria-live="polite"` for the sticky bar count and the order status; heading order and landmarks (`main`, `nav` for categories); focus visible; 44 px targets with 8 px gaps; `touch-action: manipulation` on the stepper; `overscroll-behavior: contain` on the sheet; colour never the only carrier (status text, "Sold out today").

`scripts/lighthouse-audit.mjs` (pattern from the previous project): launches Chromium from Playwright (`playwright.chromium.executablePath()`) with `chrome-launcher`, fetches `GET /api/demo/links`, claims table 7 through the web origin to obtain the `tt_guest` cookie, audits `/` (no cookie) and `/menu` (cookie via `extraHeaders`) with the mobile preset, prints a table, writes `docs/lighthouse-results.json`, and exits non-zero when accessibility < `--min-a11y` (95). Root devDependencies: `lighthouse`, `chrome-launcher`. CI `compose-e2e` runs it after `pnpm e2e`.

## 7. Testing

TDD for all business logic, API routes, guards, the plate planner, the basket store, the checkout form, the demo sign-in behaviour and the scheduler. Exempt: migrations, config, presentational markup, the Lighthouse script.

- `packages/shared`: schema tests for the new DTOs and error codes; `planPlate` determinism (same input → same plan; different names → different plans; every shape within the viewBox; palette indices in range).
- `packages/db`: migration applies on PGlite; `orders.number` increments and is unique; indexes exist.
- `apps/api`: menu scoped and ordered, unavailable items flagged; order creation with prices from the database (a tampered `priceCents` in the body is ignored because the schema does not accept it), totals, `placed` status and `placed_at`, audit row, order number; unknown item 400; unavailable 409 with details; quantity bounds; idempotent replay 200 with the same order; other session 409; guest cannot read another session's order (403); staff can; list ordering; rate limit 11th request 429; demo links 404 when off, 200 with a verifiable token when on; scheduler calls the seed on the interval (fake timers) and stops on close.
- `apps/web`: basket reducer and totals; `useCart` persistence; `/t/[token]` states; checkout submit with `Idempotency-Key`, error mapping, redirect on success; demo auto sign-in signs in once and falls back on failure; elapsed counter formatting ("Just now", "1 min ago", "12 min ago").
- `e2e/guest-order.spec.ts`: open `/`, click "Table 7 as a guest", wait for `/menu`, add "Margherita Flatbread" twice and "House Lemonade" once, open the basket, go to checkout, add a note, place the order, expect the heading "Order #N sent to the kitchen." and the three lines. `e2e/staff-login.spec.ts` stays.
- Compose, e2e and Lighthouse run in CI (`compose-e2e`); locally only when Docker is present.

## 8. Process

- Worktree `feat/m2-guest-flow` from `main`; subagent-driven development with the M1 ledger pattern.
- Order of work: shared contracts and the plate planner → migration and `GuestPrincipal` → API menu → API orders → demo links and scheduler → web data layer, `/t/[token]`, `/session-ended` → then two independent web tracks in parallel (`dispatching-parallel-agents`, separate worktrees off the feature branch, merged back by the controller): guest pages (`/menu`, basket, `/checkout`, `/orders/[id]`) and landing (`/`, demo sign-in) → Lighthouse script, e2e, CI → ADRs and docs.
- ADR 0006: server-rendered guest reads with cookie forwarding, client-side basket, orders created as `placed`. ADR 0007: deterministic dish illustrations instead of photography.
- Quality gates unchanged from M1 plus the Lighthouse accessibility gate in CI.

## 9. Definition of Done

- `pnpm lint && pnpm typecheck && pnpm test && pnpm validate-tokens && pnpm exec prettier --check .` green locally; `pnpm e2e` and the Lighthouse audit green in CI (and locally once Docker exists).
- Lighthouse accessibility ≥ 95 on `/` and `/menu` recorded in `docs/lighthouse-results.json`.
- The demo works end to end from the landing: QR or button → menu → basket → checkout → order page; staff buttons sign in.
- ADR 0006 and 0007 written; README updated (demo walkthrough, new scripts, new env variables); `docs/backlog.md` updated; this spec's status line updated on merge.
- Code review with no open Critical or Important findings; Conventional Commits with the trailer; no TODO stubs.

## 10. Risks and fallbacks

- Docker and a GitHub remote are still absent on the development host: compose, e2e and the Lighthouse gate are verified only once the repository is pushed. The Lighthouse script can also be run locally against `pnpm dev` with a local Postgres when one exists.
- Lighthouse performance on a throttled mobile profile may land below 90 in M2 (fonts, first paint); only accessibility is gated now.
- Auto sign-in from `/login?demo=` posts the seeded credentials from the browser; they are public demo data by design and appear in the README already.
- The plate illustrations are the aesthetic risk; if they read as childish in review, the fallback is a quieter variant (fewer shapes, more oat) rather than photography.
