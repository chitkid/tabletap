# M1 Foundation — Design Spec

Date: 2026-09-02. Status: implemented and merged into main on 2026-09-03 (final review clean after one fix wave; compose + e2e verified in CI only once a remote exists).
Project: TableTap — QR table ordering with a real-time kitchen display (portfolio full-stack project).
Milestone: M1 of six (M1 Foundation → M2 Guest flow + Demo landing → M3 Kitchen display → M4 Payments → M5 Admin → M6 Polish + Portfolio). The master brief is the permanent context for every milestone; this spec covers M1 only.

## 1. Goal and scope

M1 delivers the ground every later milestone stands on: the monorepo, the database schema and migrations, authentication with role-based access control, the shared contract package, the brand and design-token pipeline, Docker Compose, CI, the seed, and `/health`.

In scope:
- pnpm + Turborepo monorepo with `apps/web`, `apps/api`, `packages/db`, `packages/ui`, `packages/shared`.
- Full core schema (every entity from the brief) with committed SQL migrations.
- Staff authentication (better-auth), guest table sessions from signed QR tokens, RBAC matrix and guards, four real API endpoints plus `/health`.
- Brand guidelines for the demo restaurant, design-system files for three surfaces, three-layer tokens generated into `packages/ui/tokens.css`, component state specs, token validation in CI.
- Web app shell with the staff sign-in page.
- Idempotent seed with demo accounts and menu.
- Docker Compose (postgres, api, web), Dockerfiles, `.env.example`, GitHub Actions CI, one Playwright smoke test.
- ADRs 0001–0005, README with setup instructions, `docs/backlog.md`.

Out of scope (later milestones): menu and cart UI, order creation, landing and demo mode (M2); Socket.io, kitchen board, order state enforcement on endpoints (M3); Stripe, `processed_events` (M4); menu CRUD, photo uploads, MinIO, QR PDF, dashboard (M5); motion, Lighthouse CI, deployment, README case study, logo, OG image (M6).

## 2. Decisions from brainstorming

| Question | Decision |
|---|---|
| Auth library | better-auth in `apps/api` for staff; guests use a separate signed session bound to a table (ADR 0001). Auth.js rejected: Next-centric, two sources of truth, no place for guests. better-auth anonymous plugin rejected: turns guests into users and complicates the hourly demo reset. |
| Guest identity | QR carries a JWT (HS256) with table id and TTL; the API verifies the signature and issues an httpOnly guest-session cookie (ADR 0002). |
| Local Docker | Docker Desktop will be installed by the owner. Unit and integration tests run on PGlite (embedded Postgres) so `pnpm test` never needs Docker; Compose Postgres backs e2e (ADR 0003). |
| Web ↔ API | The browser calls `/api/*` on the web origin; a Next.js rewrite proxies to the API so auth cookies stay same-origin on Vercel + Railway. Sockets (M3) connect to the API origin directly with a short-lived token minted by the API (ADR 0004). |
| Tokens | One `assets/design-tokens.json` (primitive → semantic → component) feeds all three surfaces; kitchen is a dark semantic override (ADR 0005). |
| Demo tenant | The product is TableTap; the seeded restaurant is **Little Furnace** (section 3). |
| Document language | Specs, plans, ADRs, README, code and commits in English (portfolio material). Conversation with the owner in Russian. |
| Public URLs | `/t/<token>` (guest entry from QR), `/login` (staff), `/kitchen` (M3), `/admin` (M5). Changing these later requires the owner's approval. |
| Money and locale | Single restaurant, USD, prices stored as integer cents, UI English only. |

## 3. Brand: Little Furnace

**Concept.** A neighbourhood wood-fired place: flatbreads, grain bowls, a short list of sides and drinks. Order from the table, food comes when it is ready. Fast-casual pace, warm room. The name and the furnace image give the kitchen surface its dark "back of house" character and the guest surface its warmth.

