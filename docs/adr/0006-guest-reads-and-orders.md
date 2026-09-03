# ADR 0006: Guest reads are server-rendered, the basket is local, orders are placed in one transaction

Date: 2026-09-03
Status: accepted

## Context

M2 is the first milestone a guest can see. Everything it renders is read on a phone, over a restaurant's wifi, from a page opened by scanning a sticker — so the first paint has to arrive without a round of client-side fetching first. At the same time the API owns the things that must not be negotiable: which table a guest is at, which restaurant that table belongs to, and what a dish costs.

Three questions had to be answered together.

**Where does the read happen?** The guest pages (`/menu`, `/checkout`, `/orders/<id>`) need data before they can render anything, and the credential for that data is the `tt_guest` cookie the API set at claim time (ADR 0001).

**Where does the basket live?** It is the one piece of state a guest edits constantly — every tap on a stepper. It is also worthless the moment the demo resets.

**What does placing an order mean?** The schema has a `draft` status, inherited from the M1 data model, which invites a design where the basket is a server-side draft order that later transitions to `placed`.

## Decision

**Server components read; the browser mutates.** `/menu`, `/checkout` and `/orders/<id>` are server components. Each reads the cookie with `apps/web/lib/guest-cookie.ts` and passes it to `apiFetch` (`apps/web/lib/api.ts`), which calls `API_URL` directly and sets `cookie: tt_guest=<value>` on the outgoing request. `/menu` and `/checkout` need the same two answers — who this guest is and what is on the menu — so they ask them through one shared loader, `apps/web/lib/guest-menu.ts`, which returns `null` for a 401 and lets the pages redirect to `/session-ended`. Mutations (claim, place order, sign-in) go from the browser through the `/api/*` rewrite so the browser sends its own cookies (ADR 0004).

**The basket is client-side, per table, in `localStorage`.** `apps/web/lib/cart.ts` keeps `{ items: Record<menuItemId, quantity> }` under `tt-cart:<tableId>` behind a `useSyncExternalStore` store. Pure functions (`addItem`, `setQuantity`, `removeItem`, `cartLines`, `cartTotalCents`, `toOrderItems`) do the arithmetic and are unit-tested without a browser. Prices are never stored: a line is priced against the menu the page was rendered with, so a basket that outlived a price change is repriced rather than trusted.

**An order is created placed, in one transaction.** `POST /api/orders` takes only menu item ids, quantities and a note. `apps/api/src/lib/orders.ts` re-derives everything else: names and prices from `menu_items`, the table and restaurant from `request.principal`. One transaction inserts the order with `status = 'placed'` and `placed_at`, inserts the line items with name and price snapshots, and writes the `order.placed` audit row. `draft` stays in the enum as the reserved value it was; nothing writes it in M2.

**Retries are safe.** An `Idempotency-Key` header (a uuid) is required. The same key from the same guest session replays the existing order with 200 instead of placing a second one; the same key from a different session is a collision, not a retry, and answers 409 `CONFLICT`. A duplicate that arrives while the first insert is still in flight passes the pre-check and then loses the unique index — `createOrder` catches the `23505` unique violation and replays the order the winner created.

**The rate limit keys on the guest session.** `@fastify/rate-limit` is registered with `hook: 'preHandler'` (`apps/api/src/server.ts`), because its default `onRequest` hook runs before the principal exists. The route allows 10 orders a minute per `guestSessionId`.

**Validation happens inside the handler, after the guard.** `POST /api/orders` declares only a response schema. A declared `schema.body` would make Fastify answer 400 before the RBAC guard runs, telling an anonymous caller what is wrong with a payload we were never going to read; and a declared `schema.headers` in `fastify-type-provider-zod` replaces `request.headers` with the parsed subset, which would drop the cookie the principal resolves from. The handler validates the header and the body itself once the guard has passed.

### Rejected

- **Server Actions for the mutations.** A Server Action runs on the Next.js origin. It does not carry the guest cookie to Fastify, so every action would have to re-forward it by hand — the same code as `apiFetch`, minus the one thing that makes it worth having: a single place where the guest credential is attached.
- **A fully client-rendered guest app.** Simpler to reason about, worse where it is measured: an empty first paint, then a fetch, then a layout — on the exact device and network the Lighthouse mobile profile emulates.
- **Server-side draft orders.** The basket would become rows: an extra endpoint per tap, a `draft` order to reset on every demo wipe, and abandoned drafts accumulating from anyone who opened the menu and left. Nobody moves a basket between devices at a table.

## Consequences

- The guest never sees a price that did not come from the server, and the server never reads a price, a table or a restaurant from a request body. A tampered `priceCents` in the payload is dropped by the schema and the test asserts the database price.
- `draft` is dead weight in the enum until something needs it. That is deliberate: removing an enum value is a migration, and M3's kitchen work may yet want a pre-placed state.
- A demo reset deletes guest sessions, so a guest mid-basket gets a 401 on the next read and lands on `/session-ended`. Their basket is not carried across: the reset re-seeds tables with fresh ids, so the storage key changes with them and the next claim starts from an empty basket. Keying on the table is what makes that true, and it is the behaviour worth having — a basket priced against a menu that no longer exists is not worth restoring.
- Hydration is a real state, not a detail. The store's server snapshot is the empty basket, so the checkout's "empty basket → go back to the menu" effect reads storage directly through `readCart` rather than the hydration render's snapshot. A redirect fired from that snapshot would bounce a guest with a full basket back to the menu; `apps/web/components/checkout/checkout-screen.hydration.test.tsx` is the regression test.
- The limiter runs after the guard, so an anonymous caller is refused with 401 before the limiter counts them: `POST /api/orders` is unlimited for callers without a session. Refusing them is cheap — no database work happens — but it is a real asymmetry and it is written down in `docs/backlog.md`.
- The idempotency key is minted once per checkout visit and kept in `sessionStorage`, so a retry after a timeout replays instead of double-ordering. `crypto.randomUUID()` is unavailable in an insecure context, which means a phone hitting the dev server over plain http on a LAN address cannot check out; that is in the backlog for the M2 fix wave.
