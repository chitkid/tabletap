# M3 Kitchen Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest's order is on the kitchen screen in under 500 ms, the kitchen moves it through Cooking and Ready, and the guest's phone follows without a reload; Simulate rush fills the board on demand.

**Architecture:** Socket.io pushes, REST mutates. `POST /api/orders/:id/transition` checks the role's right and the state machine, updates atomically and emits into an in-process `OrderEvents` emitter; the Socket.io layer subscribes to that emitter and broadcasts public DTOs to the rooms `kitchen` and `table:<tableId>`. Sockets authenticate with a 60-second JWT minted by `POST /api/socket-token`; the server joins rooms from the token's principal. Every connect and reconnect asks for a snapshot through the `subscribe` ack and replaces local state with it. The web board is a pure reducer plus a socket lifecycle effect; bumps are optimistic and resync on error.

**Tech Stack:** as M2 (pnpm 11, Turborepo 2, TypeScript 5.9, Fastify 5, Zod 4, Drizzle 0.45 + PGlite tests, better-auth 1.7, Next.js 16, React 19, Tailwind 4, shadcn, Vitest 4, Playwright 1.62, Lighthouse 13) plus `socket.io` 4.8.3 (API) and `socket.io-client` 4.8.3 (web).

**Spec:** `docs/superpowers/specs/2026-09-03-m3-kitchen-display-design.md` — read it before any task. Earlier specs: `docs/superpowers/specs/2026-09-02-m1-foundation-design.md`, `docs/superpowers/specs/2026-09-03-m2-guest-flow-design.md`. Deferred items: `docs/backlog.md`.

**Superseded during the final review:** guest sockets join `session:<guestSessionId>`, not `table:<tableId>` — see ADR 0008. The task text below is the plan as executed.

## Global Constraints