**Voice principles (with sample UI copy):**
1. Talk like the person at the counter. "Anything else?", "Ready when you are.", "Table 7, welcome back."
2. Say the thing. "Order sent to the kitchen." not "Yay! Your order is on its way!". "That email and password don't match." not "Oops!".
3. Time is honest. "About 12 min" backed by a real timer; never "soon", never "almost there" without a number.

Forbidden: exclamation-heavy startup cheer, emoji in UI copy, apologising errors, marketing adjectives ("delicious", "amazing").

**Palette direction.** Charcoal ink for text and the kitchen background, one accent: ember orange, an oat off-white for guest backgrounds, olive as the secondary. Status colours (placed, paid, cooking, ready, served, cancelled) and timer thresholds (ok, warning at 5 min, late at 10 min) are semantic tokens and never the only carrier of meaning. Exact hex values are chosen in the `brand` task and must pass WCAG AA contrast (≥ 4.5:1 body, ≥ 3:1 large) on both light and dark surfaces.

**Typography direction.** A display grotesque with character for the guest surface; a workhorse sans with tabular numerals for prices, timers and tables; kitchen surface body size ≥ 20 px. Exact pairing is chosen from `ui-ux-pro-max` results in the brand task. Playfair + Inter is disallowed as a cliché.

**Product vs tenant.** The guest surface wears the restaurant brand. Kitchen and admin wear neutral TableTap chrome (dark for kitchen, light and dense for admin) with ember as the single accent. All three come from the same token base.

The brand task writes `docs/brand-guidelines.md` following the `brand` skill template so that `sync-brand-to-tokens.cjs` can parse the Quick Reference table (`| Primary Color | #RRGGBB |`, `| Secondary Color | … |`, `| Accent Color | … |`) and the `### Primary Colors` / `### Secondary Colors` / `### Accent Colors` sections.

## 4. Repository layout and tooling

Repository: `C:/Users/chitkid/Desktop/claude/tabletap/`, branch `main`, feature work in a worktree on `feat/m1-foundation`.

```
tabletap/
  package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
  eslint.config.js  .prettierrc  .env.example  .gitignore
  docker-compose.yml  Dockerfile.api  Dockerfile.web  playwright.config.ts
  .github/workflows/ci.yml
  apps/
    api/   Fastify 5, Drizzle, better-auth, pino
    web/   Next.js 16 App Router, Tailwind 4, shadcn
  packages/
    db/      Drizzle schema, migrations/, seed, migrate, PGlite test helper
    shared/  zod schemas, roles, RBAC matrix, order transitions, error codes
    ui/      tokens.css (generated), theme.css (surfaces + Tailwind @theme), shadcn components
  assets/design-tokens.json       single source of truth for tokens
  scripts/generate-tokens.cjs  validate-tokens.cjs  sync-brand-to-tokens.cjs   (copied from the skills so CI does not depend on them)
  design-system/tabletap/MASTER.md  pages/kitchen.md  pages/admin.md
  docs/brand-guidelines.md  docs/adr/  docs/design/components.md  docs/backlog.md  docs/superpowers/
  e2e/staff-login.spec.ts
  README.md
```

Tooling: Node 24 (`engines >= 22`), pnpm via corepack (`packageManager` pinned), Turborepo tasks `build`, `dev`, `lint`, `typecheck`, `test`. TypeScript strict everywhere; TypeScript stays on the 5.x line unless Next 16 and drizzle-kit declare support for 7.x at install time. ESLint 9 flat config + Prettier. Package versions are pinned exactly at install (current: Next 16, React 19, Fastify 5, Drizzle ORM 0.45, better-auth 1.7, Socket.io 4.8 (M3), Zod 4, Tailwind 4, Vitest 4, Playwright 1.62, Turbo 2).

Root scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm tokens` (JSON → `packages/ui/tokens.css`), `pnpm validate-tokens` (scans `apps/`), `pnpm brand:sync`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed -- --if-empty|--reset`.

