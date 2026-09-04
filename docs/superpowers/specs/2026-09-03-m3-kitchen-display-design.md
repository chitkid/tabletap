# M3 Kitchen Display — Design Spec

Date: 2026-09-03. Status: implemented on branch feat/m3-kitchen-display (2026-09-04); merge pending final review.
Project: TableTap — QR table ordering with a real-time kitchen display (portfolio full-stack project).
Milestone: M3 of six. Builds on M1 Foundation and M2 Guest flow + Demo landing (both merged into `main` on 2026-09-03). The master brief remains the permanent context; this spec covers M3 only.

## 1. Goal and scope

M3 closes the product loop: a guest places an order, the ticket is on the kitchen screen in under 500 ms, the kitchen moves it through the statuses, and the guest watches the progress on their phone without reloading.

In scope:
- `/kitchen`: a dark, full-bleed ticket board for signed-in staff. Three columns (New, Cooking, Ready), elapsed timers with the 5/10 minute thresholds, a new-order signal (ember edge, tab title count, optional chime), one bump control per ticket, a reconnect banner, a Simulate rush button in demo mode.
- Order transitions: `POST /api/orders/:id/transition` with rights per role and per target status, atomic against concurrent bumps, audited, broadcast.
- Real-time delivery: Socket.io on the API with rooms `kitchen` and `session:<guestSessionId>`, a 60-second socket token minted over REST (ADR 0004), a full snapshot on every connect and reconnect, typed events in `packages/shared`.
- Guest live status on `/orders/<id>`: the status changes in place; `ready` is announced prominently.
- Demo: `POST /api/demo/rush` streams twelve orders over sixty seconds; the hourly reset stops a running rush and tells every client to resync; the landing gets its Simulate rush button.
- Staff sign-in lands on `/kitchen`; `/login` accepts a same-origin `next` path.
- Migration 0002 (`orders.cooking_at`), `OrderDto` gains `updatedAt` and the per-status timestamps.
- The kitchen type scale becomes a real mechanism (the `--text-*` override deferred from M1).
- ADR 0008 and ADR 0009; spec, README, `pages/kitchen.md` and backlog updates; e2e in two browser contexts; `/kitchen` added to the Lighthouse audit.

Out of scope: payments and the `paid` transition (M4); a guest cancelling their own order (`orders.cancel.own` exists, the endpoint waits — backlog); waiter and admin screens (M5); motion beyond the CSS the board needs (M6); a Redis adapter for multi-instance Socket.io (M6, deployment); push notifications; order history on the board (served and cancelled tickets leave it).

## 2. Decisions from brainstorming