- Language: code, comments, commits, docs in English. Conventional Commits; every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Every commit is a working state; no TODO stubs.
- Work in a git worktree on branch `feat/m3-kitchen-display` created from `main` (`superpowers:using-git-worktrees`; worktree root under `.claude/worktrees/`). Paths below are relative to the worktree root. Run `corepack pnpm install --frozen-lockfile` in the new worktree before the first task.
- pnpm through corepack (`corepack pnpm` when `pnpm` is not on PATH); add dependencies with `--save-exact` / `--save-dev`; commit `pnpm-lock.yaml` with the code; never run `pnpm approve-builds`.
- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`import type`); no `any`.
- TDD (red → verify → green → refactor → commit) for all business logic, routes, the socket layer, the rush generator, the board store, the timer helpers, the board and ticket behaviour, the login redirect and the live order page. Exempt: migrations, config, presentational markup, Dockerfiles, Compose, the Lighthouse script, ADRs.
- Every gate runs the root `pnpm test` (all five packages), never a single package: in M2 a task verified two packages and regressed a third.
- Server never trusts the client: rooms come from the token's principal, transition rights from `TRANSITION_RIGHTS`, the machine from `ORDER_TRANSITIONS`; `guestSessionId` and `restaurantId` never appear in an order payload and never reach another client (`OrderDtoSchema.parse` on every broadcast and snapshot). The socket token carries the guest's own session id as its subject, which that browser already holds in its signed `tt_guest` cookie. (Corrected after the final M3 review, which found the original "never leaves the API" contradicted by the token; see ADR 0008.)
- Error envelope `{ error: { code, message, details? } }` on every non-2xx; codes now `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_FAILED | TOKEN_INVALID | TOKEN_EXPIRED | RATE_LIMITED | ITEM_UNAVAILABLE | CONFLICT | INVALID_TRANSITION | INTERNAL`.
- Route guard: every route declares `config.public` or a `require*` preHandler (boot fails otherwise). Validate bodies, params and queries inside handlers with the `validate()` helper from `apps/api/src/routes/orders.ts` so guards answer before payload checks.
- Tokens only: no raw hex, `rgb()`, multi-digit `px`/`rem` in `apps/` or `packages/ui/src` (`pnpm validate-tokens`). `packages/ui/theme.css` is outside the scan and may carry the kitchen `--text-*` scale.
- Kitchen surface: nothing under 16 px, body 20 px, table number 32 px, timer 28 px mono, item line 22 px, note 18 px, column header 16 px (`design-system/tabletap/pages/kitchen.md`). Colour never the only carrier: every status chip and timer badge carries text.
- Brand voice (`docs/brand-guidelines.md`): plain verbs, no exclamation marks, no emoji, no apology. Exact strings are given per task.
- Accessibility: every control labelled; 44 px targets (`h-11`, `size-11`); `role="status"` / `aria-live="polite"` for the connection banner and notices, `aria-live="assertive"` for the guest's "ready" announcement.
- Public URLs added in M3: `/kitchen` only.
- Formatting gate: `pnpm exec prettier --check .` must pass.
- Docker Desktop, WSL 2 and Playwright Chromium are installed on the development host (2026-09-03). Compose, e2e and Lighthouse run locally in Task 9 and in CI (`origin` = https://github.com/chitkid/tabletap). On this host the Playwright `chrome.exe` fails side-by-side activation: run the Lighthouse script with `CHROME_PATH="$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe"`. The Docker CLI lives in `C:/Users/chitkid/AppData/Local/Programs/DockerDesktop/resources/bin` (prepend to PATH in shells opened before the install).

## Context files for every task

| Path | What it is |
|---|---|
| `docs/superpowers/specs/2026-09-03-m3-kitchen-display-design.md` | The approved M3 spec (§4 contracts, §5 web, §7 tests, §10 copy) |
| `docs/brand-guidelines.md`, `design-system/tabletap/MASTER.md`, `design-system/tabletap/pages/kitchen.md` | Voice, palette, the kitchen surface rules |
| `docs/design/components.md`, `docs/design/ux-notes.md` | Component states, live regions, touch targets |
| `packages/ui/tokens.css`, `packages/ui/theme.css` | Tokens and the Tailwind theme (`bg-card`, `text-muted-foreground`, `text-timer-late`, `bg-status-cooking`, `font-display`, `font-mono`) |
| `apps/api/src/{server,config,types}.ts`, `src/plugins/{rbac,principal,route-guard,error-handler,demo-reset}.ts`, `src/lib/{orders,audit,errors,restaurant,resolve-principal}.ts`, `src/routes/{orders,demo,guest}.ts`, `src/test/helpers.ts` | The M2 API to extend (`createTestApp`, `signInAs(app, email)`, `claimTable(app, db, tableNumber)`) |
| `packages/shared/src/{api,orders,roles,errors,events,principal}.ts`, `src/server/table-token.ts` | Contracts to extend; the table token is the template for the socket token |
| `packages/db/src/schema/orders.ts`, `migrations/`, `src/seed/{run,data}.ts` | Schema, migrations (`drizzle-kit generate`), seed (`DEMO_STAFF`, `DEMO_RESTAURANT_SLUG`, tables 1–12) |
| `apps/web/{lib/api.ts,lib/demo-links.ts,app/login/page.tsx,components/login-form.tsx,app/orders/[id]/page.tsx,components/order/*.tsx,components/landing/landing-content.tsx}` | The M2 web app to extend |

## File structure (M3 additions)

```
packages/shared/src/errors.ts              + INVALID_TRANSITION
packages/shared/src/orders.ts              + interim edge, ACTIVE_ORDER_STATUSES, TRANSITION_RIGHTS, canRoleTransition
packages/shared/src/api.ts                 + OrderDto timestamps, TransitionRequest, ActiveOrdersQuery, SocketTokenResponse, RushResponse
packages/shared/src/events.ts              typed Socket.io maps, SOCKET_ROOMS
packages/shared/src/server/socket-token.ts (+ .test.ts)
packages/db/src/schema/orders.ts           + cookingAt;  migrations/0002_cooking-at.sql
apps/api/src/config.ts                     + SOCKET_TOKEN_SECRET
apps/api/src/lib/{order-events,transitions,rush}.ts (+ tests);  lib/orders.ts (insertPlacedOrder, active filter)
apps/api/src/routes/{orders,demo,socket-token}.ts (+ tests)
apps/api/src/realtime/server.ts (+ .test.ts);  plugins/demo-rush.ts
apps/web/lib/{socket,board-store,timer-threshold,chime}.ts (+ tests)
apps/web/app/kitchen/{layout,page}.tsx
apps/web/components/kitchen/{kitchen-board,ticket-card,timer-badge,sound-toggle,connection-banner,rush-button,sign-out-button,use-now}.ts(x) (+ tests)
apps/web/components/order/order-live.tsx (+ test);  components/login-form.tsx (next redirect)
packages/ui/theme.css                      kitchen --text-* scale
e2e/kitchen-live.spec.ts;  scripts/lighthouse-audit.mjs (+ kitchen page)
docs/adr/0008-realtime-delivery.md, docs/adr/0009-interim-state-machine.md
```

---

### Task 1: Shared contracts, the interim state machine and the socket token

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**
- Modify: `packages/shared/src/errors.ts`, `packages/shared/src/orders.ts`, `packages/shared/src/orders.test.ts`, `packages/shared/src/api.ts`, `packages/shared/src/api.test.ts`, `packages/shared/src/events.ts`, `packages/shared/src/server/index.ts`
- Create: `packages/shared/src/server/socket-token.ts`, `packages/shared/src/server/socket-token.test.ts`

**Interfaces (produced):**
```ts
// @tabletap/shared
ERROR_CODES += 'INVALID_TRANSITION'
ORDER_TRANSITIONS.placed === ['paid', 'cooking', 'cancelled']
ACTIVE_ORDER_STATUSES = ['placed', 'paid', 'cooking', 'ready'];  isActiveStatus(status): boolean
TRANSITION_RIGHTS: Record<StaffRole, readonly OrderStatus[]>;  canRoleTransition(role, from, to): boolean
OrderDtoSchema += cookingAt | readyAt | servedAt | cancelledAt (iso | null), updatedAt (iso)
TransitionRequestSchema = { to: OrderStatus };  ActiveOrdersQuerySchema = { active?: '1' }
SocketTokenResponseSchema = { token, expiresInSeconds };  RushResponseSchema = { started: true, durationSeconds, ordersPlanned }
ServerToClientEvents, ClientToServerEvents, BoardSnapshot, SOCKET_ROOMS
// @tabletap/shared/server
SocketPrincipal, SocketTokenVerifyError, signSocketToken(principal, { secret, ttlSeconds, now? }), verifySocketToken(token, { secret, now? })
```

- [ ] **Step 1: Failing tests for the machine and the rights**

Append to `packages/shared/src/orders.test.ts` (create the file if the M1 machine tests live elsewhere):
```ts
import { ACTIVE_ORDER_STATUSES, ORDER_STATUSES, TRANSITION_RIGHTS, canRoleTransition, canTransition, isActiveStatus } from './index';

describe('M3 state machine', () => {
  it('allows placed → cooking while payments do not exist (ADR 0009)', () => {
    expect(canTransition('placed', 'cooking')).toBe(true);
    expect(canTransition('placed', 'ready')).toBe(false);
  });
  it('names the four active statuses', () => {
    expect(ACTIVE_ORDER_STATUSES).toEqual(['placed', 'paid', 'cooking', 'ready']);
    expect(ORDER_STATUSES.filter(isActiveStatus)).toEqual([...ACTIVE_ORDER_STATUSES]);
  });
  it('gives each role only its targets and never paid', () => {
    expect(TRANSITION_RIGHTS.kitchen).toEqual(['cooking', 'ready', 'served', 'cancelled']);
    expect(TRANSITION_RIGHTS.waiter).toEqual(['served', 'cancelled']);
    expect(TRANSITION_RIGHTS.admin).toEqual(['cooking', 'ready', 'served', 'cancelled']);
    for (const role of ['kitchen', 'waiter', 'admin'] as const) expect(TRANSITION_RIGHTS[role]).not.toContain('paid');
  });
  it.each([
    ['kitchen', 'placed', 'cooking', true],
    ['kitchen', 'cooking', 'ready', true],
    ['kitchen', 'ready', 'served', true],
    ['kitchen', 'placed', 'cancelled', true],
    ['kitchen', 'cooking', 'placed', false],
    ['waiter', 'placed', 'cooking', false],
    ['waiter', 'ready', 'served', true],
    ['admin', 'paid', 'cooking', true],
    ['admin', 'placed', 'paid', false],
  ] as const)('%s: %s → %s is %s', (role, from, to, allowed) => {
    expect(canRoleTransition(role, from, to)).toBe(allowed);
  });
});
```
Append to `packages/shared/src/api.test.ts` (reuse the file's `U1` constant):
```ts
import { ActiveOrdersQuerySchema, ERROR_CODES, OrderDtoSchema, RushResponseSchema, SOCKET_ROOMS, SocketTokenResponseSchema, TransitionRequestSchema } from './index';

describe('M3 contracts', () => {
  const base = { id: U1, number: 42, status: 'placed', tableId: U1, tableNumber: 7, items: [], subtotalCents: 0, totalCents: 0, note: null, placedAt: '2026-09-03T12:00:00.000Z', createdAt: '2026-09-03T12:00:00.000Z' };
  it('adds INVALID_TRANSITION', () => { expect(ERROR_CODES).toContain('INVALID_TRANSITION'); });
  it('requires updatedAt and the per-status timestamps on an order', () => {
    expect(OrderDtoSchema.safeParse(base).success).toBe(false);
    const full = { ...base, updatedAt: base.createdAt, cookingAt: null, readyAt: null, servedAt: null, cancelledAt: null };
    expect(OrderDtoSchema.parse({ ...full, guestSessionId: 'x' })).not.toHaveProperty('guestSessionId');
  });
  it('validates the small request and response shapes', () => {
    expect(TransitionRequestSchema.safeParse({ to: 'cooking' }).success).toBe(true);
    expect(TransitionRequestSchema.safeParse({ to: 'baked' }).success).toBe(false);
    expect(ActiveOrdersQuerySchema.parse({})).toEqual({});
    expect(ActiveOrdersQuerySchema.safeParse({ active: 'yes' }).success).toBe(false);
    expect(SocketTokenResponseSchema.safeParse({ token: 't', expiresInSeconds: 60 }).success).toBe(true);
    expect(RushResponseSchema.safeParse({ started: true, durationSeconds: 60, ordersPlanned: 12 }).success).toBe(true);
  });
  it('names the rooms', () => {
    expect(SOCKET_ROOMS.kitchen).toBe('kitchen');
    expect(SOCKET_ROOMS.table(U1)).toBe(`table:${U1}`);
  });
});
```
Create `packages/shared/src/server/socket-token.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SocketTokenVerifyError, signSocketToken, signTableToken, verifySocketToken } from './index';

const SECRET = 'test-socket-token-secret-0123456789abcdef';
const U1 = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60';
const staff = { kind: 'staff', userId: U1, role: 'kitchen', restaurantId: U1 } as const;
const guest = { kind: 'guest', guestSessionId: U1, tableId: U1, tableNumber: 7, restaurantId: U1 } as const;

describe('socket token', () => {
  it('round-trips a staff and a guest principal', async () => {
    expect(await verifySocketToken(await signSocketToken(staff, { secret: SECRET, ttlSeconds: 60 }), { secret: SECRET })).toEqual(staff);
    expect(await verifySocketToken(await signSocketToken(guest, { secret: SECRET, ttlSeconds: 60 }), { secret: SECRET })).toEqual(guest);
  });
  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const token = await signSocketToken(staff, { secret: SECRET, ttlSeconds: 60, now: new Date('2026-09-03T12:00:00Z') });
    await expect(verifySocketToken(token, { secret: SECRET, now: new Date('2026-09-03T12:02:00Z') })).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });
  it('rejects the wrong secret, a table token and a bad role with TOKEN_INVALID', async () => {
    const token = await signSocketToken(staff, { secret: SECRET, ttlSeconds: 60 });
    await expect(verifySocketToken(token, { secret: 'another-secret-that-is-long-enough-000' })).rejects.toBeInstanceOf(SocketTokenVerifyError);
    const table = await signTableToken({ tableId: U1, restaurantId: U1, tableNumber: 7 }, { secret: SECRET, ttlSeconds: 60 });
    await expect(verifySocketToken(table, { secret: SECRET })).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/shared test`
Expected: FAIL (`TRANSITION_RIGHTS`, `signSocketToken` and the schemas are not exported).

- [ ] **Step 3: Implement**

`packages/shared/src/errors.ts`: insert `'INVALID_TRANSITION',` before `'INTERNAL',`.

`packages/shared/src/orders.ts` — replace the transitions block and append:
```ts
import type { StaffRole } from './roles';

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['placed'],
  // 'cooking' is the M3 interim edge (ADR 0009): until payments exist an order is cookable as
  // soon as it is placed. M4 removes it together with the webhook that sets 'paid'.
  placed: ['paid', 'cooking', 'cancelled'],
  paid: ['cooking', 'cancelled'],
  cooking: ['ready'],
  ready: ['served'],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** The statuses a kitchen board shows; served and cancelled tickets leave it. */
export const ACTIVE_ORDER_STATUSES = ['placed', 'paid', 'cooking', 'ready'] as const;
export function isActiveStatus(status: OrderStatus): boolean {
  return (ACTIVE_ORDER_STATUSES as readonly OrderStatus[]).includes(status);
}

/** Which target statuses each staff role may set. 'paid' belongs to the payment webhook (M4). */
export const TRANSITION_RIGHTS: Record<StaffRole, readonly OrderStatus[]> = {
  kitchen: ['cooking', 'ready', 'served', 'cancelled'],
  waiter: ['served', 'cancelled'],
  admin: ['cooking', 'ready', 'served', 'cancelled'],
};

export function canRoleTransition(role: StaffRole, from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITION_RIGHTS[role].includes(to) && canTransition(from, to);
}
```

`packages/shared/src/api.ts` — extend `OrderDtoSchema` and append the new schemas:
```ts
export const OrderDtoSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  status: OrderStatusSchema,
  tableId: z.uuid(),
  tableNumber: z.number().int().positive(),
  items: z.array(OrderItemDtoSchema),
  subtotalCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  note: z.string().nullable(),
  placedAt: z.iso.datetime().nullable(),
  cookingAt: z.iso.datetime().nullable(),
  readyAt: z.iso.datetime().nullable(),
  servedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const TransitionRequestSchema = z.object({ to: OrderStatusSchema });
export type TransitionRequest = z.infer<typeof TransitionRequestSchema>;
export const ActiveOrdersQuerySchema = z.object({ active: z.literal('1').optional() });
export const SocketTokenResponseSchema = z.object({
  token: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
});
export type SocketTokenResponse = z.infer<typeof SocketTokenResponseSchema>;
export const RushResponseSchema = z.object({
  started: z.literal(true),
  durationSeconds: z.number().int().positive(),
  ordersPlanned: z.number().int().positive(),
});
export type RushResponse = z.infer<typeof RushResponseSchema>;
```

`packages/shared/src/events.ts` (replace the file):
```ts
import type { OrderDto } from './api';

/** What a client receives right after `subscribe`: everything it should currently show. */
export interface BoardSnapshot {
  orders: OrderDto[];
  serverTime: string;
}

export interface ServerToClientEvents {
  'order:created': (payload: { order: OrderDto }) => void;
  'order:updated': (payload: { order: OrderDto }) => void;
  /** The hourly demo reset wiped the orders: drop local state and subscribe again. */
  'demo:reset': () => void;
}

export interface ClientToServerEvents {
  subscribe: (ack: (snapshot: BoardSnapshot) => void) => void;
}

/** Rooms are assigned by the server from the socket's principal; clients never name one. */
export const SOCKET_ROOMS = {
  kitchen: 'kitchen',
  table: (tableId: string) => `table:${tableId}`,
} as const;
```

`packages/shared/src/server/socket-token.ts`:
```ts
import { SignJWT, errors, jwtVerify } from 'jose';
import { StaffRoleSchema, type StaffRole } from '../roles';

export type SocketPrincipal =
  | { kind: 'staff'; userId: string; role: StaffRole; restaurantId: string }
  | { kind: 'guest'; guestSessionId: string; tableId: string; tableNumber: number; restaurantId: string };
export type SocketTokenErrorCode = 'TOKEN_INVALID' | 'TOKEN_EXPIRED';

export class SocketTokenVerifyError extends Error {
  constructor(public readonly code: SocketTokenErrorCode) {
    super(code);
    this.name = 'SocketTokenVerifyError';
  }
}

/** A distinct typ: a table token from a QR code must never open a socket, nor the reverse. */
const TYP = 'tt-socket';
const ALG = 'HS256';
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSocketToken(
  principal: SocketPrincipal,
  opts: { secret: string; ttlSeconds: number; now?: Date },
): Promise<string> {
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const claims =
    principal.kind === 'staff'
      ? { kind: 'staff', role: principal.role, rid: principal.restaurantId }
      : { kind: 'guest', tid: principal.tableId, tn: principal.tableNumber, rid: principal.restaurantId };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, typ: TYP })
    .setSubject(principal.kind === 'staff' ? principal.userId : principal.guestSessionId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + opts.ttlSeconds)
    .sign(key(opts.secret));
}

export async function verifySocketToken(
  token: string,
  opts: { secret: string; now?: Date },
): Promise<SocketPrincipal> {
  try {
    const { payload } = await jwtVerify(token, key(opts.secret), {
      algorithms: [ALG],
      typ: TYP,
      currentDate: opts.now,
    });
    const { sub, kind, rid } = payload;
    if (typeof sub !== 'string' || typeof rid !== 'string')
      throw new SocketTokenVerifyError('TOKEN_INVALID');
    if (kind === 'staff') {
      const role = StaffRoleSchema.safeParse(payload['role']);
      if (!role.success) throw new SocketTokenVerifyError('TOKEN_INVALID');
      return { kind: 'staff', userId: sub, role: role.data, restaurantId: rid };
    }
    if (kind === 'guest' && typeof payload['tid'] === 'string' && typeof payload['tn'] === 'number')
      return { kind: 'guest', guestSessionId: sub, tableId: payload['tid'], tableNumber: payload['tn'], restaurantId: rid };
    throw new SocketTokenVerifyError('TOKEN_INVALID');
  } catch (err) {
    if (err instanceof SocketTokenVerifyError) throw err;
    if (err instanceof errors.JWTExpired) throw new SocketTokenVerifyError('TOKEN_EXPIRED');
    throw new SocketTokenVerifyError('TOKEN_INVALID');
  }
}
```
`packages/shared/src/server/index.ts`: add `export * from './socket-token';`.

- [ ] **Step 4: Run the shared tests, expect green**

Run: `corepack pnpm --filter @tabletap/shared test`
Expected: PASS. Also update the `OrderDto` fixture in `packages/shared/src/api.test.ts` (around line 164) with `cookingAt: null, readyAt: null, servedAt: null, cancelledAt: null, updatedAt: '2026-09-03T10:00:00.000Z'` if it now fails.

- [ ] **Step 5: The column and the DTO (keeps every package compiling)**

`packages/db/src/schema/orders.ts`: after `paidAt`, add `cookingAt: timestamp('cooking_at', { withTimezone: true }),`.

Generate the migration: `corepack pnpm --filter @tabletap/db exec drizzle-kit generate --name cooking-at`
Expected: `packages/db/migrations/0002_cooking-at.sql` containing exactly `ALTER TABLE "orders" ADD COLUMN "cooking_at" timestamp with time zone;` plus `meta/0002_snapshot.json` and a new `_journal.json` entry. Commit all three with the schema.

`apps/api/src/lib/orders.ts` — `toDto` returns the new fields:
```ts
    placedAt: order.placedAt ? order.placedAt.toISOString() : null,
    cookingAt: order.cookingAt ? order.cookingAt.toISOString() : null,
    readyAt: order.readyAt ? order.readyAt.toISOString() : null,
    servedAt: order.servedAt ? order.servedAt.toISOString() : null,
    cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
```
Web fixtures: add the same five fields (`null` timestamps, `updatedAt` equal to `createdAt`) to the `OrderDto` objects in `apps/web/components/order/order-screen.test.tsx` (line 24) and `apps/web/components/checkout/checkout-screen.test.tsx` (line 59).

Append to `apps/api/src/routes/orders.test.ts`, inside the first `it` after `expect(order.placedAt).not.toBeNull();`:
```ts
    expect(order).toMatchObject({ cookingAt: null, readyAt: null, servedAt: null, cancelledAt: null });
    expect(order.updatedAt).toBe(order.createdAt);
```

- [ ] **Step 6: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all green (db 15+, shared 21 + new, api 85 + 1, web 48, ui 30).

- [ ] **Step 7: Commit**

```bash
git add packages/shared packages/db apps/api apps/web
git commit -m "feat(shared,db): M3 contracts, interim state machine, socket token and orders.cooking_at"
```

---

### Task 2: Order events, the shared insert path, the active list and the socket secret

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**
- Create: `apps/api/src/lib/order-events.ts`, `apps/api/src/lib/order-events.test.ts`
- Modify: `apps/api/src/lib/orders.ts`, `apps/api/src/lib/orders.test.ts` (create if absent), `apps/api/src/routes/orders.ts`, `apps/api/src/routes/orders.test.ts`, `apps/api/src/server.ts`, `apps/api/src/types.ts`, `apps/api/src/config.ts`, `apps/api/src/test/helpers.ts`, `.env.example`

**Interfaces (produced):**
```ts
// apps/api/src/lib/order-events.ts
class OrderEvents extends EventEmitter<{ 'order:created': [InternalOrderDto]; 'order:updated': [InternalOrderDto]; 'demo:reset': [] }>
app.orderEvents: OrderEvents            // decorated in buildApp, before any plugin
// apps/api/src/lib/orders.ts
InternalOrderDto = OrderDto & { guestSessionId: string | null; restaurantId: string }
insertPlacedOrder(tx, input: { restaurantId; tableId; guestSessionId: string | null; lines: OrderLine[]; note: string | null; idempotencyKey: string; actor: { actorType: 'guest' | 'system'; actorId: string | null }; auditPayload?: Record<string, unknown>; now: Date }): Promise<OrderRow>
hydrate(db, rows): Promise<InternalOrderDto[]>          // now exported
listOrders(db, { guestSessionId } | { restaurantId; active?: boolean }, limit?)   // active: ACTIVE_ORDER_STATUSES, oldest placedAt first, limit 200
createOrder(db, input, events?: OrderEvents)             // emits 'order:created' after commit when created
// apps/api/src/config.ts
SOCKET_TOKEN_SECRET: string (min 32)
```

- [ ] **Step 1: Failing tests**

Create `apps/api/src/lib/order-events.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { OrderEvents } from './order-events';

describe('OrderEvents', () => {
  it('is a typed emitter with the three M3 events', () => {
    const events = new OrderEvents();
    const seen: string[] = [];
    events.on('order:created', (o) => seen.push(`created:${o.id}`));
    events.on('demo:reset', () => seen.push('reset'));
    events.emit('order:created', { id: 'a' } as never);
    events.emit('demo:reset');
    expect(seen).toEqual(['created:a', 'reset']);
  });
});
```
Append to `apps/api/src/routes/orders.test.ts`:
```ts
import { ACTIVE_ORDER_STATUSES } from '@tabletap/shared';
import { signInAs } from '../test/helpers';

describe('orders: events and the active list', () => {
  it('emits order:created with the internal DTO after a guest places an order', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 5);
    const seen: string[] = [];
    ctx.app.orderEvents.once('order:created', (o) => seen.push(`${o.tableNumber}:${o.status}:${o.restaurantId.length}`));
    const res = await post(cookie, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 1 }] });
    expect(res.statusCode).toBe(201);
    expect(seen).toEqual(['5:placed:36']);
  });
  it('GET /api/orders?active=1 lists active orders for staff, oldest first', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/orders?active=1', headers: { cookie: kitchen } });
    expect(res.statusCode).toBe(200);
    const { orders } = OrdersResponseSchema.parse(res.json());
    expect(orders.length).toBeGreaterThan(1);
    for (const o of orders) expect(ACTIVE_ORDER_STATUSES).toContain(o.status);
    const times = orders.map((o) => Date.parse(o.placedAt ?? o.createdAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
  it('rejects a malformed active flag and ignores it for guests', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    expect((await ctx.app.inject({ method: 'GET', url: '/api/orders?active=yes', headers: { cookie: kitchen } })).statusCode).toBe(400);
    const { cookie } = await claimTable(ctx.app, ctx.db, 5);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/orders?active=1', headers: { cookie } })).statusCode).toBe(200);
  });
});
```
(`describe` blocks in this file share `ctx`, `post` and `byName` from the top-level `beforeAll`; keep the new block inside the outer `describe('orders')`.)

- [ ] **Step 2: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/api test`
Expected: FAIL (`./order-events` missing; `app.orderEvents` undefined; `?active=yes` answers 200).

- [ ] **Step 3: Implement**

`apps/api/src/lib/order-events.ts`:
```ts
import { EventEmitter } from 'node:events';
import type { InternalOrderDto } from './orders';

/**
 * The seam between the routes and the socket layer. Routes and the rush generator emit here
 * after their transaction commits; realtime/server.ts subscribes and broadcasts. Nothing that
 * writes an order knows a socket exists, and a test can assert on the emitter alone.
 */
export class OrderEvents extends EventEmitter<{
  'order:created': [order: InternalOrderDto];
  'order:updated': [order: InternalOrderDto];
  'demo:reset': [];
}> {}
```
`apps/api/src/types.ts`: add `orderEvents: OrderEvents;` to `FastifyInstance` (import type from `./lib/order-events`).

`apps/api/src/server.ts`: after `app.decorate('config', config);` add `app.decorate('orderEvents', new OrderEvents());` (import `{ OrderEvents } from './lib/order-events'`).

`apps/api/src/config.ts`: after `TABLE_TOKEN_SECRET` add
```ts
  /** Signs the 60-second socket handshake token (typ tt-socket). Distinct from the table token secret. */
  SOCKET_TOKEN_SECRET: z.string().min(32),
```
`apps/api/src/test/helpers.ts` `TEST_CONFIG`: add `SOCKET_TOKEN_SECRET: 'test-socket-token-secret-0123456789abcdef',`.
`.env.example`, after the `TABLE_TOKEN_SECRET` block:
```
# Signs the short-lived Socket.io handshake token (HS256). At least 32 chars, different from the table secret.
SOCKET_TOKEN_SECRET=dev-socket-token-secret-change-me-0123456789
```

`apps/api/src/lib/orders.ts`:
- `InternalOrderDto = OrderDto & { guestSessionId: string | null; restaurantId: string }`; `toDto` adds `restaurantId: order.restaurantId`.
- Export `hydrate`.
- Extract the transaction body of `createOrder` into an exported `insertPlacedOrder(tx, input)`:
```ts
export interface OrderLine { menuItemId: string; nameSnapshot: string; unitPriceCents: number; quantity: number; lineTotalCents: number }
export async function insertPlacedOrder(
  tx: Db,
  input: { restaurantId: string; tableId: string; guestSessionId: string | null; lines: OrderLine[]; note: string | null; idempotencyKey: string; actor: { actorType: 'guest' | 'system'; actorId: string | null }; auditPayload?: Record<string, unknown>; now: Date },
): Promise<OrderRow> {
  const subtotalCents = input.lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  const [inserted] = await tx.insert(schema.orders).values({ restaurantId: input.restaurantId, tableId: input.tableId, guestSessionId: input.guestSessionId, status: 'placed', subtotalCents, totalCents: subtotalCents, note: input.note, idempotencyKey: input.idempotencyKey, placedAt: input.now, createdAt: input.now, updatedAt: input.now }).returning();
  if (!inserted) throw new Error('order insert returned nothing');
  await tx.insert(schema.orderItems).values(input.lines.map((l) => ({ ...l, orderId: inserted.id, createdAt: input.now, updatedAt: input.now })));
  await recordAudit(tx, { actorType: input.actor.actorType, actorId: input.actor.actorId, action: 'order.placed', entityType: 'order', entityId: inserted.id, payload: { number: inserted.number, totalCents: subtotalCents, itemCount: input.lines.length, ...(input.auditPayload ?? {}) } });
  return inserted;
}
```
  `createOrder(db, input, events?)` calls `db.transaction((tx) => insertPlacedOrder(tx, { …, actor: { actorType: 'guest', actorId: principal.guestSessionId }, note: body.note && body.note.length > 0 ? body.note : null, now }))`, keeps the unique-violation replay, and after hydrating a created order does `events?.emit('order:created', dto)`. The transaction callback receives Drizzle's transaction type; `Db` is `PgDatabase<PgQueryResultHKT, typeof schema>`, which the transaction satisfies — keep the parameter typed as `Db`.
- `listOrders`: filter type `{ guestSessionId: string } | { restaurantId: string; active?: boolean }`. When `active` is true: `where = and(eq(restaurantId), inArray(schema.orders.status, [...ACTIVE_ORDER_STATUSES]))`, `orderBy(asc(schema.orders.placedAt), asc(schema.orders.number))`, `limit(200)`. Otherwise unchanged.

`apps/api/src/routes/orders.ts`:
- `POST /orders`: `createOrder(app.db, { … }, app.orderEvents)`.
- `GET /orders`: `const query = validate(ActiveOrdersQuerySchema, request.query);` staff → `listOrders(app.db, { restaurantId, active: query.active === '1' })`; guests ignore the flag. (`request.query` is typed `unknown` without a schema; the handler validates it.)

- [ ] **Step 4: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/api .env.example
git commit -m "feat(api): order events emitter, shared insert path, active order list and the socket secret"
```

---

### Task 3: Order transitions

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**
- Create: `apps/api/src/lib/transitions.ts`, `apps/api/src/lib/transitions.test.ts`
- Modify: `apps/api/src/routes/orders.ts`, `apps/api/src/routes/orders.test.ts`, `apps/api/src/lib/errors.ts` (only if `AppError` needs no change — check it accepts any `ErrorCode`)

**Interfaces (produced):**
```ts
transitionOrder(db, events, { orderId, to, actor: StaffPrincipal, restaurantId, now? }): Promise<InternalOrderDto>
POST /api/orders/:id/transition  body { to }  → 200 { order }  | 403 FORBIDDEN | 404 NOT_FOUND | 409 INVALID_TRANSITION { from, to, current }
GET  /api/orders/:id             params validated in the handler (401 before 400)
```
`StaffPrincipal` is `Extract<Principal, { kind: 'staff' }>` (define it locally in `transitions.ts` if `@tabletap/shared` does not export one).

- [ ] **Step 1: Failing tests**

Create `apps/api/src/lib/transitions.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { IDEMPOTENCY_KEY_HEADER, MenuResponseSchema, OrderResponseSchema } from '@tabletap/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, signInAs } from '../test/helpers';
import { transitionOrder } from './transitions';

describe('transitionOrder', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let restaurantId: string;
  const kitchen = { kind: 'staff', userId: 'u-kitchen', email: 'k@x', name: 'K', role: 'kitchen' } as const;
  const waiter = { ...kitchen, userId: 'u-waiter', role: 'waiter' } as const;

  async function placeOrder(tableNumber: number): Promise<string> {
    const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
    const menu = MenuResponseSchema.parse((await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json());
    const item = menu.categories[0]!.items[0]!;
    const res = await ctx.app.inject({ method: 'POST', url: '/api/orders', headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() }, payload: { items: [{ menuItemId: item.id, quantity: 1 }] } });
    return OrderResponseSchema.parse(res.json()).order.id;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    [{ id: restaurantId }] = await ctx.db.select({ id: schema.restaurants.id }).from(schema.restaurants);
  });
  afterAll(async () => { await ctx.close(); });

  it('moves placed → cooking, stamps cookingAt and updatedAt, audits and emits', async () => {
    const orderId = await placeOrder(2);
    const seen: string[] = [];
    ctx.app.orderEvents.once('order:updated', (o) => seen.push(o.status));
    const now = new Date('2026-09-03T12:00:00Z');
    const dto = await transitionOrder(ctx.db, ctx.app.orderEvents, { orderId, to: 'cooking', actor: kitchen, restaurantId, now });
    expect(dto.status).toBe('cooking');
    expect(dto.cookingAt).toBe(now.toISOString());
    expect(dto.updatedAt).toBe(now.toISOString());
    expect(seen).toEqual(['cooking']);
    const [audit] = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'order.transition'));
    expect(audit).toMatchObject({ actorType: 'user', actorId: 'u-kitchen', entityId: orderId, payload: { from: 'placed', to: 'cooking' } });
  });
  it('refuses a target the role may not set (403) and an edge the machine forbids (409)', async () => {
    const orderId = await placeOrder(2);
    await expect(transitionOrder(ctx.db, ctx.app.orderEvents, { orderId, to: 'cooking', actor: waiter, restaurantId })).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
    await expect(transitionOrder(ctx.db, ctx.app.orderEvents, { orderId, to: 'served', actor: kitchen, restaurantId })).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409, details: { from: 'placed', to: 'served', current: 'placed' } });
  });
  it('answers the loser of a concurrent bump with 409 and the current status', async () => {
    const orderId = await placeOrder(3);
    const bump = () => transitionOrder(ctx.db, ctx.app.orderEvents, { orderId, to: 'cooking', actor: kitchen, restaurantId });
    const results = await Promise.allSettled([bump(), bump()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'INVALID_TRANSITION', details: { current: 'cooking' } });
  });
  it('hides orders of another restaurant behind 404', async () => {
    const orderId = await placeOrder(3);
    await expect(transitionOrder(ctx.db, ctx.app.orderEvents, { orderId, to: 'cooking', actor: kitchen, restaurantId: randomUUID() })).rejects.toMatchObject({ status: 404 });
  });
});
```
(`AppError` exposes `code`, `status` and `details` — check `apps/api/src/lib/errors.ts` for the exact property names and adjust the `toMatchObject` keys.)

Append to `apps/api/src/routes/orders.test.ts` inside `describe('orders')`:
```ts
describe('POST /api/orders/:id/transition', () => {
  const place = async (tableNumber: number) => {
    const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
    const res = await post(cookie, { items: [{ menuItemId: byName['House Lemonade']!.id, quantity: 1 }] });
    return OrderResponseSchema.parse(res.json()).order;
  };
  const bump = (cookie: string, id: string, to: string) =>
    ctx.app.inject({ method: 'POST', url: `/api/orders/${id}/transition`, headers: { cookie }, payload: { to } });

  it('lets the kitchen walk a ticket to served and answers each step with the order', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const order = await place(9);
    for (const to of ['cooking', 'ready', 'served']) {
      const res = await bump(kitchen, order.id, to);
      expect(res.statusCode).toBe(200);
      expect(OrderResponseSchema.parse(res.json()).order.status).toBe(to);
      expect(res.json().order).not.toHaveProperty('guestSessionId');
    }
  });
  it('answers 401 anonymous, 403 guest and waiter-for-cooking, 400 malformed body, 404 unknown', async () => {
    const order = await place(9);
    const { cookie: guest } = await claimTable(ctx.app, ctx.db, 9);
    const waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    expect((await ctx.app.inject({ method: 'POST', url: `/api/orders/${order.id}/transition`, payload: { to: 'cooking' } })).statusCode).toBe(401);
    expect((await bump(guest, order.id, 'cooking')).statusCode).toBe(403);
    expect((await bump(waiter, order.id, 'cooking')).statusCode).toBe(403);
    expect((await bump(kitchen, order.id, 'baked')).statusCode).toBe(400);
    expect((await bump(kitchen, randomUUID(), 'cooking')).statusCode).toBe(404);
    expect((await bump(kitchen, 'not-a-uuid', 'cooking')).statusCode).toBe(400);
  });
  it('GET /api/orders/:id answers 401 before 400 for a malformed id', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/orders/not-a-uuid' })).statusCode).toBe(401);
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    expect((await ctx.app.inject({ method: 'GET', url: '/api/orders/not-a-uuid', headers: { cookie: kitchen } })).statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/api test`
Expected: FAIL (`./transitions` missing; the route answers 404 for every transition; the malformed-id GET answers 400 anonymously).

- [ ] **Step 3: Implement `apps/api/src/lib/transitions.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import { TRANSITION_RIGHTS, canTransition, type OrderStatus, type Principal } from '@tabletap/shared';
import { recordAudit } from './audit';
import { AppError } from './errors';
import type { OrderEvents } from './order-events';
import { loadOrder, type InternalOrderDto } from './orders';

export type StaffPrincipal = Extract<Principal, { kind: 'staff' }>;

/** The column a target status stamps; 'paid' is listed for M4, no M3 role can reach it. */
const STAMP: Partial<Record<OrderStatus, 'paidAt' | 'cookingAt' | 'readyAt' | 'servedAt' | 'cancelledAt'>> = {
  paid: 'paidAt', cooking: 'cookingAt', ready: 'readyAt', served: 'servedAt', cancelled: 'cancelledAt',
};

const invalid = (from: OrderStatus, to: OrderStatus, current: OrderStatus) =>
  new AppError('INVALID_TRANSITION', 409, `This order is ${current} now.`, { from, to, current });

/**
 * Three checks, then one guarded UPDATE. The WHERE on the old status is what makes two cooks
 * bumping the same ticket safe: the second update matches nothing and is told what the first one did.
 */
export async function transitionOrder(
  db: Db,
  events: OrderEvents,
  input: { orderId: string; to: OrderStatus; actor: StaffPrincipal; restaurantId: string; now?: Date },
): Promise<InternalOrderDto> {
  const now = input.now ?? new Date();
  const current = await loadOrder(db, input.orderId);
  if (!current || current.restaurantId !== input.restaurantId)
    throw new AppError('NOT_FOUND', 404, 'Order not found.');
  const from = current.status;
  if (!TRANSITION_RIGHTS[input.actor.role].includes(input.to))
    throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
  if (!canTransition(from, input.to)) throw invalid(from, input.to, from);

  const stamp = STAMP[input.to];
  const moved = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.orders)
      .set({ status: input.to, updatedAt: now, ...(stamp ? { [stamp]: now } : {}) })
      .where(and(eq(schema.orders.id, input.orderId), eq(schema.orders.status, from)))
      .returning({ id: schema.orders.id });
    if (!row) return false;
    await recordAudit(tx, {
      actorType: 'user', actorId: input.actor.userId, action: 'order.transition', entityType: 'order',
      entityId: input.orderId, payload: { from, to: input.to, number: current.number },
    });
    return true;
  });
  if (!moved) {
    const latest = await loadOrder(db, input.orderId);
    throw invalid(from, input.to, latest?.status ?? from);
  }
  const dto = (await loadOrder(db, input.orderId))!;
  events.emit('order:updated', dto);
  return dto;
}
```

- [ ] **Step 4: The routes (`apps/api/src/routes/orders.ts`)**

- `GET /orders/:id`: drop `schema.params`; first line of the handler `const { id } = validate(z.object({ id: z.uuid() }), request.params);`.
- Add after it:
```ts
  r.post(
    '/orders/:id/transition',
    {
      preHandler: requireAction('orders.transition'),
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          // One bucket per signed-in browser: the cookie jar is opaque and already parsed.
          keyGenerator: (request) => (request.headers.cookie ? `session:${request.headers.cookie}` : `ip:${request.ip}`),
        },
      },
      schema: { response: { 200: OrderResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff') throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const { id } = validate(z.object({ id: z.uuid() }), request.params);
      const body = validate(TransitionRequestSchema, request.body);
      const order = await transitionOrder(app.db, app.orderEvents, {
        orderId: id, to: body.to, actor: p, restaurantId: await restaurantIdFor(app.db, p),
      });
      return { order: strip(order) };
    },
  );
```

- [ ] **Step 5: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): order transitions with role rights, atomic updates and audit"
```

---

### Task 4: Socket token route and the Socket.io layer

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**
- Create: `apps/api/src/routes/socket-token.ts`, `apps/api/src/realtime/server.ts`, `apps/api/src/realtime/server.test.ts`
- Modify: `apps/api/package.json` (`socket.io`), `apps/api/src/server.ts`, `apps/api/src/types.ts`

**Interfaces (produced):**
```ts
POST /api/socket-token  (requireAuthenticated, 30/min per ip) → { token, expiresInSeconds: 60 }
SOCKET_TOKEN_TTL_SECONDS = 60                     // apps/api/src/routes/socket-token.ts
realtimePlugin                                    // apps/api/src/realtime/server.ts; decorates app.io: RealtimeServer
type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { principal: SocketPrincipal }>
```
Handshake: `auth.token` verified with `verifySocketToken`; failure → `connect_error` whose `data.code` is `TOKEN_INVALID` or `TOKEN_EXPIRED`. Rooms: staff → `kitchen`, guest → `table:<tableId>`. `subscribe(ack)` → `{ orders, serverTime }`. `order:created` / `order:updated` go to both rooms of the order; `demo:reset` to everyone.

- [ ] **Step 1: Dependency**

Run: `corepack pnpm --filter @tabletap/api add --save-exact socket.io@4.8.3 && corepack pnpm --filter @tabletap/api add --save-dev --save-exact socket.io-client@4.8.3`

- [ ] **Step 2: Failing tests — `apps/api/src/realtime/server.test.ts`**

```ts
import { IDEMPOTENCY_KEY_HEADER, MenuResponseSchema, OrderResponseSchema, SocketTokenResponseSchema, type BoardSnapshot, type ClientToServerEvents, type ServerToClientEvents } from '@tabletap/shared';
import { signSocketToken, signTableToken } from '@tabletap/shared/server';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, claimTable, createTestApp, signInAs } from '../test/helpers';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('realtime', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let url: string;
  const clients: Client[] = [];

  const tokenFor = async (cookie: string) =>
    SocketTokenResponseSchema.parse((await ctx.app.inject({ method: 'POST', url: '/api/socket-token', headers: { cookie } })).json()).token;
  const connect = (auth: Record<string, string>) =>
    new Promise<Client>((resolve, reject) => {
      const socket: Client = io(url, { auth, transports: ['websocket'], reconnection: false });
      clients.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (err) => reject(err));
    });
  const subscribe = (socket: Client) => new Promise<BoardSnapshot>((resolve) => socket.emit('subscribe', resolve));
  const nextEvent = <K extends 'order:created' | 'order:updated'>(socket: Client, event: K, ms = 1500) =>
    new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      socket.once(event, ({ order }) => { clearTimeout(timer); resolve(order.id); });
    });
  const placeOrder = async (tableNumber: number) => {
    const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
    const menu = MenuResponseSchema.parse((await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json());
    const res = await ctx.app.inject({ method: 'POST', url: '/api/orders', headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() }, payload: { items: [{ menuItemId: menu.categories[0]!.items[0]!.id, quantity: 1 }] } });
    return { cookie, order: OrderResponseSchema.parse(res.json()).order };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
  });
  afterEach(() => { for (const c of clients.splice(0)) c.disconnect(); });
  afterAll(async () => { await ctx.close(); });

  it('mints a 60-second token for staff and guests, none for anonymous', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'POST', url: '/api/socket-token', headers: { cookie: kitchen } });
    expect(res.statusCode).toBe(200);
    expect(SocketTokenResponseSchema.parse(res.json()).expiresInSeconds).toBe(60);
    const { cookie } = await claimTable(ctx.app, ctx.db, 4);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/socket-token', headers: { cookie } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/socket-token' })).statusCode).toBe(401);
  });
  it('refuses a missing, expired or table-typed token with the error code', async () => {
    await expect(connect({})).rejects.toMatchObject({ data: { code: 'TOKEN_INVALID' } });
    const expired = await signSocketToken({ kind: 'staff', userId: 'u', role: 'kitchen', restaurantId: randomUUID() }, { secret: TEST_CONFIG.SOCKET_TOKEN_SECRET, ttlSeconds: 60, now: new Date(Date.now() - 120_000) });
    await expect(connect({ token: expired })).rejects.toMatchObject({ data: { code: 'TOKEN_EXPIRED' } });
    const table = await signTableToken({ tableId: randomUUID(), restaurantId: randomUUID(), tableNumber: 7 }, { secret: TEST_CONFIG.SOCKET_TOKEN_SECRET, ttlSeconds: 60 });
    await expect(connect({ token: table })).rejects.toMatchObject({ data: { code: 'TOKEN_INVALID' } });
  });
  it('gives staff the active snapshot and every order event', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const socket = await connect({ token: await tokenFor(kitchen) });
    const { order } = await placeOrder(6);
    const snapshot = await subscribe(socket);
    expect(snapshot.orders.map((o) => o.id)).toContain(order.id);
    expect(snapshot.orders.every((o) => !('guestSessionId' in o))).toBe(true);
    const created = nextEvent(socket, 'order:created');
    const second = await placeOrder(6);
    expect(await created).toBe(second.order.id);
  });
  it('gives a guest only its own table', async () => {
    const seven = await placeOrder(7);
    const three = await claimTable(ctx.app, ctx.db, 3);
    const guest7 = await connect({ token: await tokenFor(seven.cookie) });
    const guest3 = await connect({ token: await tokenFor(three.cookie) });
    expect((await subscribe(guest7)).orders.map((o) => o.id)).toEqual([seven.order.id]);
    expect((await subscribe(guest3)).orders).toEqual([]);
    const on7 = nextEvent(guest7, 'order:updated');
    const on3 = nextEvent(guest3, 'order:updated', 500);
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    await ctx.app.inject({ method: 'POST', url: `/api/orders/${seven.order.id}/transition`, headers: { cookie: kitchen }, payload: { to: 'cooking' } });
    expect(await on7).toBe(seven.order.id);
    expect(await on3).toBeNull();
  });
  it('tells every socket about a demo reset', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const socket = await connect({ token: await tokenFor(kitchen) });
    const reset = new Promise<boolean>((resolve) => socket.once('demo:reset', () => resolve(true)));
    ctx.app.orderEvents.emit('demo:reset');
    expect(await reset).toBe(true);
  });
});
```

- [ ] **Step 3: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/api test -- realtime`
Expected: FAIL (404 on `/api/socket-token`; connections refused or hang — each test times out at Vitest's default 5 s).

- [ ] **Step 4: Implement**

`apps/api/src/routes/socket-token.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SocketTokenResponseSchema } from '@tabletap/shared';
import { signSocketToken, type SocketPrincipal } from '@tabletap/shared/server';
import { AppError } from '../lib/errors';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAuthenticated } from '../plugins/rbac';

/** Short on purpose: the client fetches a fresh one before every connection attempt. */
export const SOCKET_TOKEN_TTL_SECONDS = 60;

export async function socketTokenRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/socket-token',
    {
      preHandler: requireAuthenticated(),
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { response: { 200: SocketTokenResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      let principal: SocketPrincipal;
      if (p.kind === 'staff')
        principal = { kind: 'staff', userId: p.userId, role: p.role, restaurantId: await restaurantIdFor(app.db, p) };
      else if (p.kind === 'guest')
        principal = { kind: 'guest', guestSessionId: p.guestSessionId, tableId: p.tableId, tableNumber: p.tableNumber, restaurantId: p.restaurantId };
      else throw new AppError('UNAUTHORIZED', 401, 'Sign in to continue.');
      const token = await signSocketToken(principal, { secret: app.config.SOCKET_TOKEN_SECRET, ttlSeconds: SOCKET_TOKEN_TTL_SECONDS });
      return { token, expiresInSeconds: SOCKET_TOKEN_TTL_SECONDS };
    },
  );
}
```

`apps/api/src/realtime/server.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import { OrderDtoSchema, SOCKET_ROOMS, type ClientToServerEvents, type ServerToClientEvents } from '@tabletap/shared';
import { SocketTokenVerifyError, verifySocketToken, type SocketPrincipal } from '@tabletap/shared/server';
import { listOrders, type InternalOrderDto } from '../lib/orders';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { principal: SocketPrincipal }>;

/** socket.io surfaces `err.data` on the client's connect_error; the code goes there. */
const handshakeError = (code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED') =>
  Object.assign(new Error(code === 'TOKEN_EXPIRED' ? 'Your connection token expired.' : 'This connection is not valid.'), { data: { code } });

/**
 * Delivery only. Rooms come from the token's principal, never from the client; every payload
 * passes through the public schema so `guestSessionId` stays inside the API.
 */
export const realtimePlugin = fp(async (app: FastifyInstance) => {
  const io: RealtimeServer = new Server(app.server, { cors: { origin: app.config.WEB_ORIGIN }, serveClient: false });

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth['token'];
    if (typeof token !== 'string') return next(handshakeError('TOKEN_INVALID'));
    try {
      socket.data.principal = await verifySocketToken(token, { secret: app.config.SOCKET_TOKEN_SECRET });
      next();
    } catch (err) {
      next(handshakeError(err instanceof SocketTokenVerifyError ? err.code : 'TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const p = socket.data.principal;
    void socket.join(p.kind === 'staff' ? SOCKET_ROOMS.kitchen : SOCKET_ROOMS.table(p.tableId));
    socket.on('subscribe', async (ack) => {
      if (typeof ack !== 'function') return;
      const orders = p.kind === 'staff'
        ? await listOrders(app.db, { restaurantId: p.restaurantId, active: true })
        : await listOrders(app.db, { guestSessionId: p.guestSessionId });
      ack({ orders: orders.map((o) => OrderDtoSchema.parse(o)), serverTime: new Date().toISOString() });
    });
  });

  const publish = (event: 'order:created' | 'order:updated') => (order: InternalOrderDto) => {
    io.to(SOCKET_ROOMS.kitchen).to(SOCKET_ROOMS.table(order.tableId)).emit(event, { order: OrderDtoSchema.parse(order) });
  };
  app.orderEvents.on('order:created', publish('order:created'));
  app.orderEvents.on('order:updated', publish('order:updated'));
  app.orderEvents.on('demo:reset', () => io.emit('demo:reset'));

  app.decorate('io', io);
  app.addHook('onClose', async () => { await io.close(); });
});
```
`apps/api/src/types.ts`: add `io: RealtimeServer;` to `FastifyInstance`.
`apps/api/src/server.ts`: register `socketTokenRoutes` with prefix `/api` next to the other routes, and `await app.register(realtimePlugin);` after the routes.

If `io.close()` in `onClose` makes `app.close()` hang in tests, close the sockets first: `io.disconnectSockets(true)` then `await io.close()`.

- [ ] **Step 5: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: green; the realtime suite passes in under 10 s.

- [ ] **Step 6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): socket token and the Socket.io layer with kitchen and table rooms"
```

---

### Task 5: Simulate rush and the reset broadcast

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**
- Create: `apps/api/src/lib/rush.ts`, `apps/api/src/lib/rush.test.ts`, `apps/api/src/plugins/demo-rush.ts`
- Modify: `apps/api/src/plugins/demo-reset.ts`, `apps/api/src/routes/demo.ts`, `apps/api/src/routes/demo.test.ts` (create if absent), `apps/api/src/server.ts`, `apps/api/src/types.ts`

**Interfaces (produced):**
```ts
createRush({ db, events, log, durationMs = 60_000, count = 12, random = Math.random }): Rush
interface Rush { readonly running: boolean; readonly durationSeconds: number; readonly ordersPlanned: number; start(): boolean; stop(): void }
placeRushOrder({ db, events, random, now? }): Promise<InternalOrderDto>     // one system-actor order on a random active table
RUSH_NOTES: readonly string[]                                                 // six fixed notes
app.rush: Rush                                                                // plugins/demo-rush.ts
POST /api/demo/rush  (public, demo mode, 2/min per ip) → 200 RushResponse | 404 | 409 CONFLICT
```
The reset plugin stops a running rush before reseeding and emits `demo:reset` after.

- [ ] **Step 1: Failing tests — `apps/api/src/lib/rush.test.ts`**

```ts
import { schema } from '@tabletap/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../test/helpers';
import { RUSH_NOTES, createRush, placeRushOrder } from './rush';