Web must never import `@tabletap/shared/server` (Node-only helpers); an ESLint `no-restricted-imports` rule in `apps/web` enforces it.

Line endings: `.gitattributes` with `* text=auto eol=lf` so shell entrypoints and Dockerfiles stay LF on Windows checkouts (the host has `core.autocrlf` on and Linux containers reject CRLF scripts).

## 5. Data model

Drizzle schema in `packages/db/src/schema/*.ts` (one file per domain), Postgres 17. IDs are UUID v7 generated in the application unless noted. Timestamps are `timestamptz`, `created_at`/`updated_at` on every mutable table. Money is integer cents.

Enums: `user_role` (waiter, kitchen, admin); `order_status` (draft, placed, paid, cooking, ready, served, cancelled); `payment_status` (pending, succeeded, failed, refunded); `payment_provider` (stripe, demo); `actor_type` (user, guest, system).

| Table | Columns (beyond id, timestamps) | Notes |
|---|---|---|
| `restaurants` | name, slug unique, currency (default `USD`), timezone | Exactly one row in the demo. |
| `tables` | restaurant_id FK, number int, label text, seats int, is_active bool | unique (restaurant_id, number). |
| `menu_categories` | restaurant_id FK, name, sort_order int, is_active bool | |
| `menu_items` | category_id FK, name, description, price_cents int, image_url text null, allergens text[] (typed against the `Allergen` enum at seed time; runtime validation arrives with menu CRUD in M5), is_available bool, sort_order int | Photos arrive in M5; M2 decides image sourcing. |
| `orders` | restaurant_id FK, table_id FK, guest_session_id FK null, status `order_status` default `draft`, subtotal_cents, total_cents, note text null, idempotency_key text unique null, placed_at, paid_at, ready_at, served_at, cancelled_at (all null) | Prices are copied from `menu_items` server-side at placement (M2). |
| `order_items` | order_id FK, menu_item_id FK, name_snapshot, unit_price_cents, quantity int, line_total_cents | Snapshot of price and name at order time. |
| `payments` | order_id FK, provider `payment_provider`, provider_session_id null, provider_payment_intent_id null, amount_cents, currency, status `payment_status` | |
| `users` | better-auth user columns (id text, name, email unique, email_verified, image) + role `user_role` not null default `waiter` | Staff only. |
| `sessions`, `accounts`, `verifications` | as generated by the better-auth CLI | Names mapped in the adapter config. |
| `guest_sessions` | table_id FK, expires_at, last_seen_at | Deleted by the hourly demo reset (M2). |
| `audit_log` | id bigserial, actor_type `actor_type`, actor_id text null, action text, entity_type text, entity_id text null, payload jsonb, created_at | Helper `recordAudit()` in the API; first call site is `guest.claimed`. |

`processed_events` (Stripe idempotency) is added in M4 together with the webhook.

Migrations: generated with `drizzle-kit generate` into `packages/db/migrations/` and committed. Applied at runtime by `packages/db/src/migrate.ts` (`drizzle-orm/postgres-js/migrator`) and in tests by the PGlite migrator. Schema changes without a migration are a review blocker.

## 6. Authentication and sessions

**Staff (better-auth).** Configured in `apps/api/src/auth.ts`: `drizzleAdapter(db, { provider: 'pg', schema })`, `emailAndPassword: { enabled: true, disableSignUp: true }` (accounts exist only via seed or, later, admin), `user.additionalFields.role`, `trustedOrigins: [WEB_ORIGIN]`, cookies marked `Secure` when `COOKIE_SECURE` is true (default: true in production, false otherwise). Mounted as a Fastify catch-all route on `/api/auth/*` using `fromNodeHeaders` from `better-auth/node`, registered after `@fastify/cors`. Rate limit on `/api/auth/sign-in/email`: 10 requests per minute per IP.