| Question | Decision |
|---|---|
| Real-time shape | Socket.io pushes, REST mutates, a snapshot replaces local state on every connect. RBAC, validation, rate limits and idempotency stay in one place (the routes); the socket only delivers. Rejected: mutations over the socket with acks (duplicates the guard stack); SSE or polling (the brief names Socket.io, and SSE does not survive the Vercel rewrite). |
| State machine in M3 | `placed → cooking` is allowed for as long as there is no payment (owner's decision, ADR 0009). M4 removes that edge and restores the brief's `placed → paid → cooking`; one line in `ORDER_TRANSITIONS` plus its tests. |
| Rights per role | `TRANSITION_RIGHTS` in `packages/shared`: kitchen may set cooking, ready, served, cancelled; waiter may set served, cancelled; admin may set all four. Nobody sets `paid` through the API (the M4 webhook will). A transition passes three checks in order: `can(role, 'orders.transition')`, the role's right to the target status, `canTransition(from, to)`. |
| Concurrent bumps | The update is `UPDATE orders SET … WHERE id = $1 AND status = $from`. Zero rows means somebody else moved it first: reload and answer 409 `INVALID_TRANSITION` with the current status. |
| Socket authentication | `POST /api/socket-token` returns a 60-second HS256 JWT (`typ: tt-socket`) signed with its own `SOCKET_TOKEN_SECRET`. The client asks for a fresh token before every connection attempt. The handshake verifies it, stores the principal on the socket and joins the rooms itself: staff → `kitchen`, guest → `session:<guestSessionId>`. Clients never name a room. The backlog recommendation to extract `resolvePrincipal` for the handshake is withdrawn: the token is minted by a route that already has the principal. |
| Resync | The client emits `subscribe`; the ack carries the snapshot (active orders for staff, the session's orders for a guest) and the server time, or `null` when the server cannot answer. Sent on every connect, including reconnects. Events apply only when their `updatedAt` is newer than the local copy, and a snapshot is merged rather than swapped in (§4.4). |
| Optimistic UI | A bump moves the ticket at once, then posts. On error the ticket returns to the state in the server's answer and the board says so ("Couldn't move #42. It is Cooking now."). |
| New-order signal | An ember left edge until the ticket is first touched, plus a count in the tab title. Sound is a short synthesized chime (Web Audio, no asset) behind a Sound toggle, because browsers require a gesture; the choice persists in `localStorage`. |
| Timers | New tickets count from `placedAt`, cooking from `cookingAt`, ready from `readyAt`. Thresholds at 5 and 10 minutes use the `timer-ok/warn/late` tokens. One-second tick, `tabular-nums`. |
| Board columns | New (placed and paid, the status chip tells them apart), Cooking, Ready. Oldest ticket at the top of each column; the newest carries the ember edge so it is still easy to find. `pages/kitchen.md` moves from four columns to three and from newest-first to oldest-first. |
| Simulate rush | `POST /api/demo/rush`: demo mode only, public with a rate limit and a server-side single flight. Twelve orders over sixty seconds through the same insert path guests use, from the system actor, random seeded tables and one to four available dishes each. The hourly reset stops a running rush and broadcasts `demo:reset`. Buttons on the landing and in the board header. |
| Staff sign-in | `/login` accepts `next`; the default for staff is `/kitchen`. The landing's Kitchen and Admin cards lead there until M5. An anonymous `/kitchen` redirects to `/login?next=/kitchen`. |
| Guest live status | `/orders/<id>` subscribes to `session:<guestSessionId>`; the status updates in place and `ready` is announced ("Order #42 is ready."). After a demo reset the page says the order was cleared. |
| Kitchen type scale | `[data-surface='kitchen']` overrides Tailwind's `--text-*` scale so utilities render body at 20 px and nothing under 16 px. Closes the M1 backlog item. |
| Public URLs | Only `/kitchen`, reserved in the M1 spec. No other change. |

## 3. Visual direction and the aesthetic risk (`frontend-design`)

**Direction.** As `design-system/tabletap/pages/kitchen.md` sets it: a dark, full-bleed board with no chrome, read from a metre away, sometimes through steam. Ink Dark ground, Ink cards, Oat text, Ember Light as the single accent.

**The one risk: the timer is the ticket's headline.** After the table number, elapsed time is the largest element on a ticket (28 px mono), and the ticket's top rule follows the timer threshold: ok, warning at 5 minutes, late at 10. A cook scanning the board reads urgency before reading anything else. Why it is worth it: the board exists for the queue, not for the cards. Why it is a risk: three coloured rules on a dark ground can compete with the ember edge of a new order. Mitigation: the new-order cue is the left edge only, the threshold colours only the timer and a thin top rule, and colour is never the only carrier: the timer badge always carries its label ("5 min", "late") and an icon.

## 4. Data and contracts

### 4.1 Migration 0002 (`packages/db`)

- `orders.cooking_at timestamptz null`. The other per-status timestamps (`paid_at`, `ready_at`, `served_at`, `cancelled_at`) already exist.
- No new indexes: the active-orders query filters one restaurant by `status`, which `orders_status_idx` covers.

### 4.2 Shared contracts (`packages/shared`)

`orders.ts`:
```ts
ORDER_TRANSITIONS.placed = ['paid', 'cooking', 'cancelled']   // 'cooking' is the M3 interim edge (ADR 0009)
ACTIVE_ORDER_STATUSES = ['placed', 'paid', 'cooking', 'ready']
TRANSITION_RIGHTS: Record<StaffRole, readonly OrderStatus[]> = {
  kitchen: ['cooking', 'ready', 'served', 'cancelled'],
  waiter:  ['served', 'cancelled'],
  admin:   ['cooking', 'ready', 'served', 'cancelled'],
}
canRoleTransition(role: StaffRole, from: OrderStatus, to: OrderStatus): boolean
  // TRANSITION_RIGHTS[role].includes(to) && canTransition(from, to)
```

`api.ts`:
```ts
OrderDto += { updatedAt: iso, cookingAt: iso | null, readyAt: iso | null, servedAt: iso | null, cancelledAt: iso | null }
TransitionRequest   = { to: OrderStatus }
SocketTokenResponse = { token: string, expiresInSeconds: number }
RushResponse        = { started: true, durationSeconds: number, ordersPlanned: number }
OrdersQuery         = { active?: '1' }
```

`errors.ts`: new code `INVALID_TRANSITION` (409, details `{ from, to, current }` where `current` is the status the order has now).

`events.ts` (the typed Socket.io map, empty since M1):
```ts
ServerToClientEvents = {
  'order:created': (payload: { order: OrderDto }) => void
  'order:updated': (payload: { order: OrderDto }) => void
  'demo:reset':    () => void
}
ClientToServerEvents = {
  subscribe: (ack: (snapshot: BoardSnapshot | null) => void) => void   // BoardSnapshot = { orders: OrderDto[]; serverTime: string }
}
```
`null` means "no answer this time" — a failed read or a throttled resubscribe. It is deliberately not an empty snapshot: a client reads a snapshot as the whole truth, so `{ orders: [] }` would clear every open board at once.

`server/socket-token.ts` (next to `table-token.ts`):
```ts
SocketPrincipal =
  | { kind: 'staff'; userId: string; role: StaffRole; restaurantId: string }
  | { kind: 'guest'; guestSessionId: string; tableId: string; tableNumber: number; restaurantId: string }
signSocketToken(principal: SocketPrincipal, opts: { secret: string; ttlSeconds: number }): Promise<string>
verifySocketToken(token: string, opts: { secret: string }): Promise<SocketPrincipal>   // throws TOKEN_INVALID / TOKEN_EXPIRED
```
Header `typ: 'tt-socket'`; a table token (`typ: 'tt-table'`) or a token signed with the wrong secret fails verification.

### 4.3 API endpoints (`apps/api`)

| Method and path | Guard | Behaviour |
|---|---|---|
| `POST /api/orders/:id/transition` | `requireAction('orders.transition')` | Body `TransitionRequest`, validated in the handler after the guard (same reason as `POST /api/orders`; `GET /api/orders/:id` moves its `params` check into the handler too, so a malformed id answers 401 before 400 on every order route — closes the M2 backlog item). Checks the role's right and the machine, updates atomically, stamps the target's timestamp column and `updated_at`, audits `order.transition` (`actorType: 'user'`, payload `{ from, to, number }`), emits `order:updated`. 200 `{ order }`. 404 if the order is not in the staff member's restaurant. Rate limit 60/min keyed on the better-auth session cookie (an opaque string at `onRequest`, before any principal exists), else ip. |
| `GET /api/orders?active=1` | `requireAuthenticated()` | Staff: active orders (`ACTIVE_ORDER_STATUSES`) for the restaurant, oldest `placedAt` first, limit 200. Guest: unchanged (own orders). |
| `POST /api/socket-token` | `requireAuthenticated()` | `SocketTokenResponse`, `expiresInSeconds: 60`. Staff `restaurantId` from `restaurantIdFor`. Rate limit 30/min per ip. |
| `POST /api/demo/rush` | `config.public`, demo mode | 404 outside demo mode. 409 `CONFLICT` while a rush is running. Otherwise starts one and answers `RushResponse` at once. Rate limit 2/min per ip. |

### 4.4 Realtime layer (`apps/api/src/realtime`)

- `lib/order-events.ts`: `OrderEvents`, a typed `EventEmitter` decorated as `app.orderEvents`, with `order:created`, `order:updated` (payload `InternalOrderDto`) and `demo:reset`. `createOrder`, the transition service and the rush generator emit into it; nothing else knows about sockets. Tests assert on the emitter without opening a socket.
- `realtime/server.ts`: `attachRealtime(app)` creates `new Server<ClientToServerEvents, ServerToClientEvents>(app.server, { cors: { origin: WEB_ORIGIN }, serveClient: false, pingInterval: 10_000, pingTimeout: 5_000 })`, registered as a plugin after the routes; `app.addHook('onClose')` disconnects the sockets and closes it. The heartbeat is faster than engine.io's 25 + 20 second defaults so a board that loses its connection notices in seconds rather than in three quarters of a minute. Handshake middleware reads `socket.handshake.auth.token`, verifies it, stores the `SocketPrincipal` in `socket.data` and joins `kitchen` (staff) or `session:<guestSessionId>` (guest). A missing, expired or wrong-typed token rejects the connection with the error code (`TOKEN_INVALID`, `TOKEN_EXPIRED`).
- The guest's room is the session rather than the table (ADR 0008, owner's decision 2026-09-04). A table changes hands; a phone left open on the last sitting must not keep receiving the next party's order lines.
- `subscribe` answers through the ack with the snapshot: staff get the active orders of their restaurant, guests get their session's orders. `serverTime` is stamped **before** the read, so a client can tell an order committed during the query from one the query proves gone; the client merges the snapshot over what it holds rather than replacing it, keeping any active order the snapshot never saw. A failed read logs and acks `null`, as does a subscribe arriving less than a second after the last one on the same socket (a socket message never reaches `@fastify/rate-limit`). The ack is the only client-to-server message; anything else is ignored.
- Broadcast: an `order:*` event strips `guestSessionId` (`OrderDtoSchema.parse`) and goes to `kitchen`, plus `session:<order.guestSessionId>` when the order has one — a rush order has none and reaches the kitchen only. The listener is wrapped: it runs inside the request that committed the row, so a throw would answer 500 for a write that already happened. `demo:reset` goes to every socket.
- In-memory adapter only. A multi-instance deployment needs a Redis adapter (backlog, M6).

### 4.5 Transition service (`apps/api/src/lib/transitions.ts`)

```ts
transitionOrder(db, events, input: { orderId; to: OrderStatus; actor: StaffPrincipal; restaurantId; now? })
  : Promise<InternalOrderDto>
```
Load the order (404 unless it belongs to `restaurantId`), check `canRoleTransition(actor.role, order.status, to)` (403 when the role lacks the right, 409 `INVALID_TRANSITION` when the machine forbids it), then in one transaction: `UPDATE … WHERE id AND status = from` with `<to>_at = now, updated_at = now` (`cancelled` writes `cancelled_at`; `paid` is unreachable here), zero rows → reload and throw 409 `INVALID_TRANSITION { from, to, current }`; audit; commit; emit `order:updated` after commit; return the hydrated DTO.

### 4.6 Rush generator (`apps/api/src/lib/rush.ts`, `plugins/demo-rush.ts`)

`createRush({ db, events, log, durationMs: 60_000, count: 12 })` returns `{ start(): boolean; stop(): void; running: boolean }`. `start` schedules `count` timers spread evenly over `durationMs` with ±1 s jitter; each fires `placeSystemOrder`: a random table of the demo restaurant, one to four random available dishes with quantities one to three, one of six fixed notes on every third order, idempotency key `rush:<uuid>`, actor `system`, audit payload `{ source: 'rush' }`, then `order:created`. The insert path is the one `createOrder` uses, extracted into `insertPlacedOrder(tx, …)` so a rush ticket is indistinguishable from a guest ticket. The plugin decorates `app.rush`; the demo reset scheduler calls `app.rush.stop()` before reseeding and emits `demo:reset` after. Timers are `unref`'d so they never hold the process open.

## 5. Web (`apps/web`)

- `lib/socket.ts`: `createSocket()` → `io(NEXT_PUBLIC_API_ORIGIN, { autoConnect: false, auth: (cb) => fetch a fresh token via clientFetch('/api/socket-token') then cb({ token }) })`, typed `Socket<ServerToClientEvents, ClientToServerEvents>`. `NEXT_PUBLIC_API_ORIGIN` is the browser-facing API origin (dev and Compose: `http://localhost:4000`); it is a build-time value like every `NEXT_PUBLIC_*`, so Compose passes it as a build arg next to `API_URL`.
- `lib/board-store.ts`: pure functions `applySnapshot(orders)`, `applyEvent(state, order)` (older `updatedAt` ignored; non-active statuses removed), `columnsOf(state)` → `{ new, cooking, ready }` sorted oldest first, `nextStatusFor(status)` → `cooking | ready | served`.
- `lib/timer-threshold.ts`: `thresholdFor(elapsedMs): 'ok' | 'warn' | 'late'` at 5 and 10 minutes; `formatTimer(ms)` → `m:ss`.
- `lib/chime.ts`: two sine notes (880 Hz then 1320 Hz, 120 ms each, short gain envelope) on an `AudioContext` created by the toggle's click.
- `app/kitchen/layout.tsx`: wraps children in `<div data-surface="kitchen" className="min-h-dvh bg-background text-foreground">` (the dark token override and the type scale both hang off the attribute).
- `app/kitchen/page.tsx` (`force-dynamic`): reads the staff session through `GET /api/me`; anonymous → `redirect('/login?next=/kitchen')`; guest principal → `/`; loads `GET /api/orders?active=1` and demo mode (`fetchDemoLinks()` non-null) for the first render; renders `<KitchenBoard initialOrders demoMode />`.
- `components/kitchen/kitchen-board.tsx` (client): store + socket lifecycle (`connect` → `subscribe` → snapshot; `order:*` → `applyEvent`; `demo:reset` → resubscribe; `disconnect` → banner), tab title `(n) Kitchen` for untouched new tickets, sound toggle, rush button, three columns as `role="list"` regions labelled New / Cooking / Ready, connection banner as `role="status"`.
- `components/kitchen/ticket-card.tsx`: heading "Table 7 · #42" (table number at 32 px display, order number beside it), timer badge (28 px mono, threshold colour + label + icon), item lines ("2 × Margherita Flatbread", 22 px), note (18 px), `StatusBadge`, the bump button at the bottom edge ("Start" for New, "Ready" for Cooking, "Served" for Ready; all with the ticket number in the accessible name, e.g. "Start #42"), and a "Cancel" secondary action on New tickets behind a confirm. Ember left edge while untouched.
- `components/kitchen/{elapsed-timer,sound-toggle,connection-banner,rush-button}.tsx`.
- `components/order/order-live.tsx` (client, mounted by `/orders/[id]`): subscribes, replaces the status and timestamps in place, renders "Order #42 is ready." as an `aria-live="assertive"` region when the status becomes `ready`, and "This order was cleared by the hourly demo reset." when a resync no longer contains it.
- `/login`: `next` is accepted only as a same-origin path (`^/(?!/)`), default `/kitchen` for staff; the form replaces the "Signed in as" card with `router.replace(next)` once the session resolves. The landing keeps `/login?demo=kitchen` and `/login?demo=admin`.
- Landing: `RushButton` next to the Kitchen card copy: "Simulate rush" → on success "12 orders over the next minute. Open the kitchen screen to watch." → disabled for 60 s.
- `packages/ui/theme.css`: `[data-surface='kitchen']` sets the `--text-*` scale so that `text-xs` is 16 px, `text-sm` 18 px, `text-base` 20 px, `text-lg` 22 px, `text-xl` 28 px, `text-2xl` 32 px, with line heights per `pages/kitchen.md`. The contrast test and the token validator stay the gate.

## 6. Security (part of the portfolio)

- Every socket connection carries a principal or is rejected; rooms are assigned server-side from that principal, so a guest can only ever receive its own session's events and staff only the kitchen feed. A guest cannot subscribe to another session by any client-side means, and a session ends where the sitting does: when a table is claimed again the new party is a new room, so the tab left open on the old one goes quiet.
- The socket token is short-lived (60 s), typed (`tt-socket`) and signed with a dedicated secret, so a QR table token cannot open a socket and vice versa.
- `orders.transition` is checked per role and per target status on the server; the machine rejects invalid edges; the update is atomic against concurrent bumps; every transition is audited with its actor.
- `guestSessionId` and `restaurantId` never appear in an order payload and never reach another client: every broadcast and snapshot passes through the public `OrderDtoSchema`. The socket token carries the guest's own session id as its subject, which that browser already holds in its signed `tt_guest` cookie; it is an addressing identifier for that one browser, not a credential, and no other client ever sees it.
- Rate limits: transition 60/min per user, socket-token 30/min per ip, rush 2/min per ip plus a server-side single flight.
- The socket server's CORS origin is `WEB_ORIGIN`, as for REST.

## 7. Testing

Unit and integration (Vitest, PGlite):
- shared: `TRANSITION_RIGHTS` × `ORDER_TRANSITIONS` table test (every role, every edge), `ACTIVE_ORDER_STATUSES`, socket token sign/verify, wrong `typ` and wrong secret rejected, contract schemas.
- api: transition endpoint (rights per role, invalid edge 409 with `current`, unknown order 404, other restaurant 404, audit row, emitted event); two concurrent bumps of one ticket: one 200, one 409; `GET /api/orders?active=1` ordering and limit; socket handshake with a real `socket.io-client` against the test app on an ephemeral port (valid token joins and receives the snapshot; missing, expired and table-typed tokens are refused; a guest of table 3 does not receive table 7's events, and a party that has left table 7 does not receive the next party's; a failed read acks `null` and a resubscribe loop is throttled; staff receive both); rush with fake timers (twelve orders in sixty seconds, single flight 409, `stop()` cancels the rest, reset emits `demo:reset`).
- web: board store (snapshot replaces, stale event ignored, served ticket leaves), `thresholdFor`, `formatTimer`, ticket card (bump button names, threshold label and icon present), sound toggle persistence, `next` validation on the login page, `OrderLive` status swap and the ready announcement.

E2E (Playwright, against Compose, two browser contexts):
- `e2e/kitchen-live.spec.ts`: context K signs in as kitchen and lands on `/kitchen`; context G claims table 7 from the landing, adds one dish and places the order; the test reads `placedAt` for that order from the API in context G and records the wall-clock moment the ticket "Table 7 · #N" becomes visible in K; asserts `visibleAt − placedAt < 500 ms`. K presses Start then Ready; G's order page shows "Order #N is ready." without a reload. Then K goes offline (`context.setOffline(true)`): the banner appears; back online: the banner clears and the board matches `GET /api/orders?active=1`.
- `e2e/staff-login.spec.ts` gains the redirect to `/kitchen`.

Lighthouse (`scripts/lighthouse-audit.mjs`): `/kitchen` is audited with a kitchen session cookie obtained through `POST /api/auth/sign-in/email` (with the `origin` header) and must clear a11y ≥ 95 like the guest pages.

Full gate before merge: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm validate-tokens`, plus Compose, e2e and Lighthouse on the owner's machine and in CI.

## 8. Environment and infrastructure

- API: `SOCKET_TOKEN_SECRET` (min 32 chars, required). `.env.example` documents it; Compose reads it from `.env`.
- Web: `NEXT_PUBLIC_API_ORIGIN` (build time; `.env.example` default `http://localhost:4000`; `Dockerfile.web` takes it as a build arg with the same default; Compose passes it).
- Dependencies: `socket.io` (API) and `socket.io-client` (web), same 4.8 line, exact versions pinned by the plan.
- CI: unchanged jobs; `compose-e2e` now runs the two-context spec.

## 9. Documents

- ADR 0008 "Real-time delivery: Socket.io rooms, token handshake, snapshot on connect".
- ADR 0009 "Interim order state machine until payments exist" (the `placed → cooking` edge and the M4 obligation to remove it).
- `design-system/tabletap/pages/kitchen.md`: three columns, oldest first, the `--text-*` mechanism now shipped.
- README: kitchen screen section, Simulate rush, `SOCKET_TOKEN_SECRET` and `NEXT_PUBLIC_API_ORIGIN`.
- `docs/backlog.md`: guest cancel endpoint, Redis adapter, waiter surface; items closed by M3 (kitchen type scale, orders 400/401 order, `resolvePrincipal` extraction withdrawn).

## 10. Brand voice on the board

Talk like the person at the pass. "Start", "Ready", "Served", "Cancel" as verbs; "late" as a word, not only a colour; "Reconnecting… the board will catch up." while offline; "Couldn't move #42. It is Cooking now." on a lost race. No exclamation marks.