describe('rush', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const log = { error: vi.fn() };
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('places one system order with real menu prices on an active table', async () => {
    const seen: string[] = [];
    ctx.app.orderEvents.once('order:created', (o) => seen.push(o.id));
    const dto = await placeRushOrder({ db: ctx.db, events: ctx.app.orderEvents, random: () => 0.2 });
    expect(dto.status).toBe('placed');
    expect(dto.items.length).toBeGreaterThan(0);
    expect(dto.note).toBe(RUSH_NOTES[Math.floor(0.2 * RUSH_NOTES.length)]);
    expect(seen).toEqual([dto.id]);
    const rows = await ctx.db.select().from(schema.auditLog);
    expect(rows.some((r) => r.entityId === dto.id && r.actorType === 'system' && (r.payload as { source?: string }).source === 'rush')).toBe(true);
  });
  it('spreads `count` orders over `durationMs`, runs once at a time, and stops on demand', async () => {
    const rush = createRush({ db: ctx.db, events: ctx.app.orderEvents, log, durationMs: 3_000, count: 3, random: () => 0.5 });
    const created: string[] = [];
    ctx.app.orderEvents.on('order:created', (o) => created.push(o.id));
    expect(rush.start()).toBe(true);
    expect(rush.start()).toBe(false);
    expect(rush.running).toBe(true);
    await vi.advanceTimersByTimeAsync(1_100);
    // The timers are fake; the database round-trips behind them are real. vi.waitFor advances
    // the fake clock between checks, so the pending inserts settle without a real sleep.
    await vi.waitFor(() => expect(created.length).toBe(2));
    rush.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(created.length).toBe(2);
    expect(rush.running).toBe(false);
  });
  it('finishes on its own after the last order', async () => {
    const rush = createRush({ db: ctx.db, events: ctx.app.orderEvents, log, durationMs: 1_000, count: 2, random: () => 0.5 });
    rush.start();
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.waitFor(() => expect(rush.running).toBe(false));
    expect(rush.start()).toBe(true);
    rush.stop();
  });
});
```
(With `random: () => 0.5` the jitter is 0, so order `i` fires at `i * durationMs / count`: 0, 1000, 2000 ms for the second test — two orders by 1100 ms. `vi.waitFor` is needed because PGlite I/O is not driven by the fake clock.)

Create or extend `apps/api/src/routes/demo.test.ts`:
```ts
import { RushResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/helpers';

describe('POST /api/demo/rush', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { ctx.app.rush.stop(); await ctx.close(); });

  it('starts a rush once and answers 409 while it runs', async () => {
    const first = await ctx.app.inject({ method: 'POST', url: '/api/demo/rush' });
    expect(first.statusCode).toBe(200);
    expect(RushResponseSchema.parse(first.json())).toEqual({ started: true, durationSeconds: 60, ordersPlanned: 12 });
    const second = await ctx.app.inject({ method: 'POST', url: '/api/demo/rush' });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('CONFLICT');
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/api test -- rush demo`
Expected: FAIL (`./rush` missing; `app.rush` undefined; route 404).

- [ ] **Step 3: Implement `apps/api/src/lib/rush.ts`**

```ts
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema, type Db } from '@tabletap/db';
import { DEMO_RESTAURANT_SLUG } from '@tabletap/db/seed';
import type { OrderEvents } from './order-events';
import { hydrate, insertPlacedOrder, type InternalOrderDto, type OrderLine } from './orders';

export const RUSH_NOTES = [
  'No onions, please.', 'Extra chili on the side.', 'Birthday at the table.',
  'Allergic to nuts.', 'Split the flatbread in two.', 'We are in a hurry.',
] as const;

const pick = <T>(items: readonly T[], random: () => number): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;

/** One order a guest could have placed: random active table, one to four available dishes. */
export async function placeRushOrder(input: { db: Db; events: OrderEvents; random?: () => number; now?: Date }): Promise<InternalOrderDto> {
  const random = input.random ?? Math.random;
  const now = input.now ?? new Date();
  const [restaurant] = await input.db.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
  if (!restaurant) throw new Error('demo restaurant is not seeded');
  const tables = await input.db.select({ id: schema.tables.id }).from(schema.tables).where(and(eq(schema.tables.restaurantId, restaurant.id), eq(schema.tables.isActive, true)));
  const dishes = await input.db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name, priceCents: schema.menuItems.priceCents })
    .from(schema.menuItems)
    .innerJoin(schema.menuCategories, eq(schema.menuCategories.id, schema.menuItems.categoryId))
    .where(and(eq(schema.menuCategories.restaurantId, restaurant.id), eq(schema.menuCategories.isActive, true), eq(schema.menuItems.isAvailable, true)));
  if (tables.length === 0 || dishes.length === 0) throw new Error('demo tables or menu are not seeded');

  const count = 1 + Math.floor(random() * 4);
  const chosen = new Map<string, (typeof dishes)[number]>();
  while (chosen.size < Math.min(count, dishes.length)) { const d = pick(dishes, random); chosen.set(d.id, d); }
  const lines: OrderLine[] = [...chosen.values()].map((d) => {
    const quantity = 1 + Math.floor(random() * 3);
    return { menuItemId: d.id, nameSnapshot: d.name, unitPriceCents: d.priceCents, quantity, lineTotalCents: d.priceCents * quantity };
  });
  const note = random() < 0.34 ? pick(RUSH_NOTES, random) : null;
  const row = await input.db.transaction((tx) =>
    insertPlacedOrder(tx, { restaurantId: restaurant.id, tableId: pick(tables, random).id, guestSessionId: null, lines, note, idempotencyKey: `rush:${randomUUID()}`, actor: { actorType: 'system', actorId: null }, auditPayload: { source: 'rush' }, now }),
  );
  const dto = (await hydrate(input.db, [row]))[0]!;
  input.events.emit('order:created', dto);
  return dto;
}