**Guest table token (QR).** A JWT signed with HS256 (`jose`) using `TABLE_TOKEN_SECRET`. Claims: `sub` = table id, `rid` = restaurant id, `tn` = table number, `iat`, `exp`; header `typ: "tt-table"`. TTL from `TABLE_TOKEN_TTL_DAYS` (default 365, printed QR codes must outlive a demo reset). Helpers `signTableToken()` and `verifyTableToken()` live in `packages/shared/src/server/table-token.ts` (exported as `@tabletap/shared/server`; used by the API and the seed, never by the web app). Verification failures map to `TOKEN_INVALID` or `TOKEN_EXPIRED`.

**Guest session.** `POST /api/guest/claim` with `{ token }`: verify the token → load the table (must exist, be active, belong to `rid`) → insert `guest_sessions` with `expires_at = now + GUEST_SESSION_TTL_HOURS` (default 4) → set cookie `tt_guest` = session id, signed by `@fastify/cookie` with `COOKIE_SECRET`, httpOnly, `SameSite=Lax`, `Secure` when `COOKIE_SECURE` is true (default: true in production, false otherwise), path `/` → record audit `guest.claimed` → respond `{ table: { id, number, label }, expiresAt }`. Claiming again from the same browser replaces the cookie with a fresh session (a guest can move tables). Rate limit: 20 requests per minute per IP. Sliding expiry: on any request from a guest whose `last_seen_at` is older than 5 minutes, set `last_seen_at = now` and `expires_at = now + TTL`.

**Principal resolution.** A Fastify plugin decorates every request with `request.principal`:

```ts
type Principal =
  | { kind: 'staff'; userId: string; email: string; name: string; role: 'waiter' | 'kitchen' | 'admin' }
  | { kind: 'guest'; guestSessionId: string; tableId: string; tableNumber: number; expiresAt: string }
  | { kind: 'anonymous' };
```

Order: better-auth session (`auth.api.getSession({ headers })`) → signed `tt_guest` cookie with an unexpired `guest_sessions` row → anonymous. An expired or unknown guest cookie is cleared and treated as anonymous.

## 7. RBAC

The permission matrix is data in `packages/shared/src/roles.ts` and is the single source for guards; later milestones add actions here first.

| Action | guest | waiter | kitchen | admin |
|---|---|---|---|---|
| `menu.read` | yes | yes | yes | yes |
| `menu.write` | | | | yes |
| `tables.read` | | yes | yes | yes |
| `tables.read.own` | yes | | | |
| `tables.write` | | | | yes |
| `orders.create` | yes | | | |
| `orders.read.own` | yes | | | |
| `orders.read.all` | | yes | yes | yes |
| `orders.transition` | | yes | yes | yes |
| `orders.cancel.own` | yes | | | |
| `audit.read` | | | | yes |
| `dashboard.read` | | | | yes |

`can(role: Role, action: Action): boolean` where `Role` includes `guest`. Per-status transition rights per role are refined in M3.

Guards in `apps/api/src/plugins/rbac.ts`, used as route `preHandler`s: `requireAuthenticated()` (401 `UNAUTHORIZED` for anonymous), `requireStaff(...roles)` (401 for anonymous, 403 `FORBIDDEN` for guests or wrong role), `requireGuest()`, `requireTableAccess(paramName)` (staff with `tables.read` pass; a guest passes only when the param equals their own `tableId`, otherwise 403). Guards never trust ids from the client for scoping; the guest's table comes from the session row.

## 8. API surface (M1)

Base: `apps/api`, port `PORT` (default 4000). JSON everywhere. Validation with Zod 4 through `fastify-type-provider-zod`; schemas imported from `@tabletap/shared`.

| Method and path | Auth | Response |
|---|---|---|
| `GET /health` | none | 200 `{ status: 'ok', version, uptime, checks: { db: 'ok' } }`; 503 `{ status: 'degraded', checks: { db: 'fail' } }` when the `SELECT 1` probe fails. |
| `ALL /api/auth/*` | better-auth | handled by better-auth. |
| `GET /api/me` | staff or guest | 200 `{ principal }`; 401 for anonymous. |
| `POST /api/guest/claim` | none (rate-limited) | 200 as in section 6; 400 `VALIDATION_FAILED`; 401 `TOKEN_INVALID` / `TOKEN_EXPIRED`; 404 `NOT_FOUND` for an unknown or inactive table; 429 `RATE_LIMITED`. |
| `GET /api/tables` | `requireStaff('waiter','kitchen','admin')` | 200 `{ tables: TableDto[] }` ordered by number. |
| `GET /api/tables/:id` | `requireTableAccess('id')` | 200 `{ table: TableDto }`; 403 for a guest at another table; 404 for staff when missing. |

`TableDto = { id, number, label, seats, isActive }`.

Error envelope for every non-2xx produced by TableTap's own handlers: `{ error: { code, message, details? } }`. Exception (decided 2026-09-03 after the API-layer review): responses of the delegated better-auth handler under `/api/auth/*` are proxied unchanged, so their error bodies keep better-auth's own shape (`{ code, message }`) that the better-auth web client expects; the one carve-out is an unknown path under `/api/auth/`, which the forwarder turns into the `NOT_FOUND` envelope instead of better-auth's empty 404. Codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `RATE_LIMITED`, `INTERNAL`. The error handler maps `ZodError` → 400, `AppError(code, status, message)` → its status, anything else → 500 `INTERNAL` with the stack logged and never returned.

Logging: pino, JSON, `LOG_LEVEL` from env, request id from `x-request-id` or generated and echoed back, `cookie`, `set-cookie` and `authorization` headers redacted. CORS: `@fastify/cors` with `origin: WEB_ORIGIN`, `credentials: true`.

App factory: `buildApp({ db, config })` in `apps/api/src/server.ts` returns a Fastify instance; `main.ts` builds it with real env and listens. Plugins under `src/plugins/`: `auth`, `principal`, `rbac`, `route-guard`, `error-handler`. Env parsing (`config.ts`), the db handle and rate limiting are not plugins: `main.ts` parses the env, and `server.ts` decorates the instance with `db` and `config` and registers `@fastify/cors`, `@fastify/cookie` and `@fastify/rate-limit` directly. Routes under `src/routes/`: `health`, `me`, `guest`, `tables`. Tests colocated as `*.test.ts`.

## 9. `packages/shared` contracts

Browser-safe by default; Node-only code under `src/server/` (subpath export `@tabletap/shared/server`).

- `roles.ts`: `Role`, `StaffRole`, `Action`, `can()`.
- `orders.ts`: `OrderStatus`, `ORDER_TRANSITIONS` (`draft→placed`, `placed→paid|cancelled`, `paid→cooking|cancelled`, `cooking→ready`, `ready→served`), `canTransition(from, to)`. Unit-tested in M1; enforced by endpoints in M3 and M4.
- `menu.ts`: `Allergen` enum (gluten, dairy, egg, fish, shellfish, nuts, peanuts, soy, sesame).
- `principal.ts`: `Principal` schema.
- `api.ts`: `ClaimRequest`, `ClaimResponse`, `MeResponse`, `TableDto`, `TablesResponse`, `ErrorEnvelope`, `ErrorCode`.
- `server/table-token.ts`: `signTableToken`, `verifyTableToken`, `TableTokenClaims`.
- `events.ts`: reserved, empty in M1; M3 fills in the typed Socket.io event map.

## 10. Web app (M1)

Next.js 16 App Router, TypeScript strict, Tailwind 4, shadcn components consumed from `@tabletap/ui`. `globals.css` imports `@tabletap/ui/tokens.css` and `@tabletap/ui/theme.css`. Fonts via `next/font`.