export interface Rush {
  readonly running: boolean;
  readonly durationSeconds: number;
  readonly ordersPlanned: number;
  start(): boolean;
  stop(): void;
}

/** Spreads `count` orders over `durationMs` with ±1 s jitter; one rush at a time per process. */
export function createRush(opts: { db: Db; events: OrderEvents; log: { error(obj: unknown, msg: string): void }; durationMs?: number; count?: number; random?: () => number }): Rush {
  const durationMs = opts.durationMs ?? 60_000;
  const count = opts.count ?? 12;
  const random = opts.random ?? Math.random;
  let timers: NodeJS.Timeout[] = [];
  let running = false;
  let pending = 0;
  const finish = () => { running = false; timers = []; pending = 0; };
  return {
    get running() { return running; },
    durationSeconds: Math.round(durationMs / 1000),
    ordersPlanned: count,
    start() {
      if (running) return false;
      running = true;
      pending = count;
      for (let i = 0; i < count; i += 1) {
        const at = Math.max(0, (i * durationMs) / count + (random() - 0.5) * 2_000);
        const timer = setTimeout(() => {
          placeRushOrder({ db: opts.db, events: opts.events, random })
            .catch((err: unknown) => opts.log.error({ err }, 'rush order failed'))
            .finally(() => { pending -= 1; if (pending === 0) finish(); });
        }, at);
        timer.unref?.();
        timers.push(timer);
      }
      return true;
    },
    stop() { for (const t of timers) clearTimeout(t); finish(); },
  };
}
```
Note for the first test: with `random: () => 0.2`, `count` is 1, the note branch fires (`0.2 < 0.34`) and `pick(RUSH_NOTES)` returns index `Math.floor(0.2 * 6) = 1`; the test's expectation uses the same formula, so it holds whatever the array length.

`apps/api/src/plugins/demo-rush.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { createRush } from '../lib/rush';