`next.config.ts`: `rewrites()` proxies `/api/:path*` → `${API_URL}/api/:path*` (Set-Cookie headers are forwarded through the proxy); `redirects()` sends `/` → `/login` with 307 until the landing arrives in M2.

Route `/login`: email and password form (labels bound to inputs, error region `aria-live="polite"` linked by `aria-describedby`, 44 px targets). States: idle; submitting (button disabled, label "Signing in…"); error ("That email and password don't match." on 401; "Too many attempts. Wait a minute and try again." on 429; a generic network error otherwise); signed in (the same route renders "Signed in as {name} ({role})" with a Sign out button). Uses the better-auth React client (`createAuthClient()` with default base path `/api/auth`, going through the rewrite).

`packages/ui` ships shadcn `button`, `input`, `label`, `card`, `badge` restyled with tokens, plus `cn()`.

## 11. Design pipeline deliverables

Order of execution inside M1, each a plan task with the listed skill:

1. `brand` → `docs/brand-guidelines.md` (structure from `C:/Users/chitkid/.claude/skills/brand/templates/brand-guidelines-starter.md`, content from section 3). Then `node scripts/sync-brand-to-tokens.cjs` → `assets/design-tokens.json` (primitive colour scales).
2. `ui-ux-pro-max` (script at `C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py`), run from the repo root:
   - `python <search.py> "restaurant qr ordering mobile wood-fired warm neighbourhood ember charcoal oat" --design-system --persist -p "TableTap" --output-dir . --variance 6 --motion 5 --density 4`
   - `python <search.py> "kitchen display board dark high-contrast" --design-system --persist -p "TableTap" --output-dir . --page kitchen --variance 4 --motion 3 --density 6`
   - `python <search.py> "restaurant admin dashboard analytics" --design-system --persist -p "TableTap" --output-dir . --page admin --variance 3 --motion 2 --density 8`
   - plus `--domain ux` queries for touch targets, loading states and live regions, and `--stack nextjs` / `--stack shadcn`. Zero results are reported as "defaults used", never invented.
   MASTER.md and the page files must agree with `docs/brand-guidelines.md`; on conflict, fix them, not the brand.
3. `design-system` → finish `assets/design-tokens.json`: primitive (colour scales, 4 pt spacing, radii, type scale, weights, line heights, shadows, durations), semantic (`bg`, `surface`, `fg`, `fg-muted`, `primary`, `primary-fg`, `border`, `focus`, `status-*` for the six visible order statuses, `timer-ok|warn|late`), component (`button`, `dish-card`, `order-card`, `status-badge`, `cart-counter`). `pnpm tokens` runs `scripts/generate-tokens.cjs --config assets/design-tokens.json -o packages/ui/tokens.css`. `packages/ui/theme.css` (hand-written) aliases surfaces: `:root` = guest (light), `[data-surface="kitchen"]` = dark with body size ≥ 20 px, `[data-surface="admin"]` = light with the dense spacing scale; and maps tokens into Tailwind's `@theme inline`. Component state specs (default, hover, active, focus-visible, disabled, loading) for the five components go to `docs/design/components.md` and reference tokens only. `packages/ui/tokens.css` is the only CSS the apps consume; if `sync-brand-to-tokens.cjs` also emits `assets/design-tokens.css`, that file is deleted, not committed.
4. `pnpm validate-tokens` runs `scripts/validate-tokens.cjs --dir apps/`: no raw hex, `rgb()`, multi-digit px or rem values in `apps/`. Tailwind utility classes pass; arbitrary values with hex or px do not.

`frontend-design` (visual direction and the one aesthetic risk) is deferred to M2, the first milestone with real UI.

## 12. Seed

`packages/db/src/seed/run.ts` (data in `seed/data.ts`), run as `pnpm db:seed -- --if-empty` or `-- --reset`; without a mode flag it prints usage and exits 1. `--if-empty` skips when a restaurant with slug `little-furnace` exists. `--reset` deletes demo data in dependency order inside one transaction and re-inserts. Both runs are idempotent: running twice yields identical row counts.