/** Always decorated so the route and the reset scheduler can rely on it; the route gates on demo mode. */
export const demoRushPlugin = fp(async (app: FastifyInstance) => {
  const rush = createRush({ db: app.db, events: app.orderEvents, log: { error: (obj, msg) => app.log.error(obj, msg) } });
  app.decorate('rush', rush);
  app.addHook('onClose', async () => rush.stop());
});
```
`apps/api/src/types.ts`: `rush: Rush;`. `apps/api/src/server.ts`: register `demoRushPlugin` before `demoResetPlugin`.

`apps/api/src/plugins/demo-reset.ts` `run`: `app.rush.stop();` before `seed(...)`, and `app.orderEvents.emit('demo:reset');` after the log line.

`apps/api/src/routes/demo.ts` — add:
```ts
  r.post(
    '/demo/rush',
    {
      config: { public: true, principal: false, rateLimit: { max: 2, timeWindow: '1 minute' } },
      schema: { response: { 200: RushResponseSchema } },
    },
    async () => {
      if (!app.config.demoMode) throw new AppError('NOT_FOUND', 404, 'Not found.');
      if (!app.rush.start()) throw new AppError('CONFLICT', 409, 'A rush is already running. Give it a minute.');
      return { started: true as const, durationSeconds: app.rush.durationSeconds, ordersPlanned: app.rush.ordersPlanned };
    },
  );
```
(`r` = `app.withTypeProvider<ZodTypeProvider>()`, hoisted once at the top of `demoRoutes`.)

- [ ] **Step 4: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/api
git commit -m "feat(api): simulate rush generator, endpoint and the demo reset broadcast"
```

---

### Task 6: Web foundation — socket client, board store, timer helpers, chime, kitchen type scale

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**
- Create: `apps/web/lib/socket.ts`, `apps/web/lib/board-store.ts`, `apps/web/lib/board-store.test.ts`, `apps/web/lib/timer-threshold.ts`, `apps/web/lib/timer-threshold.test.ts`, `apps/web/lib/chime.ts`
- Modify: `apps/web/package.json` (`socket.io-client`), `.env.example`, `packages/ui/theme.css`, `packages/ui/src/tokens.test.ts`, `design-system/tabletap/pages/kitchen.md`

**Interfaces (produced):**
```ts
// apps/web/lib/socket.ts
API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000'
type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>
createSocket(origin = API_ORIGIN): AppSocket        // autoConnect: false; auth fetches POST /api/socket-token per attempt
// apps/web/lib/board-store.ts
applySnapshot(orders: OrderDto[]): BoardState;  applyEvent(state, order): BoardState;  ordersOf(state): OrderDto[]
type Column = 'new' | 'cooking' | 'ready';  COLUMNS: { key, title, statuses }[];  columnsOf(orders: OrderDto[]): Record<Column, OrderDto[]>
NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>>;  BUMP_LABEL: Partial<Record<OrderStatus, 'Start' | 'Ready' | 'Served'>>
// apps/web/lib/timer-threshold.ts
WARN_AFTER_MS = 300_000; LATE_AFTER_MS = 600_000; type Threshold = 'ok' | 'warn' | 'late'
thresholdFor(elapsedMs): Threshold;  formatTimer(elapsedMs): string   // "0:05", "12:07", "1:02:03"
timerStartOf(order: OrderDto): string   // cooking → cookingAt, ready → readyAt, else placedAt, each falling back to createdAt
// apps/web/lib/chime.ts
createChime(): { play(): void }        // two sine notes, no asset; safe to call when AudioContext is missing
```

- [ ] **Step 1: Dependency and env**

Run: `corepack pnpm --filter @tabletap/web add --save-exact socket.io-client@4.8.3`

`.env.example`, web section, after `API_URL`:
```
# Browser-facing API origin for the Socket.io connection (build-time, like every NEXT_PUBLIC_*).
# Compose passes http://localhost:4000 as a build arg; production points at the public API host.
NEXT_PUBLIC_API_ORIGIN=http://localhost:4000
```

- [ ] **Step 2: Failing tests**

`apps/web/lib/board-store.test.ts`:
```ts
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import { BUMP_LABEL, NEXT_STATUS, applyEvent, applySnapshot, columnsOf, ordersOf } from './board-store';

const at = (iso: string, patch: Partial<OrderDto> = {}): OrderDto => ({
  id: patch.id ?? 'o1', number: 1, status: 'placed', tableId: 't', tableNumber: 7, items: [], subtotalCents: 0, totalCents: 0, note: null,
  placedAt: iso, cookingAt: null, readyAt: null, servedAt: null, cancelledAt: null, createdAt: iso, updatedAt: iso, ...patch,
});

describe('board store', () => {
  it('a snapshot replaces everything and keeps only active tickets', () => {
    const state = applySnapshot([at('2026-09-03T10:00:00Z'), at('2026-09-03T10:01:00Z', { id: 'o2', status: 'served' })]);
    expect(ordersOf(state).map((o) => o.id)).toEqual(['o1']);
  });
  it('an event with an older updatedAt is ignored; a newer one wins; a served ticket leaves', () => {
    let state = applySnapshot([at('2026-09-03T10:00:00Z', { updatedAt: '2026-09-03T10:05:00Z' })]);
    state = applyEvent(state, at('2026-09-03T10:00:00Z', { status: 'cooking', updatedAt: '2026-09-03T10:04:00Z' }));
    expect(ordersOf(state)[0]!.status).toBe('placed');
    state = applyEvent(state, at('2026-09-03T10:00:00Z', { status: 'cooking', updatedAt: '2026-09-03T10:06:00Z' }));
    expect(ordersOf(state)[0]!.status).toBe('cooking');
    state = applyEvent(state, at('2026-09-03T10:00:00Z', { status: 'served', updatedAt: '2026-09-03T10:07:00Z' }));
    expect(ordersOf(state)).toEqual([]);
  });
  it('columns are oldest first and follow the status', () => {
    const cols = columnsOf([
      at('2026-09-03T10:02:00Z', { id: 'b', number: 2 }),
      at('2026-09-03T10:01:00Z', { id: 'a', number: 1, status: 'paid' }),
      at('2026-09-03T10:00:00Z', { id: 'c', number: 3, status: 'cooking' }),
      at('2026-09-03T10:03:00Z', { id: 'd', number: 4, status: 'ready' }),
    ]);
    expect(cols.new.map((o) => o.id)).toEqual(['a', 'b']);
    expect(cols.cooking.map((o) => o.id)).toEqual(['c']);
    expect(cols.ready.map((o) => o.id)).toEqual(['d']);
  });
  it('knows the next step and its verb', () => {
    expect(NEXT_STATUS).toEqual({ placed: 'cooking', paid: 'cooking', cooking: 'ready', ready: 'served' });
    expect(BUMP_LABEL).toEqual({ placed: 'Start', paid: 'Start', cooking: 'Ready', ready: 'Served' });
  });
});
```
`apps/web/lib/timer-threshold.test.ts`:
```ts
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import { formatTimer, thresholdFor, timerStartOf } from './timer-threshold';

describe('timer helpers', () => {
  it('thresholds at 5 and 10 minutes', () => {
    expect(thresholdFor(0)).toBe('ok');
    expect(thresholdFor(299_999)).toBe('ok');
    expect(thresholdFor(300_000)).toBe('warn');
    expect(thresholdFor(600_000)).toBe('late');
  });
  it('formats m:ss and clamps negatives', () => {
    expect(formatTimer(5_000)).toBe('0:05');
    expect(formatTimer(727_000)).toBe('12:07');
    expect(formatTimer(3_723_000)).toBe('1:02:03');
    expect(formatTimer(-4_000)).toBe('0:00');
  });
  it('starts the clock at the timestamp of the current status', () => {
    const base = { placedAt: '2026-09-03T10:00:00Z', cookingAt: '2026-09-03T10:04:00Z', readyAt: '2026-09-03T10:09:00Z', createdAt: '2026-09-03T09:59:00Z' } as OrderDto;
    expect(timerStartOf({ ...base, status: 'placed' })).toBe(base.placedAt);
    expect(timerStartOf({ ...base, status: 'cooking' })).toBe(base.cookingAt);
    expect(timerStartOf({ ...base, status: 'ready' })).toBe(base.readyAt);
    expect(timerStartOf({ ...base, status: 'cooking', cookingAt: null })).toBe(base.placedAt);
    expect(timerStartOf({ ...base, status: 'placed', placedAt: null })).toBe(base.createdAt);
  });
});
```
Append to `packages/ui/src/tokens.test.ts` (it already reads `theme.css`; reuse that string):
```ts
it('scales Tailwind text sizes on the kitchen surface (body 20px, nothing under 16px)', () => {
  const block = theme.slice(theme.indexOf("[data-surface='kitchen']"));
  expect(block).toMatch(/--text-xs:\s*1rem/);
  expect(block).toMatch(/--text-base:\s*1\.25rem/);
  expect(block).toMatch(/--text-xl:\s*1\.75rem/);
  expect(block).toMatch(/--text-2xl:\s*2rem/);
});
```
(`theme` is whatever variable the file already uses for `theme.css` content; read it with `fs.readFileSync` if there is none.)

- [ ] **Step 3: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/web test && corepack pnpm --filter @tabletap/ui test`
Expected: FAIL (modules missing; the kitchen block lacks `--text-*`).

- [ ] **Step 4: Implement**

`apps/web/lib/board-store.ts`:
```ts
import { isActiveStatus, type OrderDto, type OrderStatus } from '@tabletap/shared';

/** The board's model: active tickets by id. Pure functions so the socket effect stays thin. */
export interface BoardState { byId: Readonly<Record<string, OrderDto>> }

export function applySnapshot(orders: OrderDto[]): BoardState {
  return { byId: Object.fromEntries(orders.filter((o) => isActiveStatus(o.status)).map((o) => [o.id, o])) };
}

/** Events can arrive out of order across a reconnect: only a newer updatedAt may replace a ticket. */
export function applyEvent(state: BoardState, order: OrderDto): BoardState {
  const known = state.byId[order.id];
  if (known && Date.parse(known.updatedAt) > Date.parse(order.updatedAt)) return state;
  if (!isActiveStatus(order.status)) {
    if (!known) return state;
    const byId = { ...state.byId };
    delete byId[order.id];
    return { byId };
  }
  return { byId: { ...state.byId, [order.id]: order } };
}

export const ordersOf = (state: BoardState): OrderDto[] => Object.values(state.byId);

export type Column = 'new' | 'cooking' | 'ready';
export const COLUMNS: readonly { key: Column; title: string; statuses: readonly OrderStatus[] }[] = [
  { key: 'new', title: 'New', statuses: ['placed', 'paid'] },
  { key: 'cooking', title: 'Cooking', statuses: ['cooking'] },
  { key: 'ready', title: 'Ready', statuses: ['ready'] },
];

const startOf = (o: OrderDto) => Date.parse(o.placedAt ?? o.createdAt);

/** Oldest first: the cook works from the top of each column. */
export function columnsOf(orders: OrderDto[]): Record<Column, OrderDto[]> {
  const sorted = [...orders].sort((a, b) => startOf(a) - startOf(b) || a.number - b.number);
  const pickBy = (statuses: readonly OrderStatus[]) => sorted.filter((o) => statuses.includes(o.status));
  return { new: pickBy(COLUMNS[0]!.statuses), cooking: pickBy(COLUMNS[1]!.statuses), ready: pickBy(COLUMNS[2]!.statuses) };
}

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = { placed: 'cooking', paid: 'cooking', cooking: 'ready', ready: 'served' };
export const BUMP_LABEL: Partial<Record<OrderStatus, 'Start' | 'Ready' | 'Served'>> = { placed: 'Start', paid: 'Start', cooking: 'Ready', ready: 'Served' };
```

`apps/web/lib/timer-threshold.ts`:
```ts
import type { OrderDto } from '@tabletap/shared';

export const WARN_AFTER_MS = 5 * 60_000;
export const LATE_AFTER_MS = 10 * 60_000;
export type Threshold = 'ok' | 'warn' | 'late';

export const thresholdFor = (elapsedMs: number): Threshold =>
  elapsedMs >= LATE_AFTER_MS ? 'late' : elapsedMs >= WARN_AFTER_MS ? 'warn' : 'ok';

/** m:ss, or h:mm:ss past an hour. A clock slightly behind the server never shows a negative age. */
export function formatTimer(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, elapsedMs) / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** The timer restarts at each step: waiting, then cooking, then ready. */
export function timerStartOf(order: OrderDto): string {
  const fallback = order.placedAt ?? order.createdAt;
  if (order.status === 'cooking') return order.cookingAt ?? fallback;
  if (order.status === 'ready') return order.readyAt ?? fallback;
  return fallback;
}
```

`apps/web/lib/socket.ts`:
```ts
import { SocketTokenResponseSchema, type ClientToServerEvents, type ServerToClientEvents } from '@tabletap/shared';
import { io, type Socket } from 'socket.io-client';
import { clientFetch } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
/** The browser-facing API origin: the rewrite cannot carry WebSockets (ADR 0004). Build-time value. */
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

export function createSocket(origin: string = API_ORIGIN): AppSocket {
  return io(origin, {
    autoConnect: false,
    // A fresh 60-second token for every attempt, reconnects included; an empty auth object
    // is refused by the server and the client keeps retrying with its backoff.
    auth: (cb) => {
      clientFetch('/api/socket-token', { schema: SocketTokenResponseSchema, init: { method: 'POST' } })
        .then((res) => cb({ token: res.token }))
        .catch(() => cb({}));
    },
  });
}
```

`apps/web/lib/chime.ts`:
```ts
/** Two short sine notes. Built on the user's gesture (the Sound toggle) so autoplay policy allows it. */
export function createChime(): { play(): void } {
  const Ctx = typeof window === 'undefined' ? undefined : window.AudioContext;
  if (!Ctx) return { play() {} };
  const ctx = new Ctx();
  const note = (freq: number, at: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.13);
  };
  return {
    play() {
      void ctx.resume();
      const t = ctx.currentTime;
      note(880, t);
      note(1320, t + 0.13);
    },
  };
}
```

`packages/ui/theme.css` — replace the kitchen block:
```css
/* Kitchen: dark tokens come from tokens.css. Type scale per pages/kitchen.md: nothing under 16px,
   body 20px. Tailwind's text-* utilities read these variables, so the override reaches every utility. */
[data-surface='kitchen'] {
  font-size: var(--kitchen-body-size);
  color-scheme: dark;
  --text-xs: 1rem;
  --text-xs--line-height: 1.25;
  --text-sm: 1.125rem;
  --text-sm--line-height: 1.4;
  --text-base: 1.25rem;
  --text-base--line-height: 1.4;
  --text-lg: 1.375rem;
  --text-lg--line-height: 1.35;
  --text-xl: 1.75rem;
  --text-xl--line-height: 1.1;
  --text-2xl: 2rem;
  --text-2xl--line-height: 1.1;
}
```
Verify the mechanism once by hand: in `apps/web`, `corepack pnpm exec next build` is not needed; instead grep the generated CSS in a Vitest snapshot is overkill — the rule holds because Tailwind 4 emits `font-size: var(--text-base)` for `text-base` (check `node_modules/tailwindcss/theme.css` for the `--text-base--line-height` convention if in doubt).

`design-system/tabletap/pages/kitchen.md`: Layout override → "Three columns: New (placed and paid), Cooking, Ready; the oldest ticket sits at the top of its column, the newest carries the ember left edge." Typography → replace the last paragraph ("The sizes above are the target scale, not a shipped mechanism …") with "Shipped in M3: `[data-surface='kitchen']` in `packages/ui/theme.css` overrides Tailwind's `--text-*` scale (xs 16, sm 18, base 20, lg 22, xl 28, 2xl 32 px)." Page-specific components → column headers "New / Cooking / Ready".

- [ ] **Step 5: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm validate-tokens`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/web packages/ui design-system .env.example pnpm-lock.yaml
git commit -m "feat(web): socket client, board store, timer helpers, chime and the kitchen type scale"
```

---

### Task 7: The kitchen board

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; anthropic-skills:frontend-design (the M3 aesthetic risk, spec §3: the timer is the ticket's headline, the top rule follows its threshold, the new-order cue is the left edge only); anthropic-skills:ui-styling (shadcn `Button`, `StatusBadge`, Tailwind on the dark surface); anthropic-skills:ui-ux-pro-max (audit the finished board against `design-system/tabletap/pages/kitchen.md` and `docs/design/ux-notes.md` before the commit: contrast on the dark surface, 44 px targets, live regions, no colour-only meaning).

**Files:**
- Create: `apps/web/app/kitchen/layout.tsx`, `apps/web/app/kitchen/page.tsx`, `apps/web/components/kitchen/use-now.ts`, `apps/web/components/kitchen/kitchen-board.tsx`, `apps/web/components/kitchen/kitchen-board.test.tsx`, `apps/web/components/kitchen/ticket-card.tsx`, `apps/web/components/kitchen/ticket-card.test.tsx`, `apps/web/components/kitchen/timer-badge.tsx`, `apps/web/components/kitchen/sound-toggle.tsx`, `apps/web/components/kitchen/sound-toggle.test.tsx`, `apps/web/components/kitchen/connection-banner.tsx`, `apps/web/components/kitchen/rush-button.tsx`, `apps/web/components/kitchen/rush-button.test.tsx`, `apps/web/components/kitchen/sign-out-button.tsx`

**Interfaces (produced):**
```tsx
<KitchenBoard initialOrders staffName demoMode socketFactory?={createSocket} fetcher?={clientFetch} />   // client
<TicketCard order now fresh pending onBump(order, to) onCancel(order) />
<TimerBadge elapsedMs />        // role="timer", data-threshold, text "m:ss", suffix " · 5 min" (warn) / " · late" (late), icon for warn/late
<SoundToggle enabled onChange />  // aria-pressed, "Sound on" / "Sound off", localStorage key 'tt-kitchen-sound'
<ConnectionBanner state: 'connecting' | 'online' | 'offline' />
<RushButton fetcher? />          // POST /api/demo/rush; used here and on the landing (Task 8)
<SignOutButton />                // authClient.signOut then window.location.assign('/login')
useNow(intervalMs): number       // one interval for the whole board
```
Copy (spec §10): header "Kitchen"; column headers "New · 3"; bump "Start #42" / "Ready #42" / "Served #42"; cancel "Cancel #42" → confirm row "Cancel #42?" with "Yes, cancel" and "Keep"; banner "Connecting to the kitchen feed…" / "Reconnecting… the board will catch up."; notice "Couldn't move #42. It is Cooking now."; empty column "Nothing here."; rush "Simulate rush" → "12 orders over the next minute." / "A rush is already running." / "Couldn't start a rush."

- [ ] **Step 1: Failing tests**

`apps/web/components/kitchen/ticket-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it, vi } from 'vitest';
import { TicketCard } from './ticket-card';

const T0 = Date.parse('2026-09-03T10:00:00Z');
const order = (patch: Partial<OrderDto> = {}): OrderDto => ({
  id: 'o1', number: 42, status: 'placed', tableId: 't', tableNumber: 7,
  items: [{ id: 'i1', menuItemId: 'm1', name: 'Margherita Flatbread', unitPriceCents: 1200, quantity: 2, lineTotalCents: 2400 }],
  subtotalCents: 2400, totalCents: 2400, note: 'No basil', placedAt: '2026-09-03T10:00:00Z', cookingAt: null, readyAt: null,
  servedAt: null, cancelledAt: null, createdAt: '2026-09-03T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z', ...patch,
});