Content:
- Restaurant `Little Furnace`, slug `little-furnace`, USD, timezone `Europe/Lisbon`.
- Tables 1–12, labels "Table 1"… "Table 12", seats 2–6, all active.
- Categories: Flatbreads, Bowls, Sides, Drinks.
- 20 items (price, allergens): Margherita Flatbread 12.00 [gluten, dairy]; Fennel Sausage & Honey 15.00 [gluten, dairy]; Mushroom & Taleggio 14.00 [gluten, dairy]; Charred Pepper & Olive 13.00 [gluten]; Prosciutto & Rocket 16.00 [gluten, dairy]; Smoked Chili & Egg 14.00 [gluten, egg, dairy]; Roast Chicken Grain Bowl 14.00 [gluten]; Ember Salmon Bowl 17.00 [fish, sesame]; Harissa Chickpea Bowl 12.00 [sesame]; Lamb Meatball Bowl 16.00 [gluten, dairy]; Roast Squash & Feta 13.00 [dairy, nuts]; Blistered Greens 6.00 []; Furnace Potatoes 7.00 []; Burrata & Peaches 11.00 [dairy] (is_available = false, to exercise the state in M2); Wood-Fired Focaccia 5.00 [gluten]; Marinated Olives 5.00 []; House Lemonade 4.00 []; Sparkling Water 3.00 []; Cold Brew 4.50 []; Blood Orange Soda 4.00 []. `image_url` null for all.
- Staff: `admin@littlefurnace.demo` (Mara Quinn, admin), `kitchen@littlefurnace.demo` (Theo Baptiste, kitchen), `waiter@littlefurnace.demo` (Jun Okafor, waiter). Password from `DEMO_PASSWORD` (default `tabletap-demo`), created through better-auth's server API so hashes match.
- After seeding, prints the twelve guest URLs `${WEB_ORIGIN}/t/<token>` signed with `TABLE_TOKEN_SECRET`.

## 13. Testing

Vitest 4 in every package, aggregated by `pnpm test` through Turbo. TDD (red → green → refactor → commit) for all business logic, API routes, guards, token helpers, principal resolution, seed logic and the login form. Exempt (per brief): configs, migrations, generated shadcn components, purely presentational components.

- `packages/shared`: pure unit tests (`can()`, `canTransition()`, token sign/verify including expiry and tampering, schema parsing).
- `packages/db`: migrations apply cleanly to PGlite; seed `--if-empty` twice and `--reset` twice give identical counts; `@tabletap/db/testing` exports `createTestDb()` → `{ db, close }` (PGlite in memory, migrations applied from `packages/db/migrations`).
- `apps/api`: integration tests via `buildApp({ db: testDb })` + `app.inject()`. Covered: `/health` 200 and 503; sign-in via better-auth and `/api/me` for each role; guest claim happy path, invalid token, expired token, inactive table, rate limit; `/api/tables` 401 anonymous, 403 guest, 200 staff; `/api/tables/:id` guest own 200, guest other 403; sliding expiry; error envelope shape; audit row written on claim.
- `apps/web`: Testing Library for the login form (submits credentials, shows the 401 message, renders the signed-in state, disables the button while submitting).
- `e2e/staff-login.spec.ts` (Playwright): against `docker compose up`, open `/login`, sign in as kitchen, see "Signed in as Theo Baptiste (kitchen)". Proves the rewrite forwards cookies.

Verified on 2026-09-02 in a scratch project: better-auth 1.7.2 with `@better-auth/drizzle-adapter` over PGlite 0.5.8 handles sign-up, sign-in (200), wrong password (401), `getSession` with the `role` field, sign-out, and `disableSignUp` (400). Seeding staff by inserting a `users` row plus an `accounts` row (`providerId: 'credential'`, `issuer: 'local:credential'`, `accountId` = user id, `password` from `hashPassword()` in `better-auth/crypto`) signs in normally. The schema must be generated with `npx auth@latest generate` (the deprecated `@better-auth/cli` omits the `issuer` column and the runtime refuses to start). ADR 0003 records this.