describe('TicketCard', () => {
  it('says table, number, lines, note and the next verb', () => {
    render(<TicketCard order={order()} now={T0 + 65_000} fresh onBump={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Table 7 · #42' })).toBeInTheDocument();
    expect(screen.getByText('2 × Margherita Flatbread')).toBeInTheDocument();
    expect(screen.getByText('Note: No basil')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    expect(screen.getByRole('button', { name: 'Start #42' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-fresh', 'true');
  });
  it('marks a late ticket in words, not only colour, and restarts the clock at cookingAt', () => {
    render(<TicketCard order={order({ status: 'cooking', cookingAt: '2026-09-03T10:04:00Z' })} now={T0 + 15 * 60_000} fresh={false} onBump={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('timer')).toHaveTextContent('11:00 · late');
    expect(screen.getByRole('timer')).toHaveAttribute('data-threshold', 'late');
    expect(screen.getByRole('button', { name: 'Ready #42' })).toBeInTheDocument();
  });
  it('bumps to the next status and cancels behind a confirm', async () => {
    const user = userEvent.setup();
    const onBump = vi.fn();
    const onCancel = vi.fn();
    render(<TicketCard order={order()} now={T0} fresh={false} onBump={onBump} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Start #42' }));
    expect(onBump).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'cooking');
    await user.click(screen.getByRole('button', { name: 'Cancel #42' }));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
  });
  it('disables the bump while a move is pending and offers no cancel past New', () => {
    render(<TicketCard order={order({ status: 'ready', readyAt: '2026-09-03T10:09:00Z' })} now={T0} fresh={false} pending onBump={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Served #42' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel #42' })).toBeNull();
  });
});
```
`apps/web/components/kitchen/kitchen-board.test.tsx` — a fake socket drives the board:
```tsx
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it, vi } from 'vitest';
import type { AppSocket } from '../../lib/socket';
import { KitchenBoard } from './kitchen-board';

type Handler = (...args: never[]) => void;
function fakeSocket() {
  const handlers = new Map<string, Handler[]>();
  const managerHandlers = new Map<string, Handler[]>();
  const on = (map: Map<string, Handler[]>) => (event: string, fn: Handler) => { map.set(event, [...(map.get(event) ?? []), fn]); return socket; };
  const socket = {
    on: on(handlers), off: vi.fn(), removeAllListeners: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
    emit: vi.fn((event: string, ack?: (snapshot: { orders: OrderDto[]; serverTime: string }) => void) => { if (event === 'subscribe') socket.lastAck = ack; }),
    io: { on: on(managerHandlers) },
    lastAck: undefined as undefined | ((s: { orders: OrderDto[]; serverTime: string }) => void),
    fire(event: string, ...args: unknown[]) { for (const fn of handlers.get(event) ?? []) (fn as (...a: unknown[]) => void)(...args); },
  };
  return socket;
}
const order = (id: string, patch: Partial<OrderDto> = {}): OrderDto => ({
  id, number: Number(id.replace('o', '')), status: 'placed', tableId: 't', tableNumber: 7, items: [], subtotalCents: 0, totalCents: 0, note: null,
  placedAt: '2026-09-03T10:00:00Z', cookingAt: null, readyAt: null, servedAt: null, cancelledAt: null, createdAt: '2026-09-03T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z', ...patch,
});

describe('KitchenBoard', () => {
  it('renders the first snapshot from the server, subscribes on connect and applies events', () => {
    const socket = fakeSocket();
    render(<KitchenBoard initialOrders={[order('o1')]} staffName="Theo" demoMode={false} socketFactory={() => socket as unknown as AppSocket} fetcher={vi.fn()} />);
    expect(within(screen.getByRole('region', { name: 'New' })).getByRole('heading', { name: 'Table 7 · #1' })).toBeInTheDocument();
    expect(socket.connect).toHaveBeenCalled();
    act(() => socket.fire('connect'));
    expect(socket.emit).toHaveBeenCalledWith('subscribe', expect.any(Function));
    act(() => socket.lastAck?.({ orders: [order('o1', { status: 'cooking', updatedAt: '2026-09-03T10:01:00Z' })], serverTime: '2026-09-03T10:01:00Z' }));
    expect(within(screen.getByRole('region', { name: 'Cooking' })).getByRole('heading', { name: 'Table 7 · #1' })).toBeInTheDocument();
    act(() => socket.fire('order:created', { order: order('o2') }));
    expect(within(screen.getByRole('region', { name: 'New' })).getByRole('article')).toHaveAttribute('data-fresh', 'true');
    expect(document.title).toBe('(1) Kitchen · TableTap');
  });
  it('shows the banner while offline and clears the fresh mark when a ticket is touched', async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    const fetcher = vi.fn().mockResolvedValue({ order: order('o1', { status: 'cooking', updatedAt: '2026-09-03T10:02:00Z' }) });
    render(<KitchenBoard initialOrders={[]} staffName="Theo" demoMode={false} socketFactory={() => socket as unknown as AppSocket} fetcher={fetcher} />);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the kitchen feed…');
    act(() => socket.fire('connect'));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => socket.fire('disconnect'));
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting… the board will catch up.');
    act(() => socket.fire('order:created', { order: order('o1') }));
    await user.click(screen.getByRole('button', { name: 'Start #1' }));
    expect(fetcher).toHaveBeenCalledWith('/api/orders/o1/transition', expect.objectContaining({ init: expect.objectContaining({ method: 'POST', body: JSON.stringify({ to: 'cooking' }) }) }));
    expect(within(screen.getByRole('region', { name: 'Cooking' })).getByRole('article')).not.toHaveAttribute('data-fresh');
  });
  it('rolls back a lost race with the server's word and resubscribes', async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    const { ApiError } = await import('../../lib/api');
    const fetcher = vi.fn().mockRejectedValue(new ApiError(409, 'INVALID_TRANSITION', 'This order is cooking now.', { from: 'placed', to: 'cooking', current: 'cooking' }));
    render(<KitchenBoard initialOrders={[order('o1')]} staffName="Theo" demoMode={false} socketFactory={() => socket as unknown as AppSocket} fetcher={fetcher} />);
    act(() => socket.fire('connect'));
    socket.emit.mockClear();
    await user.click(screen.getByRole('button', { name: 'Start #1' }));
    expect(await screen.findByText("Couldn't move #1. It is Cooking now.")).toBeInTheDocument();
    expect(socket.emit).toHaveBeenCalledWith('subscribe', expect.any(Function));
  });
  it('drops everything and resubscribes on demo:reset', () => {
    const socket = fakeSocket();
    render(<KitchenBoard initialOrders={[order('o1')]} staffName="Theo" demoMode socketFactory={() => socket as unknown as AppSocket} fetcher={vi.fn()} />);
    act(() => socket.fire('connect'));
    socket.emit.mockClear();
    act(() => socket.fire('demo:reset'));
    expect(screen.queryByRole('article')).toBeNull();
    expect(socket.emit).toHaveBeenCalledWith('subscribe', expect.any(Function));
    expect(screen.getByRole('button', { name: 'Simulate rush' })).toBeInTheDocument();
  });
});
```
`apps/web/components/kitchen/sound-toggle.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SoundToggle } from './sound-toggle';

describe('SoundToggle', () => {
  it('is a pressed button that reports its state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SoundToggle enabled={false} onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Sound off' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
```
`apps/web/components/kitchen/rush-button.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { RushButton } from './rush-button';

describe('RushButton', () => {
  it('starts a rush and reports it, then refuses a second click for a minute', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ started: true, durationSeconds: 60, ordersPlanned: 12 });
    render(<RushButton fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: 'Simulate rush' }));
    expect(fetcher).toHaveBeenCalledWith('/api/demo/rush', expect.objectContaining({ init: expect.objectContaining({ method: 'POST' }) }));
    expect(await screen.findByRole('status')).toHaveTextContent('12 orders over the next minute.');
    expect(screen.getByRole('button', { name: 'Simulate rush' })).toBeDisabled();
  });
  it('says when a rush is already running', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockRejectedValue(new ApiError(409, 'CONFLICT', 'busy'));
    render(<RushButton fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: 'Simulate rush' }));
    expect(await screen.findByRole('status')).toHaveTextContent('A rush is already running.');
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/web test`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement the pieces**

`apps/web/components/kitchen/use-now.ts`:
```ts
'use client';
import { useEffect, useState } from 'react';
/** One ticking clock for the whole board; every timer derives from it. */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
```
`apps/web/components/kitchen/timer-badge.tsx`:
```tsx
import { cn } from '@tabletap/ui';
import { formatTimer, thresholdFor, type Threshold } from '../../lib/timer-threshold';

const SUFFIX: Record<Threshold, string> = { ok: '', warn: ' · 5 min', late: ' · late' };
const COLOUR: Record<Threshold, string> = { ok: 'text-timer-ok', warn: 'text-timer-warn', late: 'text-timer-late' };

function Mark({ threshold }: { threshold: Threshold }) {
  if (threshold === 'ok') return null;
  // A triangle for warning, a circle for late: the shape carries the meaning when the colour cannot.
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-5 fill-current">
      {threshold === 'warn' ? <path d="M8 1 15 14H1z" /> : <circle cx="8" cy="8" r="7" />}
    </svg>
  );
}

/** The ticket's headline after the table number (spec §3): big, mono, and never colour alone. */
export function TimerBadge({ elapsedMs }: { elapsedMs: number }) {
  const threshold = thresholdFor(elapsedMs);
  return (
    <span role="timer" aria-live="off" data-threshold={threshold} className={cn('inline-flex items-center gap-2 font-mono text-xl font-medium tabular-nums', COLOUR[threshold])}>
      <Mark threshold={threshold} />
      {`${formatTimer(elapsedMs)}${SUFFIX[threshold]}`}
    </span>
  );
}
```
`apps/web/components/kitchen/ticket-card.tsx`:
```tsx
'use client';
import type { OrderDto, OrderStatus } from '@tabletap/shared';
import { Button, StatusBadge, cn } from '@tabletap/ui';
import { useState } from 'react';
import { BUMP_LABEL, NEXT_STATUS } from '../../lib/board-store';
import { thresholdFor, timerStartOf } from '../../lib/timer-threshold';
import { TimerBadge } from './timer-badge';

const RULE = { ok: 'border-t-timer-ok', warn: 'border-t-timer-warn', late: 'border-t-timer-late' } as const;

export function TicketCard({ order, now, fresh, pending = false, onBump, onCancel }: {
  order: OrderDto; now: number; fresh: boolean; pending?: boolean;
  onBump: (order: OrderDto, to: OrderStatus) => void; onCancel: (order: OrderDto) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const elapsedMs = Math.max(0, now - Date.parse(timerStartOf(order)));
  const next = NEXT_STATUS[order.status];
  const verb = BUMP_LABEL[order.status];
  const cancellable = order.status === 'placed' || order.status === 'paid';
  return (
    <article
      aria-labelledby={`ticket-${order.id}`}
      data-fresh={fresh ? 'true' : undefined}
      className={cn('flex flex-col gap-3 rounded-lg border border-border border-t-4 bg-card p-4 text-card-foreground', RULE[thresholdFor(elapsedMs)], fresh && 'border-l-4 border-l-primary')}
    >
      <header className="flex items-start justify-between gap-3">
        <h3 id={`ticket-${order.id}`} className="font-display text-2xl font-bold leading-none">{`Table ${order.tableNumber} · #${order.number}`}</h3>
        <TimerBadge elapsedMs={elapsedMs} />
      </header>
      <ul className="flex flex-col gap-1 text-lg font-medium">
        {order.items.map((item) => <li key={item.id}>{`${item.quantity} × ${item.name}`}</li>)}
      </ul>
      {order.note ? <p className="text-sm text-muted-foreground">{`Note: ${order.note}`}</p> : null}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <StatusBadge status={order.status} />
        <div className="flex flex-wrap gap-2">
          {cancellable && !confirming ? (
            <Button type="button" variant="outline" className="h-11" onClick={() => setConfirming(true)}>{`Cancel #${order.number}`}</Button>
          ) : null}
          {cancellable && confirming ? (
            <span role="group" aria-label={`Cancel #${order.number}?`} className="flex items-center gap-2">
              <span>{`Cancel #${order.number}?`}</span>
              <Button type="button" variant="destructive" className="h-11" onClick={() => { setConfirming(false); onCancel(order); }}>Yes, cancel</Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => setConfirming(false)}>Keep</Button>
            </span>
          ) : null}
          {next && verb ? (
            <Button type="button" className="h-11" disabled={pending} aria-busy={pending} onClick={() => onBump(order, next)}>{`${verb} #${order.number}`}</Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
```
(`border-t-timer-ok` etc. exist because `theme.css` maps `--color-timer-*`; if `Button` has no `destructive` variant, use `variant="outline"` for "Yes, cancel" — do not add a variant here.)

`sound-toggle.tsx`: a `Button` with `variant="outline"`, `aria-pressed={enabled}`, text `enabled ? 'Sound on' : 'Sound off'`, `onClick={() => onChange(!enabled)}`. Export also `useSoundPreference(): [boolean, (v: boolean) => void]` reading and writing `localStorage['tt-kitchen-sound']` (`'on' | 'off'`) inside try/catch, default off, initial state read in a `useEffect` so the server render matches.

`connection-banner.tsx`: `state === 'online'` → `null`; otherwise `<p role="status" aria-live="polite" className="bg-secondary px-6 py-2 text-secondary-foreground">` with the two strings.

`rush-button.tsx` (client; `fetcher = clientFetch`): on click POST `/api/demo/rush` with `RushResponseSchema`; success → message `${ordersPlanned} orders over the next minute.` and disabled for `durationSeconds` seconds (a `setTimeout`, cleared on unmount); `ApiError` 409 → "A rush is already running." (also disabled 60 s); anything else → "Couldn't start a rush.". Message in `<p role="status" aria-live="polite">`.

`sign-out-button.tsx`: `Button variant="ghost"` "Sign out" → `authClient.signOut().then(() => window.location.assign('/login'))`.

`kitchen-board.tsx`:
```tsx
'use client';
import { OrderResponseSchema, type OrderDto, type OrderStatus } from '@tabletap/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, clientFetch } from '../../lib/api';
import { COLUMNS, applyEvent, applySnapshot, columnsOf, ordersOf, type BoardState } from '../../lib/board-store';
import { createChime } from '../../lib/chime';
import { createSocket, type AppSocket } from '../../lib/socket';
import { ConnectionBanner } from './connection-banner';
import { RushButton } from './rush-button';
import { SignOutButton } from './sign-out-button';
import { SoundToggle, useSoundPreference } from './sound-toggle';
import { TicketCard } from './ticket-card';
import { useNow } from './use-now';

type Action = { type: 'snapshot'; orders: OrderDto[] } | { type: 'event'; order: OrderDto };
const reducer = (state: BoardState, action: Action): BoardState =>
  action.type === 'snapshot' ? applySnapshot(action.orders) : applyEvent(state, action.order);
const STATUS_WORD: Record<OrderStatus, string> = { draft: 'Draft', placed: 'Placed', paid: 'Paid', cooking: 'Cooking', ready: 'Ready', served: 'Served', cancelled: 'Cancelled' };
const isStatus = (v: unknown): v is OrderStatus => typeof v === 'string' && v in STATUS_WORD;
type Fetcher = typeof clientFetch;

export function KitchenBoard({ initialOrders, staffName, demoMode, socketFactory = createSocket, fetcher = clientFetch }: {
  initialOrders: OrderDto[]; staffName: string; demoMode: boolean; socketFactory?: () => AppSocket; fetcher?: Fetcher;
}) {
  const [state, dispatch] = useReducer(reducer, initialOrders, applySnapshot);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [optimistic, setOptimistic] = useState<Readonly<Record<string, OrderStatus>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [sound, setSound] = useSoundPreference();
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const chime = useRef<ReturnType<typeof createChime> | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  const now = useNow(1_000);

  const resync = useCallback(() => {
    socketRef.current?.emit('subscribe', (snapshot) => dispatch({ type: 'snapshot', orders: snapshot.orders }));
  }, []);

  useEffect(() => {
    const socket = socketFactory();
    socketRef.current = socket;
    socket.on('connect', () => { setConnection('online'); resync(); });
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('order:created', ({ order }) => {
      dispatch({ type: 'event', order });
      setFresh((prev) => new Set(prev).add(order.id));
      if (soundRef.current) chime.current?.play();
    });
    socket.on('order:updated', ({ order }) => dispatch({ type: 'event', order }));
    socket.on('demo:reset', () => { dispatch({ type: 'snapshot', orders: [] }); setFresh(new Set()); resync(); });
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); socketRef.current = null; };
  }, [socketFactory, resync]);

  useEffect(() => {
    document.title = fresh.size > 0 ? `(${fresh.size}) Kitchen · TableTap` : 'Kitchen · TableTap';
  }, [fresh]);

  const touch = (id: string) => setFresh((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
  const move = async (order: OrderDto, to: OrderStatus) => {
    touch(order.id);
    setPending((p) => new Set(p).add(order.id));
    setOptimistic((o) => ({ ...o, [order.id]: to }));
    try {
      const { order: updated } = await fetcher(`/api/orders/${order.id}/transition`, {
        schema: OrderResponseSchema,
        init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to }) },
      });
      dispatch({ type: 'event', order: updated });
    } catch (err) {
      const current = err instanceof ApiError && err.code === 'INVALID_TRANSITION' && isStatus((err.details as { current?: unknown } | undefined)?.current)
        ? (err.details as { current: OrderStatus }).current
        : order.status;
      setNotice(`Couldn't move #${order.number}. It is ${STATUS_WORD[current]} now.`);
      resync();
    } finally {
      setPending((p) => { const next = new Set(p); next.delete(order.id); return next; });
      setOptimistic((o) => { const next = { ...o }; delete next[order.id]; return next; });
    }
  };
  const onSound = (enabled: boolean) => {
    if (enabled && !chime.current) chime.current = createChime();
    if (enabled) chime.current?.play();
    setSound(enabled);
  };

  const visible = ordersOf(state).map((o) => (optimistic[o.id] ? { ...o, status: optimistic[o.id]! } : o));
  const columns = columnsOf(visible);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-3">
        <h1 className="font-display text-xl font-semibold">Kitchen</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">{staffName}</span>
          {demoMode ? <RushButton fetcher={fetcher} /> : null}
          <SoundToggle enabled={sound} onChange={onSound} />
          <SignOutButton />
        </div>
      </header>
      <ConnectionBanner state={connection} />
      {notice ? <p role="status" aria-live="polite" className="px-6 py-2 text-timer-warn">{notice}</p> : null}
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <section key={col.key} aria-label={col.title} className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{`${col.title} · ${columns[col.key].length}`}</h2>
            {columns[col.key].length === 0 ? <p className="text-muted-foreground">Nothing here.</p> : null}
            <ul className="flex flex-col gap-4">
              {columns[col.key].map((order) => (
                <li key={order.id}>
                  <TicketCard order={order} now={now} fresh={fresh.has(order.id)} pending={pending.has(order.id)} onBump={(o, to) => void move(o, to)} onCancel={(o) => void move(o, 'cancelled')} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
```
(`section aria-label` gives the `region` role the tests query. A `RushButton` `fetcher` prop keeps the board test free of network.)

`apps/web/app/kitchen/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
export const metadata = { title: 'Kitchen · TableTap' };
/** The attribute switches the token set (dark) and the type scale; the wrapper paints the ground. */
export default function KitchenLayout({ children }: { children: ReactNode }) {
  return <div data-surface="kitchen" className="min-h-dvh bg-background text-foreground">{children}</div>;
}
```
`apps/web/app/kitchen/page.tsx`:
```tsx
import { MeResponseSchema, OrdersResponseSchema } from '@tabletap/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { KitchenBoard } from '../../components/kitchen/kitchen-board';
import { ApiError, apiFetch } from '../../lib/api';
import { fetchDemoLinks } from '../../lib/demo-links';

export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  // The staff session cookie is better-auth's, not tt_guest: forward the whole jar verbatim.
  const jar = (await cookies()).toString();
  const withJar = { init: { headers: { cookie: jar } } };
  let principal;
  try {
    ({ principal } = await apiFetch('/api/me', { schema: MeResponseSchema, ...withJar }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login?next=/kitchen');
    throw err;
  }
  if (principal.kind !== 'staff') redirect('/');
  const [{ orders }, links] = await Promise.all([
    apiFetch('/api/orders?active=1', { schema: OrdersResponseSchema, ...withJar }),
    fetchDemoLinks(),
  ]);
  return <KitchenBoard initialOrders={orders} staffName={principal.name} demoMode={links !== null} />;
}
```
`apiFetch` sets a `cookie` header only from `opts.cookie`; with `init.headers.cookie` present and `opts.cookie` absent the jar goes through unchanged (check the `Headers` merge in `apps/web/lib/api.ts`; adjust nothing unless the jar is dropped, in which case add a `cookieHeader?: string` option that sets it verbatim).

- [ ] **Step 4: Run tests, then the audit**

Run: `corepack pnpm --filter @tabletap/web test`
Expected: green. Then start the stack (`docker compose up -d --build --wait` from the worktree root with the Docker CLI on PATH) and open `http://localhost:3000/login?demo=kitchen`; sign in lands on `/login` still (Task 8 adds the redirect) — open `http://localhost:3000/kitchen` by hand, press Simulate rush and check: tickets arrive at the top of New with the ember edge, timers tick, Start moves a ticket to Cooking at once, the tab title counts, the banner shows when the API container is stopped (`docker compose stop api`) and clears after `docker compose start api`. Run the `ui-ux-pro-max` audit checklist on the board (contrast pairs from `pages/kitchen.md`, targets, focus rings, live regions). Fix what it finds, then `docker compose down`.

- [ ] **Step 5: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm validate-tokens`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): kitchen board with live tickets, timers, bump controls and the new-order signal"
```

---

### Task 8: Staff sign-in lands on the board, the landing gets Simulate rush, the guest follows live

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**
- Modify: `apps/web/app/login/page.tsx`, `apps/web/components/login-form.tsx`, `apps/web/components/login-form.test.tsx`, `apps/web/components/landing/landing-content.tsx`, `apps/web/components/landing/landing-content.test.tsx`, `apps/web/components/order/order-screen.tsx`, `apps/web/components/order/order-screen.test.tsx`, `apps/web/app/orders/[id]/page.tsx`, `e2e/staff-login.spec.ts`
- Create: `apps/web/lib/safe-next.ts`, `apps/web/lib/safe-next.test.ts`, `apps/web/components/order/order-live.tsx`, `apps/web/components/order/order-live.test.tsx`

**Interfaces (produced):**
```ts
safeNext(value: string | undefined, fallback = '/kitchen'): string     // same-origin absolute path only
<LoginForm demo? next navigate?={(href) => window.location.replace(href)} />   // redirects once the session resolves
headlineFor(order: OrderDto): string    // order-screen.tsx: "Order #42 sent to the kitchen." | "is being made." | "is ready." | "was served. Enjoy." | "was cancelled."
<OrderLive initial currency socketFactory? />   // wraps OrderScreen; live status; "This order was cleared by the hourly demo reset."
```

- [ ] **Step 1: Failing tests**

`apps/web/lib/safe-next.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';
describe('safeNext', () => {
  it('keeps a same-origin path and falls back on anything else', () => {
    expect(safeNext('/kitchen')).toBe('/kitchen');
    expect(safeNext('/orders/abc?x=1')).toBe('/orders/abc?x=1');
    expect(safeNext(undefined)).toBe('/kitchen');
    expect(safeNext('//evil.example')).toBe('/kitchen');
    expect(safeNext('https://evil.example/x')).toBe('/kitchen');
    expect(safeNext('kitchen')).toBe('/kitchen');
  });
});
```
`apps/web/components/login-form.test.tsx` — replace the assertions on the "Signed in as" card with:
```tsx
it('navigates to `next` once the session resolves', async () => {
  const navigate = vi.fn();
  const client = fakeClient({ session: { data: { user: { name: 'Theo Baptiste', role: 'kitchen' } }, isPending: false } });
  render(<LoginForm client={client} next="/kitchen" navigate={navigate} />);
  expect(screen.getByRole('status')).toHaveTextContent('Signed in as Theo Baptiste. Opening the kitchen…');
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/kitchen'));
});
```
(`fakeClient` is whatever helper the file already uses to build an `AuthClientLike`; keep its shape.)

`apps/web/components/landing/landing-content.test.tsx` — add:
```tsx
it('offers Simulate rush and the live board copy in demo mode', () => {
  render(<LandingContent links={links} qrSvg="<svg />" />);
  expect(screen.getByRole('button', { name: 'Simulate rush' })).toBeInTheDocument();
  expect(screen.getByText(/Opens the live board signed in as kitchen staff/)).toBeInTheDocument();
});
it('hides Simulate rush without demo mode', () => {
  render(<LandingContent links={null} qrSvg={null} />);
  expect(screen.queryByRole('button', { name: 'Simulate rush' })).toBeNull();
});
```
`apps/web/components/order/order-screen.test.tsx` — add:
```tsx
it.each([
  ['placed', 'Order #42 sent to the kitchen.'],
  ['cooking', 'Order #42 is being made.'],
  ['ready', 'Order #42 is ready.'],
  ['served', 'Order #42 was served. Enjoy.'],
  ['cancelled', 'Order #42 was cancelled.'],
] as const)('headline for %s', (status, text) => {
  render(<OrderScreen order={{ ...order, status }} currency="USD" />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
});
```
`apps/web/components/order/order-live.test.tsx` (reuse the `fakeSocket` factory from `kitchen-board.test.tsx` by moving it to `apps/web/test/fake-socket.ts` and importing it in both):
```tsx
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AppSocket } from '../../lib/socket';
import { fakeSocket } from '../../test/fake-socket';
import { OrderLive } from './order-live';

const order = { /* the same OrderDto fixture as order-screen.test.tsx, status 'placed', number 42, id 'o1' */ };

describe('OrderLive', () => {
  it('follows its own order and announces ready assertively', () => {
    const socket = fakeSocket();
    render(<OrderLive initial={order} currency="USD" socketFactory={() => socket as unknown as AppSocket} />);
    act(() => socket.fire('connect'));
    act(() => socket.fire('order:updated', { order: { ...order, status: 'cooking', updatedAt: '2026-09-03T10:05:00Z' } }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order #42 is being made.');
    act(() => socket.fire('order:updated', { order: { ...order, id: 'other', status: 'ready', updatedAt: '2026-09-03T10:06:00Z' } }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('is being made.');
    act(() => socket.fire('order:updated', { order: { ...order, status: 'ready', readyAt: '2026-09-03T10:07:00Z', updatedAt: '2026-09-03T10:07:00Z' } }));
    expect(screen.getByRole('alert')).toHaveTextContent('Order #42 is ready.');
  });
  it('says so when a resync no longer contains the order', () => {
    const socket = fakeSocket();
    render(<OrderLive initial={order} currency="USD" socketFactory={() => socket as unknown as AppSocket} />);
    act(() => socket.fire('connect'));
    act(() => socket.lastAck?.({ orders: [], serverTime: '2026-09-03T11:00:00Z' }));
    expect(screen.getByRole('status')).toHaveTextContent('This order was cleared by the hourly demo reset.');
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `corepack pnpm --filter @tabletap/web test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/lib/safe-next.ts`:
```ts
/** Only a path on this origin may be a redirect target: `//host` and absolute URLs fall back. */
export function safeNext(value: string | undefined, fallback = '/kitchen'): string {
  return value !== undefined && /^\/(?!\/)/.test(value) ? value : fallback;
}
```
`apps/web/app/login/page.tsx`: `searchParams: Promise<{ demo?: string; next?: string }>`; `const next = safeNext(params.next);` passed as `<LoginForm demo={…} next={next} />`.

`apps/web/components/login-form.tsx`: props gain `next: string` and `navigate?: (href: string) => void` (default `(href) => window.location.replace(href)`). Replace the signed-in `Card` with:
```tsx
  if (session.data) {
    return <p role="status" aria-live="polite">{`Signed in as ${session.data.user.name}. Opening the kitchen…`}</p>;
  }
```
plus `useEffect(() => { if (session.data) navigate(next); }, [session.data, navigate, next]);` above the early returns. Remove the sign-out button from the form (the board has one). Update `CardDescription` to "Use the demo accounts from the README. The kitchen board opens after sign-in."

`apps/web/components/landing/landing-content.tsx`: Kitchen card copy → `product: 'Tickets appear the moment a guest orders, on a live board.'`, `demo: 'Tickets appear the moment a guest orders. Opens the live board signed in as kitchen staff.'`; Admin card `demo: 'Menu, tables, QR codes and a dashboard. Arrives later; today it opens the kitchen board as an admin.'`. Below the cards grid, when `links`:
```tsx
<div className="flex flex-wrap items-center gap-3">
  <RushButton />
  <p className="text-sm text-muted-foreground">Twelve orders over one minute, so the board has something to do.</p>
</div>
```
(`RushButton` from `../kitchen/rush-button`; it is a client component and the landing is a server component — that is fine.)

`apps/web/components/order/order-screen.tsx`: export `headlineFor(order)` with the five strings above (`placed` and `paid` share "sent to the kitchen."; `draft` falls back to the same) and use it for the `h1`.

`apps/web/components/order/order-live.tsx`:
```tsx
'use client';
import type { OrderDto } from '@tabletap/shared';
import { useEffect, useState } from 'react';
import { createSocket, type AppSocket } from '../../lib/socket';
import { OrderScreen, headlineFor } from './order-screen';

/** The receipt keeps itself current: one socket, one room (the table's), one order to watch. */
export function OrderLive({ initial, currency, socketFactory = createSocket }: { initial: OrderDto; currency: string; socketFactory?: () => AppSocket }) {
  const [order, setOrder] = useState(initial);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const socket = socketFactory();
    const take = (next: OrderDto) => {
      if (next.id !== initial.id) return;
      setOrder((prev) => (Date.parse(next.updatedAt) >= Date.parse(prev.updatedAt) ? next : prev));
    };
    socket.on('connect', () => socket.emit('subscribe', (snapshot) => {
      const mine = snapshot.orders.find((o) => o.id === initial.id);
      if (mine) take(mine); else setCleared(true);
    }));
    socket.on('order:updated', ({ order: next }) => take(next));
    socket.on('demo:reset', () => setCleared(true));
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [initial.id, socketFactory]);
  return (
    <>
      {order.status === 'ready' ? <p role="alert" className="sr-only">{headlineFor(order)}</p> : null}
      {cleared ? <p role="status" aria-live="polite" className="mx-auto w-full max-w-2xl px-4 pt-6 text-muted-foreground">This order was cleared by the hourly demo reset.</p> : null}
      <OrderScreen order={order} currency={currency} />
    </>
  );
}
```
`apps/web/app/orders/[id]/page.tsx`: render `<OrderLive initial={order} currency="USD" />`.

`e2e/staff-login.spec.ts` first test becomes:
```ts
test('kitchen staff signs in through the same-origin API proxy and lands on the board', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@littlefurnace.demo');
  await page.getByLabel('Password').fill('tabletap-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/kitchen');
  await expect(page.getByRole('heading', { name: 'Kitchen' })).toBeVisible();
  await expect(page.getByText('Theo Baptiste')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
```

- [ ] **Step 4: Full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm validate-tokens`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web e2e
git commit -m "feat(web): staff sign-in opens the board, Simulate rush on the landing, live order status for guests"
```

---

### Task 9: Compose build args, the two-context e2e, and the kitchen page in the Lighthouse audit

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development (the e2e spec is written first and must fail against the M2 stack for the right reason — no `/kitchen`); superpowers:systematic-debugging for anything that fails in Compose.

**Files:**
- Modify: `Dockerfile.web`, `docker-compose.yml`, `scripts/lighthouse-audit.mjs`, `.github/workflows/ci.yml` (only the Lighthouse comment if any)
- Create: `e2e/kitchen-live.spec.ts`

- [ ] **Step 1: Build-time origin for the socket**

`Dockerfile.web`, build stage: `ARG NEXT_PUBLIC_API_ORIGIN=http://localhost:4000` next to `ARG API_URL`, and `ENV API_URL=$API_URL NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN NEXT_TELEMETRY_DISABLED=1`. `docker-compose.yml` web `build.args`: `NEXT_PUBLIC_API_ORIGIN: ${NEXT_PUBLIC_API_ORIGIN:-http://localhost:4000}`. (`SOCKET_TOKEN_SECRET` reaches the api container through `env_file: .env`; `.env.example` already carries it from Task 2. CI copies `.env.example` to `.env`.)

- [ ] **Step 2: The e2e spec — `e2e/kitchen-live.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';

const LATENCY_BUDGET_MS = 500;

async function guestOrders(page: Page): Promise<{ number: number; placedAt: string }> {
  await page.goto('/');
  await page.getByRole('link', { name: 'Table 7 as a guest' }).click();
  await page.waitForURL('**/menu');
  await expect(async () => {
    await page.getByRole('button', { name: 'Add House Lemonade' }).click();
    await expect(page.getByRole('button', { name: 'Add one more House Lemonade' })).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByRole('button', { name: 'View basket' }).click();
  await page.getByRole('link', { name: 'Go to checkout' }).click();
  await page.waitForURL('**/checkout');
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop()!;
  // The API is the clock: placedAt is server time, and the kitchen tab is read on the same host.
  const body = await page.evaluate(async (orderId) => (await fetch(`/api/orders/${orderId}`)).json(), id);
  return { number: body.order.number as number, placedAt: body.order.placedAt as string };
}

test('a placed order is on the kitchen board within 500 ms and the guest follows it to ready', async ({ browser }) => {
  const kitchenContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const kitchen = await kitchenContext.newPage();
  const guest = await guestContext.newPage();

  await kitchen.goto('/login?demo=kitchen');
  await kitchen.waitForURL('**/kitchen');
  await expect(kitchen.getByRole('status')).toHaveCount(0, { timeout: 10_000 }); // banner gone: the socket is up

  const { number, placedAt } = await guestOrders(guest);
  const ticket = kitchen.getByRole('heading', { name: `Table 7 · #${number}` });
  await expect(ticket).toBeVisible({ timeout: 5_000 });
  const visibleAt = Date.now();
  expect(visibleAt - Date.parse(placedAt)).toBeLessThan(LATENCY_BUDGET_MS);

  await kitchen.getByRole('button', { name: `Start #${number}` }).click();
  await expect(kitchen.getByRole('region', { name: 'Cooking' }).getByRole('heading', { name: `Table 7 · #${number}` })).toBeVisible();
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(`Order #${number} is being made.`);
  await kitchen.getByRole('button', { name: `Ready #${number}` }).click();
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(`Order #${number} is ready.`);

  // Reconnect: the banner appears offline and the board matches the API once back online.
  await kitchenContext.setOffline(true);
  await expect(kitchen.getByRole('status')).toHaveText('Reconnecting… the board will catch up.');
  await kitchenContext.setOffline(false);
  await expect(kitchen.getByRole('status')).toHaveCount(0, { timeout: 15_000 });
  const active = await kitchen.evaluate(async () => (await fetch('/api/orders?active=1')).json());
  const boardCount = await kitchen.getByRole('article').count();
  expect(boardCount).toBe(active.orders.length);

  await kitchen.getByRole('button', { name: `Served #${number}` }).click();
  await expect(kitchen.getByRole('heading', { name: `Table 7 · #${number}` })).toHaveCount(0);
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText(`Order #${number} was served. Enjoy.`);

  await guestContext.close();
  await kitchenContext.close();
});
```
The latency assertion compares the API's `placedAt` with the test runner's clock; Compose containers share the host clock, and Playwright's locator polling adds at most about 100 ms. If it flakes in CI at 500 ms, report it as a finding rather than raising the budget: the brief's DoD is 500 ms.

- [ ] **Step 3: Lighthouse — `scripts/lighthouse-audit.mjs`**

After the guest claim, sign in as kitchen and add the page:
```js
const links2 = links; // already fetched above
const kitchenAccount = links2.staff.find((s) => s.role === 'kitchen');
if (!kitchenAccount) throw new Error('demo links carry no kitchen account');
const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: BASE },
  body: JSON.stringify({ email: kitchenAccount.email, password: kitchenAccount.password }),
});
if (!signIn.ok) throw new Error(`kitchen sign-in: ${signIn.status}`);
const staffCookie = signIn.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
```
and `PAGES` gains `{ slug: 'kitchen', path: '/kitchen', headers: { Cookie: staffCookie } }`. The redirect guard already fails the run if `/kitchen` bounces to `/login`. Keep the a11y gate at `MIN_A11Y` for every page; performance is reported, not gated, on the kitchen page.

- [ ] **Step 4: Run the whole thing locally**

```bash
export PATH="/c/Users/chitkid/AppData/Local/Programs/DockerDesktop/resources/bin:$PATH"
docker compose up -d --build --wait
curl -fsS http://localhost:4000/health
corepack pnpm e2e
CHROME_PATH="$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" corepack pnpm lighthouse --base http://localhost:3000 --min-a11y 95
docker compose down -v
```
Expected: all three e2e specs pass (`staff-login` 2, `guest-order` 2, `kitchen-live` 1); Lighthouse prints landing, menu and kitchen rows with accessibility ≥ 95 and exits 0. Anything else: `superpowers:systematic-debugging`, fix at the root, re-run.

- [ ] **Step 5: Full gate and commit**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm validate-tokens`
```bash
git add Dockerfile.web docker-compose.yml scripts/lighthouse-audit.mjs e2e
git commit -m "test(e2e): guest-to-kitchen latency under 500 ms in two contexts; audit the kitchen page"
```

---

### Task 10: ADRs, README, backlog, spec status

**REQUIRED SUB-SKILLS:** none beyond the writing rules in Global Constraints.

**Files:**
- Create: `docs/adr/0008-realtime-delivery.md`, `docs/adr/0009-interim-state-machine.md`
- Modify: `README.md`, `docs/backlog.md`, `docs/superpowers/specs/2026-09-03-m3-kitchen-display-design.md` (status line), `design-system/tabletap/pages/kitchen.md` (only if Task 6 left anything stale)

- [ ] **Step 1: ADR 0008 — `docs/adr/0008-realtime-delivery.md`**

Format: Context → Decision → Consequences, like ADR 0004. Content to cover, in prose: the split (Socket.io pushes, REST mutates; the `OrderEvents` emitter as the seam); the 60-second `tt-socket` JWT minted by `POST /api/socket-token` and signed with `SOCKET_TOKEN_SECRET`, why it is not the cookie (ADR 0004's split origins) and why it is typed and short-lived; server-assigned rooms `kitchen` and `table:<tableId>` from the token's principal; snapshot through the `subscribe` ack on every connect, events applied by `updatedAt`; optimistic bumps that resync on error; the in-memory adapter and the Redis adapter a multi-instance deploy needs (backlog); the withdrawn backlog recommendation about extracting `resolvePrincipal` for the handshake and why (the token is minted where the principal already exists). Consequences: `NEXT_PUBLIC_API_ORIGIN` is a build-time value; the API must be reachable from the browser directly (CORS on `WEB_ORIGIN`); one more secret in every environment; `demo:reset` is the only broadcast to everyone.

- [ ] **Step 2: ADR 0009 — `docs/adr/0009-interim-state-machine.md`**

Context: the brief's machine (`placed → paid → cooking`, `paid` only from the Stripe webhook) and M3 shipping before M4. Decision (owner's, 2026-09-03): `placed → cooking` is allowed while no payment exists; `TRANSITION_RIGHTS` gives kitchen and admin the edge; nobody sets `paid` through the API. Obligation: M4 removes `'cooking'` from `ORDER_TRANSITIONS.placed`, updates the M3 tests that assert it, and moves the board's New column to `paid` only. Consequences: the M3 demo shows the full loop without a card; an M4 reviewer must check the edge is gone.

- [ ] **Step 3: README, backlog, spec**

README: a "Kitchen display" section (what the board shows, the three columns, timers and thresholds, sound toggle, Simulate rush, the socket handshake in two sentences, `SOCKET_TOKEN_SECRET` and `NEXT_PUBLIC_API_ORIGIN` in the environment table, `/kitchen` in the URL list, the two-context e2e in the testing section, the 500 ms DoD).

`docs/backlog.md`: under "Resolved in M3": the kitchen `--text-*` mechanism, the `GET /api/orders/:id` 400/401 order, the `resolvePrincipal` recommendation (withdrawn, see ADR 0008). Under "Deferred from M3": a guest cancel endpoint (`orders.cancel.own` exists, no route), the Redis adapter for multi-instance Socket.io (M6), a waiter surface (M5), served/cancelled history on the board, the rate-limit key on the raw cookie header (fine in memory, revisit with a shared store), pausing the rush while a reset runs rather than cancelling it.

Spec status line: `Status: implemented on branch feat/m3-kitchen-display (<date>); merge pending final review.`

- [ ] **Step 4: Full gate and commit**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .`
```bash
git add docs README.md design-system
git commit -m "docs: ADR 0008 realtime delivery, ADR 0009 interim state machine, README and backlog for M3"
```

---

## After the last task (controller)

1. Final whole-branch review (`superpowers:requesting-code-review`, most capable model), one fix wave, scoped re-review.
2. Full gate on the branch tree: `pnpm lint && pnpm typecheck && pnpm test && pnpm validate-tokens && pnpm exec prettier --check .`, then Compose + `pnpm e2e` + Lighthouse (Task 9 commands) once more on the final tree.
3. `superpowers:finishing-a-development-branch`, pre-selected: merge into `main` (fast-forward), delete branch and worktree; push `main` to `origin` and watch the CI run (`check` and `compose-e2e`) through the public API.
4. Update the spec status to merged and the memory file.