## 14. Infrastructure

`.env.example` (commented) covers: `NODE_ENV`, `PORT=4000`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:4000`, `WEB_ORIGIN=http://localhost:3000`, `COOKIE_SECRET`, `TABLE_TOKEN_SECRET`, `TABLE_TOKEN_TTL_DAYS=365`, `GUEST_SESSION_TTL_HOURS=4`, `LOG_LEVEL=info`, `TRUST_PROXY=loopback,uniquelocal` (peers whose `x-forwarded-for` the rate limiter believes), `COOKIE_SECURE` (commented out; defaults to true in production, false otherwise), `DEMO_PASSWORD=tabletap-demo`, `API_URL=http://localhost:4000` (web, server-side rewrite target), `NEXT_PUBLIC_APP_URL=http://localhost:3000`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. Both apps validate env with Zod at startup and fail fast with a readable message.

`docker-compose.yml`: `postgres` (postgres:17-alpine, volume, `pg_isready` healthcheck); `api` (Dockerfile.api, multi-stage pnpm build, entrypoint: migrate → `seed --if-empty` → start, `/health` healthcheck, depends on postgres healthy, port 4000); `web` (Dockerfile.web, Next standalone output, `API_URL=http://api:4000`, depends on api healthy, port 3000). MinIO joins in M5.

CI (`.github/workflows/ci.yml`, on push and pull_request):
- `check`: checkout, corepack pnpm, cached install with frozen lockfile, `pnpm lint`, `pnpm typecheck`, `pnpm validate-tokens`, `pnpm test` (PGlite, no services).
- `compose-e2e`: `docker compose up -d --build --wait`, `curl -f http://localhost:4000/health`, Playwright chromium install, `pnpm e2e`, `docker compose logs` on failure, `docker compose down -v`.

Lighthouse CI is added in M2.

## 15. ADRs (`docs/adr/`)

0001 better-auth for staff and separate signed guest sessions; 0002 signed table token in the QR (JWT HS256, TTL, claims); 0003 PGlite for unit and integration tests, Compose Postgres for e2e; 0004 API behind a Next.js rewrite for same-origin cookies, sockets direct with an API-minted token; 0005 one token source for three surfaces via semantic overrides. Format: context → decision → consequences.

## 16. Definition of Done

- `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e && pnpm validate-tokens` green locally.
- `docker compose up` brings up postgres, api and web; `/health` returns 200; the seed ran; `/login` works end to end.
- CI workflow committed and green on the first push to GitHub.
- `docs/brand-guidelines.md`, `design-system/tabletap/*`, `assets/design-tokens.json`, `packages/ui/tokens.css`, `docs/design/components.md` committed and consistent with each other.
- ADRs 0001–0005 written. README (English) with setup, scripts and demo accounts; the case study waits for M6. `docs/backlog.md` exists.
- Code review with no open Critical or Important findings; every commit a working state; no TODO stubs; Conventional Commits in English.

## 17. Backlog candidates (not in M1)

Secret rotation for table tokens (`kid` header); admin-triggered QR regeneration (M5); waiter-created orders; multi-restaurant tenancy (non-goal).

## 18. Risks and fallbacks

- Docker Desktop is not installed yet: the Compose task runs last in the plan. If Docker is still missing then, Compose is verified in CI only and the report says so.
- Next.js rewrite must forward `Set-Cookie`; verified by the e2e smoke. Fallback: direct cross-origin calls with CORS credentials in development, same-site domains in M6.
- TypeScript 7.x is on npm; the toolchain stays on 5.x until Next and drizzle-kit support 7.
- better-auth over PGlite (section 13).
