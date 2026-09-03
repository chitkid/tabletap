# M2 Guest Flow + Demo Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest scans the QR, sees the Little Furnace menu, fills a basket and places an order; a recruiter starts the whole demo from a landing page; Lighthouse accessibility ≥ 95 on the guest surface.

**Architecture:** Menu and order pages are Next.js server components that forward the `tt_guest` cookie to the Fastify API for the first render; the basket lives in `localStorage` keyed by table; mutations (claim, place order, sign-in) go from the browser through the `/api/*` rewrite. `POST /api/orders` creates the order as `placed` in one transaction with prices snapshotted from the database. Every dish is drawn by a deterministic SVG plate generator (the M2 aesthetic risk). Demo mode is an API feature flag: `GET /api/demo/links` feeds the landing and an in-process scheduler resets the seed hourly.

**Tech Stack:** as M1 (pnpm 11, Turborepo 2, TypeScript 5.9, Fastify 5, Zod 4, Drizzle 0.45 + PGlite tests, better-auth 1.7, Next.js 16, React 19, Tailwind 4, shadcn, Vitest 4, Playwright 1.62) plus `qrcode` 1.5, `lighthouse` 13, `chrome-launcher` 1.2, shadcn `sheet` and `textarea` (`@radix-ui/react-dialog`).

**Spec:** `docs/superpowers/specs/2026-09-03-m2-guest-flow-design.md` — read it before any task. M1 spec for the foundation: `docs/superpowers/specs/2026-09-02-m1-foundation-design.md`. Deferred items and M2 recommendations: `docs/backlog.md`.

## Global Constraints

- Language: code, comments, commits, docs in English. Conventional Commits; every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Every commit is a working state; no TODO stubs.
- Work in a git worktree on branch `feat/m2-guest-flow` created from `main` (`superpowers:using-git-worktrees`; worktree root under `.claude/worktrees/`). Paths below are relative to the worktree root. Run `corepack pnpm install --frozen-lockfile` in the new worktree before the first task.
- pnpm through corepack (`corepack pnpm` when `pnpm` is not on PATH); add dependencies with `--save-exact` / `--save-dev`; commit `pnpm-lock.yaml` with the code; never run `pnpm approve-builds` (the `allowBuilds` map in `pnpm-workspace.yaml` already approves native builds).
- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`import type`); no `any`.
- TDD (red → verify → green → refactor → commit) for all business logic, API routes, guards, the plate planner, the basket store, the checkout form, the demo sign-in behaviour, the scheduler and the elapsed-time formatter. Exempt: migrations, config, presentational markup, the Lighthouse script, shadcn-generated components.
- Server never trusts client ids or prices: table and restaurant come from `request.principal`; prices and names come from the database.
- Error envelope `{ error: { code, message, details? } }` on every non-2xx from TableTap handlers; codes now `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_FAILED | TOKEN_INVALID | TOKEN_EXPIRED | RATE_LIMITED | ITEM_UNAVAILABLE | CONFLICT | INTERNAL`. `/api/auth/*` stays proxied unchanged (spec M1 §8).
- Tokens only: no raw hex, `rgb()`, multi-digit `px`/`rem` in `apps/` or `packages/ui/src` (`pnpm validate-tokens`; Tailwind utilities are fine, arbitrary values are not). SVG numbers without units are fine.
- Brand voice for UI copy (`docs/brand-guidelines.md`): plain, no exclamation cheer, no emoji, no apologising, time is honest. Exact strings are given per task.
- Accessibility: every control labelled; 44 px targets (`h-11`, `size-11`) with ≥ 8 px gaps; `aria-live="polite"` for the basket count and order status; focus visible; colour never the only carrier.
- Public URLs added in M2: `/t/<token>`, `/menu`, `/checkout`, `/orders/<id>`, `/session-ended`; `/` becomes the landing (the M1 redirect to `/login` is removed in Task 9).
- Money is integer cents, USD, formatted with `Intl.NumberFormat('en-US', { style: 'currency', currency })`.
- Formatting gate: `pnpm exec prettier --check .` must pass (run `pnpm exec prettier --write <files>` on files you create).
- Docker is not installed on the development host and the repository has no remote: compose, e2e and the Lighthouse gate are verified in CI once a remote exists. Tests run on PGlite.

## Context files for every task

| Path | What it is |
|---|---|
| `docs/superpowers/specs/2026-09-03-m2-guest-flow-design.md` | The approved M2 spec (sections 3–6 carry copy, states and contracts) |
| `docs/brand-guidelines.md` | Voice, palette hex, typography |
| `design-system/tabletap/MASTER.md` | Guest surface rules (`pages/kitchen.md`, `pages/admin.md` are not used in M2) |
| `docs/design/components.md` | Component state specs (button, dish card, order card, status badge, cart counter) |
| `docs/design/ux-notes.md` | Touch targets, states, live regions, Next.js/shadcn notes |
| `packages/ui/tokens.css`, `packages/ui/theme.css` | Generated tokens and the Tailwind theme (class names such as `bg-background`, `text-muted-foreground`, `bg-status-placed`, `font-display`, `rounded-md`) |
| `docs/design/motion-spec.md` | Does not exist until M6 — no motion in M2 |
| `apps/api/src/{server,config,types}.ts`, `src/plugins/{rbac,principal,route-guard,error-handler}.ts`, `src/lib/{resolve-principal,guest-sessions,audit,errors}.ts`, `src/test/helpers.ts` | The M1 API to extend (route guard: every route needs `config.public` or a `require*` guard) |
| `packages/shared/src/{api,principal,errors,menu,orders,roles}.ts` | Contracts to extend |
| `packages/db/src/{schema/*,seed/run.ts,seed/data.ts,testing.ts}` | Schema, seed (`DEMO_STAFF`, `DEMO_MENU`), PGlite helper |
| `apps/web/{next.config.ts,app/layout.tsx,app/login/page.tsx,components/login-form.tsx,lib/auth-client.ts}` | The M1 web shell to extend |

## File structure (M2 additions)

```
packages/shared/src/api.ts            + Menu*, Order*, DemoLinks* schemas, IDEMPOTENCY_KEY_HEADER
packages/shared/src/errors.ts         + ITEM_UNAVAILABLE, CONFLICT
packages/shared/src/principal.ts      + restaurantId on the guest principal
packages/ui/src/lib/plate-plan.ts     deterministic plate planner (+ .test.ts)
packages/ui/src/components/plate.tsx  SVG renderer
packages/ui/src/components/{sheet,textarea,status-badge}.tsx
packages/ui/theme.css                 + --plate-* aliases
packages/db/src/schema/{orders,guest,audit}.ts   + number identity, indexes
packages/db/migrations/0001_*.sql
apps/api/src/config.ts                + DEMO_MODE, DEMO_RESET_INTERVAL_MINUTES, DEMO_PASSWORD, demoMode
apps/api/src/lib/{restaurant,orders,demo-reset}.ts
apps/api/src/routes/{menu,orders,demo}.ts
apps/web/lib/{api,cart,money,elapsed}.ts (+ tests)
apps/web/app/t/[token]/page.tsx, app/session-ended/page.tsx, app/not-found.tsx
apps/web/app/menu/page.tsx, app/checkout/page.tsx, app/orders/[id]/page.tsx, app/page.tsx
apps/web/components/{claim-table,menu/*,basket/*,checkout/*,order/*,landing/*}.tsx
scripts/lighthouse-audit.mjs
e2e/guest-order.spec.ts
docs/adr/0006-guest-reads-and-orders.md, docs/adr/0007-illustrated-menu.md
```

---

### Task 1: Shared contracts, error codes and the plate planner

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; anthropic-skills:frontend-design (the plate compositions are the visual signature: read the spec §3 and keep the shapes restrained — plate, a few ingredient forms, no faces, no gradients).

**Files:**
- Modify: `packages/shared/src/errors.ts`, `packages/shared/src/api.ts`, `packages/shared/src/api.test.ts`
- Create: `packages/ui/src/lib/plate-plan.ts`, `packages/ui/src/lib/plate-plan.test.ts`, `packages/ui/src/components/plate.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/theme.css`

**Interfaces (produced):**
```ts
// @tabletap/shared
ERROR_CODES += 'ITEM_UNAVAILABLE', 'CONFLICT'
MenuItemDtoSchema, MenuCategoryDtoSchema, MenuResponseSchema (+ types MenuItemDto, MenuCategoryDto, MenuResponse)
OrderCreateItemSchema, OrderCreateRequestSchema (+ OrderCreateRequest)
OrderItemDtoSchema, OrderDtoSchema, OrderResponseSchema, OrdersResponseSchema (+ OrderItemDto, OrderDto)
DemoLinksResponseSchema (+ DemoLinksResponse)
IDEMPOTENCY_KEY_HEADER = 'idempotency-key'; IdempotencyKeySchema = z.uuid()
// @tabletap/ui
PLATE_KINDS, type PlateKind, type PlateShape, type PlatePlan, PALETTE_SLOTS
hashSeed(seed: string): number; mulberry32(seed: number): () => number
kindFromCategory(categoryName: string): PlateKind
planPlate(seed: string, kind: PlateKind): PlatePlan
<Plate name kind seed? size? className? />   // inline SVG, role="img", aria-label = name
```

- [ ] **Step 1: Failing contract tests**

Append to `packages/shared/src/api.test.ts`:
```ts
import { DemoLinksResponseSchema, ERROR_CODES, MenuResponseSchema, OrderCreateRequestSchema, OrderDtoSchema } from './index';

const U1 = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60';
const U2 = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f61';

describe('M2 contracts', () => {
  it('adds the two new error codes', () => {
    expect(ERROR_CODES).toContain('ITEM_UNAVAILABLE');
    expect(ERROR_CODES).toContain('CONFLICT');
  });
  it('validates a menu response', () => {
    const ok = MenuResponseSchema.safeParse({
      restaurant: { id: U1, name: 'Little Furnace', currency: 'USD' },
      categories: [{ id: U2, name: 'Flatbreads', sortOrder: 0, items: [{ id: U1, categoryId: U2, name: 'Margherita Flatbread', description: '', priceCents: 1200, allergens: ['gluten', 'dairy'], isAvailable: true, imageUrl: null, sortOrder: 0 }] }],
    });
    expect(ok.success).toBe(true);
  });
  it('bounds an order request', () => {
    expect(OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 2 }] }).success).toBe(true);
    expect(OrderCreateRequestSchema.safeParse({ items: [] }).success).toBe(false);
    expect(OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 0 }] }).success).toBe(false);
    expect(OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 21 }] }).success).toBe(false);
    expect(OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 1 }, { menuItemId: U1, quantity: 1 }] }).success).toBe(false);
    expect(OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 1 }], note: 'x'.repeat(281) }).success).toBe(false);
    expect(OrderCreateRequestSchema.parse({ items: [{ menuItemId: U1, quantity: 1 }], note: '  no onions  ' }).note).toBe('no onions');
  });
  it('validates an order dto and demo links', () => {
    expect(OrderDtoSchema.safeParse({ id: U1, number: 42, status: 'placed', tableId: U2, tableNumber: 7, items: [{ id: U1, menuItemId: U2, name: 'House Lemonade', unitPriceCents: 400, quantity: 1, lineTotalCents: 400 }], subtotalCents: 400, totalCents: 400, note: null, placedAt: '2026-09-03T10:00:00.000Z', createdAt: '2026-09-03T10:00:00.000Z' }).success).toBe(true);
    expect(DemoLinksResponseSchema.safeParse({ guest: { tableNumber: 7, url: 'http://localhost:3000/t/abc' }, staff: [{ role: 'kitchen', email: 'kitchen@littlefurnace.demo', name: 'Theo Baptiste', password: 'tabletap-demo' }], resetsEveryMinutes: 60 }).success).toBe(true);
  });
});
```
Run: `corepack pnpm --filter @tabletap/shared test` → FAIL (exports missing).

- [ ] **Step 2: Implement the contracts**

`packages/shared/src/errors.ts`: `ERROR_CODES` becomes `['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED', 'TOKEN_INVALID', 'TOKEN_EXPIRED', 'RATE_LIMITED', 'ITEM_UNAVAILABLE', 'CONFLICT', 'INTERNAL'] as const`.

Append to `packages/shared/src/api.ts` (imports: `AllergenSchema` from `./menu`, `OrderStatusSchema` from `./orders`, `StaffRoleSchema` from `./roles`):
```ts
export const MenuItemDtoSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string().min(1),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  allergens: z.array(AllergenSchema),
  isAvailable: z.boolean(),
  imageUrl: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type MenuItemDto = z.infer<typeof MenuItemDtoSchema>;
export const MenuCategoryDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  items: z.array(MenuItemDtoSchema),
});
export type MenuCategoryDto = z.infer<typeof MenuCategoryDtoSchema>;
export const MenuResponseSchema = z.object({
  restaurant: z.object({ id: z.uuid(), name: z.string().min(1), currency: z.string().length(3) }),
  categories: z.array(MenuCategoryDtoSchema),
});
export type MenuResponse = z.infer<typeof MenuResponseSchema>;

export const OrderCreateItemSchema = z.object({
  menuItemId: z.uuid(),
  quantity: z.number().int().min(1).max(20),
});
export const OrderCreateRequestSchema = z.object({
  items: z
    .array(OrderCreateItemSchema)
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.menuItemId)).size === items.length, {
      message: 'Each menu item may appear once.',
    }),
  note: z.string().trim().max(280).optional(),
});
export type OrderCreateRequest = z.infer<typeof OrderCreateRequestSchema>;

export const OrderItemDtoSchema = z.object({
  id: z.uuid(),
  menuItemId: z.uuid(),
  name: z.string().min(1),
  unitPriceCents: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  lineTotalCents: z.number().int().nonnegative(),
});
export type OrderItemDto = z.infer<typeof OrderItemDtoSchema>;
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
  createdAt: z.iso.datetime(),
});
export type OrderDto = z.infer<typeof OrderDtoSchema>;
export const OrderResponseSchema = z.object({ order: OrderDtoSchema });
export const OrdersResponseSchema = z.object({ orders: z.array(OrderDtoSchema) });

export const DemoLinksResponseSchema = z.object({
  guest: z.object({ tableNumber: z.number().int().positive(), url: z.url() }),
  staff: z.array(
    z.object({ role: StaffRoleSchema, email: z.email(), name: z.string().min(1), password: z.string().min(1) }),
  ),
  resetsEveryMinutes: z.number().int().nonnegative().nullable(),
});
export type DemoLinksResponse = z.infer<typeof DemoLinksResponseSchema>;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IdempotencyKeySchema = z.uuid();
```
Run the shared tests → PASS. Commit: `feat(shared): menu, order and demo-link contracts`.

- [ ] **Step 3: Failing plate planner tests**

`packages/ui/src/lib/plate-plan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PALETTE_SLOTS, PLATE_KINDS, hashSeed, kindFromCategory, mulberry32, planPlate } from './plate-plan';

const inPlate = (x: number, y: number, r: number, plateR: number) =>
  Math.hypot(x - 64, y - 64) + r <= plateR + 0.001;

describe('plate planner', () => {
  it('is deterministic', () => {
    expect(planPlate('Margherita Flatbread', 'flatbread')).toEqual(planPlate('Margherita Flatbread', 'flatbread'));
    expect(JSON.stringify(planPlate('Margherita Flatbread', 'flatbread'))).not.toEqual(JSON.stringify(planPlate('Mushroom & Taleggio', 'flatbread')));
  });
  it('maps categories to kinds', () => {
    expect(kindFromCategory('Flatbreads')).toBe('flatbread');
    expect(kindFromCategory('Bowls')).toBe('bowl');
    expect(kindFromCategory('Sides')).toBe('side');
    expect(kindFromCategory('Drinks')).toBe('drink');
    expect(kindFromCategory('Specials')).toBe('side');
  });
  it('keeps every shape inside the plate and every slot in range', () => {
    for (const kind of PLATE_KINDS) {
      for (const seed of ['a', 'Ember Salmon Bowl', 'House Lemonade', 'Furnace Potatoes']) {
        const plan = planPlate(seed, kind);
        expect(plan.viewBox).toBe(128);
        expect(plan.plate.r).toBeGreaterThan(40);
        for (const s of plan.shapes) {
          expect(s.slot).toBeGreaterThanOrEqual(0);
          expect(s.slot).toBeLessThan(PALETTE_SLOTS);
          if (s.type === 'circle') expect(inPlate(s.cx, s.cy, s.r, plan.plate.r)).toBe(true);
          if (s.type === 'ellipse') expect(inPlate(s.cx, s.cy, Math.max(s.rx, s.ry), plan.plate.r)).toBe(true);
          if (s.type === 'stroke') {
            expect(inPlate(s.x1, s.y1, s.width / 2, plan.plate.r)).toBe(true);
            expect(inPlate(s.x2, s.y2, s.width / 2, plan.plate.r)).toBe(true);
          }
          if (s.type === 'wedge' || s.type === 'arc') expect(inPlate(s.cx, s.cy, s.r, plan.plate.r)).toBe(true);
        }
      }
    }
  });
  it('gives each kind its own composition', () => {
    expect(planPlate('x', 'flatbread').shapes.filter((s) => s.type === 'circle').length).toBeGreaterThanOrEqual(5);
    expect(planPlate('x', 'bowl').shapes.filter((s) => s.type === 'wedge').length).toBeGreaterThanOrEqual(3);
    expect(planPlate('x', 'drink').shapes.some((s) => s.type === 'stroke')).toBe(true);
    expect(planPlate('x', 'side').shapes.filter((s) => s.type === 'ellipse').length).toBeGreaterThanOrEqual(4);
  });
  it('has a stable hash and prng', () => {
    expect(hashSeed('a')).toBe(hashSeed('a'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    const r1 = mulberry32(1), r2 = mulberry32(1);
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
    for (let i = 0; i < 100; i++) { const v = r1(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
```
Run: `corepack pnpm --filter @tabletap/ui test` → FAIL.

- [ ] **Step 4: Implement the planner**

`packages/ui/src/lib/plate-plan.ts`:
```ts
export const PLATE_KINDS = ['flatbread', 'bowl', 'side', 'drink'] as const;
export type PlateKind = (typeof PLATE_KINDS)[number];

/** Palette slots resolve to CSS custom properties --plate-slot-N in theme.css. */
export const PALETTE_SLOTS = 6;
const OAT = 0, EMBER = 1, EMBER_LIGHT = 2, OLIVE = 3, OLIVE_LIGHT = 4, INK = 5;

export type PlateShape =
  | { type: 'circle'; cx: number; cy: number; r: number; slot: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotate: number; slot: number }
  | { type: 'arc'; cx: number; cy: number; r: number; start: number; end: number; width: number; slot: number }
  | { type: 'wedge'; cx: number; cy: number; r: number; start: number; end: number; slot: number }
  | { type: 'stroke'; x1: number; y1: number; x2: number; y2: number; width: number; slot: number };

export interface PlatePlan {
  kind: PlateKind;
  viewBox: 128;
  plate: { cx: 64; cy: 64; r: number };
  shapes: PlateShape[];
}

/** FNV-1a 32-bit. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function kindFromCategory(categoryName: string): PlateKind {
  const n = categoryName.toLowerCase();
  if (n.includes('flatbread') || n.includes('pizza')) return 'flatbread';
  if (n.includes('bowl')) return 'bowl';
  if (n.includes('drink') || n.includes('beverage')) return 'drink';
  return 'side';
}

const round = (v: number) => Math.round(v * 10) / 10;
/** A point at polar (dist, angle) from the plate centre. */
const polar = (dist: number, angle: number) => ({ x: round(64 + Math.cos(angle) * dist), y: round(64 + Math.sin(angle) * dist) });

export function planPlate(seed: string, kind: PlateKind): PlatePlan {
  const rnd = mulberry32(hashSeed(`${kind}:${seed}`));
  const between = (lo: number, hi: number) => round(lo + rnd() * (hi - lo));
  const int = (lo: number, hi: number) => Math.floor(lo + rnd() * (hi - lo + 1));
  const shapes: PlateShape[] = [];
  const plateR = 54;

  if (kind === 'flatbread') {
    const rx = between(38, 44), ry = between(28, 34), rotate = between(-15, 15);
    shapes.push({ type: 'ellipse', cx: 64, cy: 64, rx, ry, rotate, slot: OAT });
    shapes.push({ type: 'ellipse', cx: 64, cy: 64, rx: round(rx - 6), ry: round(ry - 6), rotate, slot: EMBER_LIGHT });
    const toppings = int(5, 8);
    for (let i = 0; i < toppings; i++) {
      const p = polar(between(4, ry - 12), between(0, Math.PI * 2));
      shapes.push({ type: 'circle', cx: p.x, cy: p.y, r: between(3, 6), slot: i % 2 === 0 ? EMBER : OLIVE });
    }
    shapes.push({ type: 'arc', cx: 64, cy: 64, r: round(rx - 2), start: between(0, 1), end: between(1.5, 2.5), width: 2, slot: INK });
  } else if (kind === 'bowl') {
    shapes.push({ type: 'circle', cx: 64, cy: 64, r: 42, slot: INK });
    shapes.push({ type: 'circle', cx: 64, cy: 64, r: 36, slot: OLIVE_LIGHT });
    const wedges = int(3, 5);
    let angle = between(0, Math.PI * 2);
    for (let i = 0; i < wedges; i++) {
      const span = between(0.8, 1.6);
      shapes.push({ type: 'wedge', cx: 64, cy: 64, r: 34, start: round(angle), end: round(angle + span), slot: [EMBER, OLIVE, EMBER_LIGHT, OAT][i % 4]! });
      angle += span + between(0.1, 0.4);
    }
    const p = polar(between(6, 14), between(0, Math.PI * 2));
    shapes.push({ type: 'circle', cx: p.x, cy: p.y, r: between(5, 8), slot: OAT });
  } else if (kind === 'drink') {
    const rx = between(14, 18), ry = between(34, 40);
    shapes.push({ type: 'ellipse', cx: 64, cy: 66, rx, ry, rotate: 0, slot: EMBER_LIGHT });
    shapes.push({ type: 'ellipse', cx: 64, cy: round(66 - ry + 8), rx: round(rx - 2), ry: 5, rotate: 0, slot: OAT });
    const ice = int(2, 3);
    for (let i = 0; i < ice; i++) {
      shapes.push({ type: 'circle', cx: between(58, 70), cy: between(50, 88), r: between(3, 5), slot: OAT });
    }
    const tilt = between(-6, 6);
    shapes.push({ type: 'stroke', x1: round(64 + tilt), y1: round(66 - ry - 4), x2: round(64 - tilt), y2: round(66 + ry - 12), width: 3, slot: INK });
  } else {
    const pieces = int(4, 7);
    for (let i = 0; i < pieces; i++) {
      const p = polar(between(0, 26), between(0, Math.PI * 2));
      shapes.push({ type: 'ellipse', cx: p.x, cy: p.y, rx: between(8, 14), ry: between(5, 8), rotate: between(0, 180), slot: [EMBER, OLIVE, EMBER_LIGHT, OLIVE_LIGHT][i % 4]! });
    }
  }
  return { kind, viewBox: 128, plate: { cx: 64, cy: 64, r: plateR }, shapes };
}
```
Bounds check: flatbread shapes stay within rx ≤ 44 < 54; bowl r 42 < 54; drink ry ≤ 40 → 66 + 40 = 106 → distance from 64 is 42 + rx… ellipse bound uses max(rx, ry) = 40 from (64, 66): 2 + 40 = 42 ≤ 54 ✓; straw endpoints within ±46 ✓; side pieces at dist ≤ 26 + 14 = 40 ✓. If a test still fails, tighten the ranges, never the test.

Run → PASS. Commit: `feat(ui): deterministic plate planner`.

- [ ] **Step 5: Plate component and theme aliases**

`packages/ui/theme.css`: add after the `@theme inline` block:
```css
/* Plate illustrations (packages/ui/src/components/plate.tsx) draw only with these aliases. */
:root {
  --plate-base: var(--card);
  --plate-rim: var(--border);
  --plate-slot-0: var(--primitive-color-oat-sunken);
  --plate-slot-1: var(--primitive-color-ember-500);
  --plate-slot-2: var(--primitive-color-ember-100);
  --plate-slot-3: var(--primitive-color-olive-500);
  --plate-slot-4: var(--primitive-color-olive-100);
  --plate-slot-5: var(--primitive-color-ink-500);
}
```
Confirm each referenced primitive exists in `packages/ui/tokens.css` (`grep -c "primitive-color-ember-100" packages/ui/tokens.css`); if the light ember/olive live under another shade key, use that key.

`packages/ui/src/components/plate.tsx` (presentational, exempt):
```tsx
import type { SVGProps } from 'react';
import { planPlate, type PlateKind, type PlateShape } from '../lib/plate-plan';
import { cn } from '../lib/utils';

const fill = (slot: number) => `var(--plate-slot-${slot})`;
const polar = (cx: number, cy: number, r: number, a: number) => `${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${polar(cx, cy, r, start)} A ${r} ${r} 0 ${large} 1 ${polar(cx, cy, r, end)}`;
}

function Shape({ s }: { s: PlateShape }) {
  switch (s.type) {
    case 'circle':
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill={fill(s.slot)} />;
    case 'ellipse':
      return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={`rotate(${s.rotate} ${s.cx} ${s.cy})`} fill={fill(s.slot)} />;
    case 'arc':
      return <path d={arcPath(s.cx, s.cy, s.r, s.start, s.end)} fill="none" stroke={fill(s.slot)} strokeWidth={s.width} strokeLinecap="round" />;
    case 'wedge':
      return <path d={`${arcPath(s.cx, s.cy, s.r, s.start, s.end)} L ${s.cx} ${s.cy} Z`} fill={fill(s.slot)} />;
    case 'stroke':
      return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={fill(s.slot)} strokeWidth={s.width} strokeLinecap="round" />;
  }
}

export interface PlateProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: string;
  kind: PlateKind;
  /** Defaults to `name`; pass a stable id to keep a plate identical after a rename. */
  seed?: string;
  size?: number;
}

export function Plate({ name, kind, seed, size, className, ...rest }: PlateProps) {
  const plan = planPlate(seed ?? name, kind);
  return (
    <svg viewBox="0 0 128 128" role="img" aria-label={name} width={size} height={size} className={cn('shrink-0', className)} {...rest}>
      <circle cx={plan.plate.cx} cy={plan.plate.cy} r={plan.plate.r} fill="var(--plate-base)" stroke="var(--plate-rim)" strokeWidth={2} />
      {plan.shapes.map((s, i) => (
        <Shape key={i} s={s} />
      ))}
    </svg>
  );
}
```
`packages/ui/src/index.ts`: add `export * from './components/plate';` and `export * from './lib/plate-plan';`.

- [ ] **Step 6: Verify and commit**

Run: `corepack pnpm --filter @tabletap/ui test && corepack pnpm --filter @tabletap/ui typecheck && corepack pnpm --filter @tabletap/ui lint && corepack pnpm validate-tokens && corepack pnpm exec prettier --check packages/ui packages/shared` → all green.
```bash
git add packages/ui packages/shared
git commit -m "feat(ui): plate illustration component and theme aliases

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0001 (order numbers, indexes) and `restaurantId` on the guest principal

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Modify: `packages/db/src/schema/orders.ts`, `packages/db/src/schema/guest.ts`, `packages/db/src/schema/audit.ts`, `packages/db/src/schema.test.ts`
- Create: `packages/db/migrations/0001_*.sql` (+ meta) via drizzle-kit
- Modify: `packages/shared/src/principal.ts`, `apps/api/src/lib/guest-sessions.ts`, `apps/api/src/lib/resolve-principal.ts`, `apps/api/src/routes/guest.test.ts`, `apps/api/src/plugins/rbac.test.ts`

**Interfaces (produced):** `orders.number` (identity, unique); `GuestPrincipal.restaurantId: string`; `findActiveGuestSession()` result gains `restaurantId`.

- [ ] **Step 1: Failing schema tests**

Append to `packages/db/src/schema.test.ts` (inside the existing `describe('migrations')`, reusing `ctx`):
```ts
it('numbers orders with an identity column and indexes the hot columns', async () => {
  const r = await ctx.db.execute(sql`select id from restaurants limit 1`) as unknown as { rows: { id: string }[] };
  const t = await ctx.db.execute(sql`select id from tables limit 1`) as unknown as { rows: { id: string }[] };
  const rid = r.rows[0]!.id, tid = t.rows[0]!.id;
  const a = (await ctx.db.execute(sql`insert into orders (restaurant_id, table_id, status) values (${rid}, ${tid}, 'placed') returning number`)) as unknown as { rows: { number: number }[] };
  const b = (await ctx.db.execute(sql`insert into orders (restaurant_id, table_id, status) values (${rid}, ${tid}, 'placed') returning number`)) as unknown as { rows: { number: number }[] };
  expect(b.rows[0]!.number).toBe(a.rows[0]!.number + 1);
  const idx = (await ctx.db.execute(sql`select indexname from pg_indexes where schemaname = 'public'`)) as unknown as { rows: { indexname: string }[] };
  const names = idx.rows.map((x) => x.indexname);
  for (const n of ['orders_table_id_idx', 'orders_status_idx', 'orders_number_uidx', 'order_items_order_id_idx', 'guest_sessions_expires_at_idx', 'audit_log_action_idx']) expect(names, n).toContain(n);
});
```
(This test runs after the unique-table test, which inserted restaurant `r` and table 1 — reuse them as shown.) Run: `corepack pnpm --filter @tabletap/db test` → FAIL (column `number` missing).

- [ ] **Step 2: Schema changes and migration**

`packages/db/src/schema/orders.ts`: import `index, uniqueIndex` from `drizzle-orm/pg-core`; add to `orders` columns `number: integer('number').generatedAlwaysAsIdentity(),` and a third `pgTable` argument `(t) => [index('orders_table_id_idx').on(t.tableId), index('orders_status_idx').on(t.status), uniqueIndex('orders_number_uidx').on(t.number)]`; `orderItems` gets `(t) => [index('order_items_order_id_idx').on(t.orderId)]`. `guest.ts`: `(t) => [index('guest_sessions_expires_at_idx').on(t.expiresAt)]`. `audit.ts`: `(t) => [index('audit_log_action_idx').on(t.action)]`. If `generatedAlwaysAsIdentity` is not available on `integer()` in drizzle-orm 0.45, use `.generatedByDefaultAsIdentity()`; if neither exists, use `serial('number')` and keep the unique index (report which).

```bash
corepack pnpm --filter @tabletap/db generate --name orders-number-and-indexes
```
Inspect `packages/db/migrations/0001_orders-number-and-indexes.sql`: `ALTER TABLE "orders" ADD COLUMN "number" integer ... GENERATED ALWAYS AS IDENTITY`, five `CREATE INDEX`, one `CREATE UNIQUE INDEX`. Run the db tests → PASS (9 → 10). Commit: `feat(db): order numbers and indexes for the guest flow`.

- [ ] **Step 3: Failing API tests for `restaurantId`**

In `apps/api/src/routes/guest.test.ts`, the test "makes /api/me report the guest principal" adds: `expect(MeResponseSchema.parse(me.json()).principal).toMatchObject({ kind: 'guest', tableNumber: 5, restaurantId })` where `restaurantId` is the id already loaded in `beforeAll`. In `apps/api/src/plugins/rbac.test.ts`, the literal guest principal in `roleOf maps principals` gains `restaurantId: 'r'`. Run: `corepack pnpm --filter @tabletap/api test src/routes/guest.test.ts` → FAIL (schema rejects the principal without `restaurantId`).

- [ ] **Step 4: Implement**

`packages/shared/src/principal.ts`: `GuestPrincipalSchema` gains `restaurantId: z.uuid()` after `tableId`. `apps/api/src/lib/guest-sessions.ts` `findActiveGuestSession` select gains `restaurantId: schema.tables.restaurantId`. `apps/api/src/lib/resolve-principal.ts` guest principal gains `restaurantId: guest.restaurantId`. Run the whole api suite, typecheck (web too: `corepack pnpm typecheck`), lint → PASS.
```bash
git add packages/shared apps/api
git commit -m "feat(api): carry the restaurant id on the guest principal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: `GET /api/menu`

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `apps/api/src/lib/restaurant.ts`, `apps/api/src/routes/menu.ts`, `apps/api/src/routes/menu.test.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces (produced):**
```ts
export async function restaurantIdFor(db: Db, principal: Principal): Promise<string>  // guest → principal.restaurantId; staff → the single restaurant; anonymous → throws UNAUTHORIZED
export async function loadMenu(db: Db, restaurantId: string): Promise<MenuResponse>
menuRoutes  // GET /api/menu, guard requireAction('menu.read')
```

- [ ] **Step 1: Failing tests**

`apps/api/src/routes/menu.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { MenuResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, signInAs } from '../test/helpers';

describe('GET /api/menu', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });

  it('is 401 for anonymous', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/menu' })).statusCode).toBe(401);
  });
  it('returns the seeded menu for a guest, ordered, with unavailable items flagged', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 3);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const menu = MenuResponseSchema.parse(res.json());
    expect(menu.restaurant.name).toBe('Little Furnace');
    expect(menu.categories.map((c) => c.name)).toEqual(['Flatbreads', 'Bowls', 'Sides', 'Drinks']);
    expect(menu.categories.flatMap((c) => c.items)).toHaveLength(20);
    const burrata = menu.categories[2]!.items.find((i) => i.name === 'Burrata & Peaches');
    expect(burrata?.isAvailable).toBe(false);
    expect(menu.categories[0]!.items.map((i) => i.name)[0]).toBe('Margherita Flatbread');
    expect(menu.categories[0]!.items[0]!.allergens).toEqual(['gluten', 'dairy']);
  });
  it('returns the menu for staff', async () => {
    const cookie = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(MenuResponseSchema.parse(res.json()).categories).toHaveLength(4);
  });
  it('hides inactive categories', async () => {
    await ctx.db.update(schema.menuCategories).set({ isActive: false }).where(eq(schema.menuCategories.name, 'Drinks'));
    const { cookie } = await claimTable(ctx.app, ctx.db, 4);
    const menu = MenuResponseSchema.parse((await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json());
    expect(menu.categories.map((c) => c.name)).toEqual(['Flatbreads', 'Bowls', 'Sides']);
    await ctx.db.update(schema.menuCategories).set({ isActive: true }).where(eq(schema.menuCategories.name, 'Drinks'));
  });
});
```
Run: `corepack pnpm --filter @tabletap/api test src/routes/menu.test.ts` → FAIL (404).

- [ ] **Step 2: Implement**

`apps/api/src/lib/restaurant.ts`:
```ts
import { schema, type Db } from '@tabletap/db';
import type { Principal } from '@tabletap/shared';
import { AppError } from './errors';

/** Single-tenant today: staff see the only restaurant; guests are pinned to theirs by the session. */
export async function restaurantIdFor(db: Db, principal: Principal): Promise<string> {
  if (principal.kind === 'guest') return principal.restaurantId;
  if (principal.kind === 'anonymous') throw new AppError('UNAUTHORIZED', 401, 'Sign in to continue.');
  const [row] = await db.select({ id: schema.restaurants.id }).from(schema.restaurants).limit(1);
  if (!row) throw new AppError('NOT_FOUND', 404, 'No restaurant is configured.');
  return row.id;
}
```

`apps/api/src/routes/menu.ts`:
```ts
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AllergenSchema, MenuResponseSchema, type MenuResponse } from '@tabletap/shared';
import { schema, type Db } from '@tabletap/db';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAction } from '../plugins/rbac';

export async function loadMenu(db: Db, restaurantId: string): Promise<MenuResponse> {
  const [restaurant] = await db
    .select({ id: schema.restaurants.id, name: schema.restaurants.name, currency: schema.restaurants.currency })
    .from(schema.restaurants)
    .where(eq(schema.restaurants.id, restaurantId));
  if (!restaurant) return { restaurant: { id: restaurantId, name: '', currency: 'USD' }, categories: [] };
  const categories = await db
    .select({ id: schema.menuCategories.id, name: schema.menuCategories.name, sortOrder: schema.menuCategories.sortOrder })
    .from(schema.menuCategories)
    .where(and(eq(schema.menuCategories.restaurantId, restaurantId), eq(schema.menuCategories.isActive, true)))
    .orderBy(asc(schema.menuCategories.sortOrder), asc(schema.menuCategories.name));
  const ids = categories.map((c) => c.id);
  const items = ids.length === 0 ? [] : await db
    .select()
    .from(schema.menuItems)
    .where(inArray(schema.menuItems.categoryId, ids))
    .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.name));
  return {
    restaurant,
    categories: categories.map((c) => ({
      ...c,
      items: items
        .filter((i) => i.categoryId === c.id)
        .map((i) => ({
          id: i.id,
          categoryId: i.categoryId,
          name: i.name,
          description: i.description,
          priceCents: i.priceCents,
          allergens: i.allergens.flatMap((a) => (AllergenSchema.safeParse(a).success ? [AllergenSchema.parse(a)] : [])),
          isAvailable: i.isAvailable,
          imageUrl: i.imageUrl,
          sortOrder: i.sortOrder,
        })),
    })),
  };
}

export async function menuRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/menu',
    { preHandler: requireAction('menu.read'), schema: { response: { 200: MenuResponseSchema } } },
    async (request) => loadMenu(app.db, await restaurantIdFor(app.db, request.principal)),
  );
}
```
Register in `server.ts` after `tablesRoutes`: `await app.register(menuRoutes, { prefix: '/api' });`. Run the test file → PASS; whole api suite, typecheck, lint → PASS.
```bash
git add apps/api
git commit -m "feat(api): menu endpoint scoped by restaurant

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Orders — `POST /api/orders`, `GET /api/orders/:id`, `GET /api/orders`

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `apps/api/src/lib/orders.ts`, `apps/api/src/routes/orders.ts`, `apps/api/src/routes/orders.test.ts`
- Modify: `apps/api/src/server.ts` (rate-limit `hook: 'preHandler'`, register routes)

**Interfaces (produced):**
```ts
export class OrderInputError extends AppError {}   // thrown by createOrder: VALIDATION_FAILED (unknown ids) or ITEM_UNAVAILABLE
export async function createOrder(db: Db, input: { principal: GuestPrincipal; body: OrderCreateRequest; idempotencyKey: string; now?: Date }): Promise<{ order: OrderDto; created: boolean }>
export async function loadOrder(db: Db, orderId: string): Promise<(OrderDto & { guestSessionId: string | null }) | null>
export async function listOrders(db: Db, filter: { guestSessionId: string } | { restaurantId: string }, limit?: number): Promise<OrderDto[]>
ordersRoutes  // POST /api/orders (guest, rate limit 10/min per session, Idempotency-Key header), GET /api/orders/:id, GET /api/orders
```
Important Fastify detail: `@fastify/rate-limit` runs in `onRequest` by default, before `principalPlugin`'s `preHandler` resolves the principal. Register the plugin with `hook: 'preHandler'` in `buildApp` so route-level limits can key on the principal; app-level `preHandler` hooks (principal) run before route-level ones (rate limit), so the principal is available.

- [ ] **Step 1: Failing tests**

`apps/api/src/routes/orders.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { schema } from '@tabletap/db';
import { IDEMPOTENCY_KEY_HEADER, MenuResponseSchema, OrderResponseSchema, OrdersResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, signInAs } from '../test/helpers';

describe('orders', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let byName: Record<string, { id: string; priceCents: number }>;
  const post = (cookie: string, payload: unknown, key: string = randomUUID()) =>
    ctx.app.inject({ method: 'POST', url: '/api/orders', headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: key }, payload });

  beforeAll(async () => {
    ctx = await createTestApp();
    const { cookie } = await claimTable(ctx.app, ctx.db, 1);
    const menu = MenuResponseSchema.parse((await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json());
    byName = Object.fromEntries(menu.categories.flatMap((c) => c.items).map((i) => [i.name, { id: i.id, priceCents: i.priceCents }]));
  });
  afterAll(async () => { await ctx.close(); });

  it('places an order with prices from the database and writes an audit row', async () => {
    const { cookie, tableId } = await claimTable(ctx.app, ctx.db, 7);
    const res = await post(cookie, {
      items: [{ menuItemId: byName['Margherita Flatbread']!.id, quantity: 2, priceCents: 1 }, { menuItemId: byName['House Lemonade']!.id, quantity: 1 }],
      note: 'No basil',
    });
    expect(res.statusCode).toBe(201);
    const { order } = OrderResponseSchema.parse(res.json());
    expect(order).toMatchObject({ status: 'placed', tableId, tableNumber: 7, note: 'No basil', subtotalCents: 2800, totalCents: 2800 });
    expect(order.number).toBeGreaterThan(0);
    expect(order.placedAt).not.toBeNull();
    expect(order.items.map((i) => [i.name, i.unitPriceCents, i.quantity, i.lineTotalCents])).toEqual([
      ['Margherita Flatbread', 1200, 2, 2400],
      ['House Lemonade', 400, 1, 400],
    ]);
    const audit = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'order.placed'));
    expect(audit.at(-1)?.entityId).toBe(order.id);
  });
  it('rejects a missing or malformed Idempotency-Key', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const res = await ctx.app.inject({ method: 'POST', url: '/api/orders', headers: { cookie }, payload: { items: [{ menuItemId: byName['House Lemonade']!.id, quantity: 1 }] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
  it('replays the same key for the same session and refuses it for another session', async () => {
    const key = randomUUID();
    const a = await claimTable(ctx.app, ctx.db, 8);
    const first = await post(a.cookie, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 1 }] }, key);
    const second = await post(a.cookie, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 3 }] }, key);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().order.id).toBe(first.json().order.id);
    expect(second.json().order.items[0].quantity).toBe(1);
    const b = await claimTable(ctx.app, ctx.db, 9);
    const other = await post(b.cookie, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 1 }] }, key);
    expect(other.statusCode).toBe(409);
    expect(other.json().error.code).toBe('CONFLICT');
  });
  it('refuses unavailable items with the names to remove', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const res = await post(cookie, { items: [{ menuItemId: byName['Burrata & Peaches']!.id, quantity: 1 }, { menuItemId: byName['Marinated Olives']!.id, quantity: 1 }] });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'ITEM_UNAVAILABLE', details: { unavailable: [{ menuItemId: byName['Burrata & Peaches']!.id, name: 'Burrata & Peaches' }] } });
  });
  it('refuses unknown items and bad quantities', async () => {
    const { cookie } = await claimTable(ctx.app, ctx.db, 7);
    const unknown = await post(cookie, { items: [{ menuItemId: randomUUID(), quantity: 1 }] });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('VALIDATION_FAILED');
    expect((await post(cookie, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 21 }] })).statusCode).toBe(400);
  });
  it('is 401 for anonymous and 403 for staff', async () => {
    expect((await ctx.app.inject({ method: 'POST', url: '/api/orders', headers: { [IDEMPOTENCY_KEY_HEADER]: randomUUID() }, payload: { items: [] } })).statusCode).toBe(401);
    const staff = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    expect((await post(staff, { items: [{ menuItemId: byName['Cold Brew']!.id, quantity: 1 }] })).statusCode).toBe(403);
  });
  it('lets a guest read only their own orders and staff read any', async () => {
    const a = await claimTable(ctx.app, ctx.db, 10);
    const b = await claimTable(ctx.app, ctx.db, 11);
    const created = OrderResponseSchema.parse((await post(a.cookie, { items: [{ menuItemId: byName['Furnace Potatoes']!.id, quantity: 1 }] })).json()).order;
    expect((await ctx.app.inject({ method: 'GET', url: `/api/orders/${created.id}`, headers: { cookie: a.cookie } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/orders/${created.id}`, headers: { cookie: b.cookie } })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/orders/${randomUUID()}`, headers: { cookie: a.cookie } })).statusCode).toBe(404);
    const staff = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    expect((await ctx.app.inject({ method: 'GET', url: `/api/orders/${created.id}`, headers: { cookie: staff } })).statusCode).toBe(200);
    const mine = OrdersResponseSchema.parse((await ctx.app.inject({ method: 'GET', url: '/api/orders', headers: { cookie: a.cookie } })).json()).orders;
    expect(mine.map((o) => o.id)).toEqual([created.id]);
    expect(OrdersResponseSchema.parse((await ctx.app.inject({ method: 'GET', url: '/api/orders', headers: { cookie: b.cookie } })).json()).orders).toEqual([]);
    const all = OrdersResponseSchema.parse((await ctx.app.inject({ method: 'GET', url: '/api/orders', headers: { cookie: staff } })).json()).orders;
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(all[0]!.number).toBeGreaterThan(all[all.length - 1]!.number);
  });
  it('rate-limits order creation per guest session', async () => {
    const a = await claimTable(ctx.app, ctx.db, 12);
    const b = await claimTable(ctx.app, ctx.db, 2);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await post(a.cookie, { items: [{ menuItemId: byName['Sparkling Water']!.id, quantity: 1 }] })).statusCode;
    expect(last).toBe(429);
    expect((await post(b.cookie, { items: [{ menuItemId: byName['Sparkling Water']!.id, quantity: 1 }] })).statusCode).toBe(201);
  });
});
```
The first test posts `priceCents: 1` inside an item on purpose: the schema does not know that field, Zod strips it, and the test asserts the database price. Run: `corepack pnpm --filter @tabletap/api test src/routes/orders.test.ts` → FAIL (404).

- [ ] **Step 2: Implement the order library**

`apps/api/src/lib/orders.ts`:
```ts
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';
import type { GuestPrincipal, OrderCreateRequest, OrderDto, OrderStatus } from '@tabletap/shared';
import { recordAudit } from './audit';
import { AppError } from './errors';

type OrderRow = typeof schema.orders.$inferSelect;
type ItemRow = typeof schema.orderItems.$inferSelect;

function toDto(order: OrderRow, items: ItemRow[], tableNumber: number): OrderDto & { guestSessionId: string | null } {
  return {
    id: order.id,
    number: order.number,
    status: order.status as OrderStatus,
    tableId: order.tableId,
    tableNumber,
    items: items.map((i) => ({ id: i.id, menuItemId: i.menuItemId, name: i.nameSnapshot, unitPriceCents: i.unitPriceCents, quantity: i.quantity, lineTotalCents: i.lineTotalCents })),
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    note: order.note,
    placedAt: order.placedAt ? order.placedAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    guestSessionId: order.guestSessionId,
  };
}

async function hydrate(db: Db, orders: OrderRow[]): Promise<(OrderDto & { guestSessionId: string | null })[]> {
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const items = await db.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids)).orderBy(asc(schema.orderItems.createdAt), asc(schema.orderItems.id));
  const tables = await db.select({ id: schema.tables.id, number: schema.tables.number }).from(schema.tables).where(inArray(schema.tables.id, orders.map((o) => o.tableId)));
  const numberOf = new Map(tables.map((t) => [t.id, t.number]));
  return orders.map((o) => toDto(o, items.filter((i) => i.orderId === o.id), numberOf.get(o.tableId) ?? 0));
}

export async function loadOrder(db: Db, orderId: string) {
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!order) return null;
  return (await hydrate(db, [order]))[0] ?? null;
}

export async function listOrders(db: Db, filter: { guestSessionId: string } | { restaurantId: string }, limit = 100) {
  const where = 'guestSessionId' in filter ? eq(schema.orders.guestSessionId, filter.guestSessionId) : eq(schema.orders.restaurantId, filter.restaurantId);
  const rows = await db.select().from(schema.orders).where(where).orderBy(desc(schema.orders.number)).limit(limit);
  return hydrate(db, rows);
}

export async function createOrder(
  db: Db,
  input: { principal: GuestPrincipal; body: OrderCreateRequest; idempotencyKey: string; now?: Date },
): Promise<{ order: OrderDto; created: boolean }> {
  const now = input.now ?? new Date();
  const { principal, body } = input;

  const existing = await loadOrder(db, ...); // see below
```
Write the body as follows (replace the placeholder line above):
```ts
  const [prior] = await db.select().from(schema.orders).where(eq(schema.orders.idempotencyKey, input.idempotencyKey));
  if (prior) {
    if (prior.guestSessionId !== principal.guestSessionId) throw new AppError('CONFLICT', 409, 'This request was already used by another session.');
    const dto = (await hydrate(db, [prior]))[0]!;
    return { order: dto, created: false };
  }

  const ids = body.items.map((i) => i.menuItemId);
  const rows = await db
    .select({ id: schema.menuItems.id, name: schema.menuItems.name, priceCents: schema.menuItems.priceCents, isAvailable: schema.menuItems.isAvailable, categoryActive: schema.menuCategories.isActive })
    .from(schema.menuItems)
    .innerJoin(schema.menuCategories, and(eq(schema.menuCategories.id, schema.menuItems.categoryId), eq(schema.menuCategories.restaurantId, principal.restaurantId)))
    .where(inArray(schema.menuItems.id, ids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw new AppError('VALIDATION_FAILED', 400, 'Some items are not on the menu.', { unknown });
  const unavailable = rows.filter((r) => !r.isAvailable || !r.categoryActive).map((r) => ({ menuItemId: r.id, name: r.name }));
  if (unavailable.length > 0) throw new AppError('ITEM_UNAVAILABLE', 409, 'Some items are sold out today.', { unavailable });

  const lines = body.items.map((i) => {
    const row = byId.get(i.menuItemId)!;
    return { menuItemId: row.id, nameSnapshot: row.name, unitPriceCents: row.priceCents, quantity: i.quantity, lineTotalCents: row.priceCents * i.quantity };
  });
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);

  const order = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(schema.orders)
      .values({
        restaurantId: principal.restaurantId,
        tableId: principal.tableId,
        guestSessionId: principal.guestSessionId,
        status: 'placed',
        subtotalCents,
        totalCents: subtotalCents,
        note: body.note && body.note.length > 0 ? body.note : null,
        idempotencyKey: input.idempotencyKey,
        placedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!inserted) throw new Error('order insert returned nothing');
    await tx.insert(schema.orderItems).values(lines.map((l) => ({ ...l, orderId: inserted.id, createdAt: now, updatedAt: now })));
    await recordAudit(tx as unknown as Db, {
      actorType: 'guest',
      actorId: principal.guestSessionId,
      action: 'order.placed',
      entityType: 'order',
      entityId: inserted.id,
      payload: { number: inserted.number, totalCents: subtotalCents, itemCount: lines.length },
    });
    return inserted;
  });
  const dto = (await hydrate(db, [order]))[0]!;
  return { order: dto, created: true };
}
```
(Remove the `guestSessionId` field from the DTOs returned to clients in the routes — it is an internal scoping field; the route strips it.)

- [ ] **Step 3: Routes and rate-limit hook**

`apps/api/src/routes/orders.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { IDEMPOTENCY_KEY_HEADER, IdempotencyKeySchema, OrderCreateRequestSchema, OrderResponseSchema, OrdersResponseSchema, can } from '@tabletap/shared';
import { AppError } from '../lib/errors';
import { createOrder, listOrders, loadOrder } from '../lib/orders';
import { restaurantIdFor } from '../lib/restaurant';
import { requireAction, requireAuthenticated } from '../plugins/rbac';

const strip = <T extends { guestSessionId: string | null }>({ guestSessionId: _omit, ...rest }: T) => rest;

export async function ordersRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post(
    '/orders',
    {
      preHandler: requireAction('orders.create'),
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (request) => (request.principal.kind === 'guest' ? `guest:${request.principal.guestSessionId}` : request.ip),
        },
      },
      schema: {
        headers: z.object({ [IDEMPOTENCY_KEY_HEADER]: IdempotencyKeySchema }),
        body: OrderCreateRequestSchema,
        response: { 200: OrderResponseSchema, 201: OrderResponseSchema },
      },
    },
    async (request, reply) => {
      const principal = request.principal;
      if (principal.kind !== 'guest') throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const { order, created } = await createOrder(app.db, { principal, body: request.body, idempotencyKey: request.headers[IDEMPOTENCY_KEY_HEADER] });
      return reply.status(created ? 201 : 200).send({ order: strip(order) });
    },
  );
  r.get(
    '/orders/:id',
    { preHandler: requireAuthenticated(), schema: { params: z.object({ id: z.uuid() }), response: { 200: OrderResponseSchema } } },
    async (request) => {
      const order = await loadOrder(app.db, request.params.id);
      if (!order) throw new AppError('NOT_FOUND', 404, 'Order not found.');
      const p = request.principal;
      const allowed = p.kind === 'guest' ? order.guestSessionId === p.guestSessionId : p.kind === 'staff' && can(p.role, 'orders.read.all');
      if (!allowed) throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      return { order: strip(order) };
    },
  );
  r.get('/orders', { preHandler: requireAuthenticated(), schema: { response: { 200: OrdersResponseSchema } } }, async (request) => {
    const p = request.principal;
    if (p.kind === 'guest') return { orders: (await listOrders(app.db, { guestSessionId: p.guestSessionId })).map(strip) };
    if (p.kind === 'staff' && can(p.role, 'orders.read.all')) return { orders: (await listOrders(app.db, { restaurantId: await restaurantIdFor(app.db, p) })).map(strip) };
    throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
  });
}
```
In `server.ts`: register rate-limit with `hook: 'preHandler'` (add to the existing options object) and `await app.register(ordersRoutes, { prefix: '/api' });` after `menuRoutes`. The `keyGenerator` type from `@fastify/rate-limit` receives a `FastifyRequest`; `request.principal` is typed through `src/types.ts`. If `hook: 'preHandler'` changes the order of the existing sign-in/claim rate-limit tests (they should be unaffected; the buckets are per IP), keep the tests and fix the registration, not the tests.

Run the orders tests → PASS; the whole api suite (the M1 rate-limit tests must still pass), typecheck, lint → PASS.
```bash
git add apps/api
git commit -m "feat(api): place and read orders with server-side prices and idempotency

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: Demo links endpoint, demo config and the reset scheduler

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Modify: `apps/api/src/config.ts`, `apps/api/src/config.test.ts`, `apps/api/src/test/helpers.ts`, `apps/api/src/server.ts`, `packages/db/src/seed/run.ts`, `.env.example`, `docker-compose.yml`
- Create: `apps/api/src/routes/demo.ts`, `apps/api/src/routes/demo.test.ts`, `apps/api/src/lib/demo-reset.ts`, `apps/api/src/lib/demo-reset.test.ts`, `apps/api/src/plugins/demo-reset.ts`

**Interfaces (produced):**
```ts
Config += { DEMO_MODE: 'true'|'false'; DEMO_RESET_INTERVAL_MINUTES: number; DEMO_PASSWORD: string; demoMode: boolean }
export const DEMO_TABLE_NUMBER = 7;          // routes/demo.ts
demoRoutes                                    // GET /api/demo/links (public, 30/min per IP, 404 unless demoMode)
export function scheduleDemoReset(input: { intervalMs: number; run: () => Promise<void>; log: { info(msg: string): void; error(obj: unknown, msg: string): void } }): () => void
demoResetPlugin                               // starts the scheduler when demoMode && interval > 0 && NODE_ENV !== 'test'
// @tabletap/db/seed also re-exports DEMO_STAFF and DEMO_RESTAURANT_SLUG
```

- [ ] **Step 1: Failing config tests**

Append to `apps/api/src/config.test.ts` (inside `describe('loadConfig')`, `valid` is the existing fixture):
```ts
it('defaults demo mode off with an hourly reset interval', () => {
  const c = loadConfig(valid);
  expect(c.demoMode).toBe(false);
  expect(c.DEMO_RESET_INTERVAL_MINUTES).toBe(60);
  expect(c.DEMO_PASSWORD).toBe('tabletap-demo');
});
it('enables demo mode from the environment', () => {
  expect(loadConfig({ ...valid, DEMO_MODE: 'true', DEMO_RESET_INTERVAL_MINUTES: '0' })).toMatchObject({ demoMode: true, DEMO_RESET_INTERVAL_MINUTES: 0 });
  expect(() => loadConfig({ ...valid, DEMO_MODE: 'yes' })).toThrow(/DEMO_MODE/);
});
```
Run → FAIL. Implement in `config.ts`: schema fields `DEMO_MODE: z.enum(['true', 'false']).default('false')`, `DEMO_RESET_INTERVAL_MINUTES: z.coerce.number().int().nonnegative().default(60)`, `DEMO_PASSWORD: z.string().min(8).default('tabletap-demo')`; `Config` type adds `demoMode: boolean`; `loadConfig` returns `{ ...parsed.data, cookieSecure, demoMode: parsed.data.DEMO_MODE === 'true' }`. `TEST_CONFIG` in `src/test/helpers.ts` gains `DEMO_MODE: 'true', DEMO_RESET_INTERVAL_MINUTES: 0, DEMO_PASSWORD: 'tabletap-demo', demoMode: true`. Run the api suite → PASS. Commit `feat(api): demo mode configuration`.

- [ ] **Step 2: Failing demo links tests**

`packages/db/src/seed/run.ts`: add `export { DEMO_STAFF, DEMO_RESTAURANT_SLUG } from './data';` (no behaviour change).

`apps/api/src/routes/demo.test.ts`:
```ts
import { verifyTableToken } from '@tabletap/shared/server';
import { DemoLinksResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@tabletap/db/testing';
import { seed } from '@tabletap/db/seed';
import { buildApp } from '../server';
import { TEST_CONFIG, TEST_DEMO_PASSWORD, createTestApp } from '../test/helpers';

describe('GET /api/demo/links', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });

  it('returns a signed guest url for table 7, the staff accounts and the reset interval', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/demo/links' });
    expect(res.statusCode).toBe(200);
    const body = DemoLinksResponseSchema.parse(res.json());
    expect(body.guest.tableNumber).toBe(7);
    expect(body.guest.url.startsWith(`${TEST_CONFIG.WEB_ORIGIN}/t/`)).toBe(true);
    const claims = await verifyTableToken(body.guest.url.split('/t/')[1]!, { secret: TEST_CONFIG.TABLE_TOKEN_SECRET });
    expect(claims.tableNumber).toBe(7);
    expect(body.staff.map((s) => [s.role, s.email, s.name])).toEqual([
      ['admin', 'admin@littlefurnace.demo', 'Mara Quinn'],
      ['kitchen', 'kitchen@littlefurnace.demo', 'Theo Baptiste'],
      ['waiter', 'waiter@littlefurnace.demo', 'Jun Okafor'],
    ]);
    expect(body.staff.every((s) => s.password === TEST_DEMO_PASSWORD)).toBe(true);
    expect(body.resetsEveryMinutes).toBeNull();
  });
  it('is 404 when demo mode is off', async () => {
    const { db, close } = await createTestDb();
    await seed(db, { mode: 'reset', demoPassword: TEST_DEMO_PASSWORD, tableTokenSecret: TEST_CONFIG.TABLE_TOKEN_SECRET, tableTokenTtlDays: 1, webOrigin: TEST_CONFIG.WEB_ORIGIN });
    const app = await buildApp({ db, config: { ...TEST_CONFIG, DEMO_MODE: 'false', demoMode: false }, logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/demo/links' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    await app.close();
    await close();
  });
  it('is rate-limited to 30 per minute per ip', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await ctx.app.inject({ method: 'GET', url: '/api/demo/links' })).statusCode;
    expect(last).toBe(429);
  });
});
```
Run → FAIL (404 from the not-found handler in the first test).

- [ ] **Step 3: Implement the route**

`apps/api/src/routes/demo.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { DemoLinksResponseSchema } from '@tabletap/shared';
import { signTableToken } from '@tabletap/shared/server';
import { schema } from '@tabletap/db';
import { DEMO_RESTAURANT_SLUG, DEMO_STAFF } from '@tabletap/db/seed';
import { AppError } from '../lib/errors';

export const DEMO_TABLE_NUMBER = 7;

/** Public in demo mode only: everything it returns is already public demo data (README). */
export async function demoRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/demo/links',
    {
      config: { public: true, principal: false, rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { response: { 200: DemoLinksResponseSchema } },
    },
    async () => {
      const { config } = app;
      if (!config.demoMode) throw new AppError('NOT_FOUND', 404, 'Not found.');
      const [restaurant] = await app.db.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
      const [table] = restaurant
        ? await app.db.select({ id: schema.tables.id, number: schema.tables.number }).from(schema.tables).where(and(eq(schema.tables.restaurantId, restaurant.id), eq(schema.tables.number, DEMO_TABLE_NUMBER)))
        : [];
      if (!restaurant || !table) throw new AppError('NOT_FOUND', 404, 'Demo data is not seeded.');
      const token = await signTableToken(
        { tableId: table.id, restaurantId: restaurant.id, tableNumber: table.number },
        { secret: config.TABLE_TOKEN_SECRET, ttlSeconds: config.TABLE_TOKEN_TTL_DAYS * 86_400 },
      );
      return {
        guest: { tableNumber: table.number, url: `${config.WEB_ORIGIN}/t/${token}` },
        staff: DEMO_STAFF.map((s) => ({ role: s.role, email: s.email, name: s.name, password: config.DEMO_PASSWORD })),
        resetsEveryMinutes: config.DEMO_RESET_INTERVAL_MINUTES > 0 ? config.DEMO_RESET_INTERVAL_MINUTES : null,
      };
    },
  );
}
```
Register in `server.ts` after `ordersRoutes`: `await app.register(demoRoutes, { prefix: '/api' });`. Run → PASS. Commit `feat(api): demo links endpoint`.

- [ ] **Step 4: Failing scheduler test**

`apps/api/src/lib/demo-reset.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleDemoReset } from './demo-reset';

describe('scheduleDemoReset', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const log = { info: vi.fn(), error: vi.fn() };

  it('runs on every interval and stops when asked', async () => {
    const run = vi.fn(async () => undefined);
    const stop = scheduleDemoReset({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(2500);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('never overlaps runs and logs failures without dying', async () => {
    let resolveFirst!: () => void;
    const run = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((r) => { resolveFirst = r; }))
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(undefined);
    const stop = scheduleDemoReset({ intervalMs: 1000, run, log });
    await vi.advanceTimersByTimeAsync(2500);
    expect(run).toHaveBeenCalledTimes(1);
    resolveFirst();
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });
});
```
Run → FAIL.

- [ ] **Step 5: Implement the scheduler and plugin**

`apps/api/src/lib/demo-reset.ts`:
```ts
export interface DemoResetLog {
  info(msg: string): void;
  error(obj: unknown, msg: string): void;
}

/** Fires `run` every `intervalMs`, skipping a tick while the previous run is still going. */
export function scheduleDemoReset(input: { intervalMs: number; run: () => Promise<void>; log: DemoResetLog }): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    input
      .run()
      .then(() => input.log.info('demo data reset'))
      .catch((err: unknown) => input.log.error({ err }, 'demo reset failed'))
      .finally(() => {
        running = false;
      });
  }, input.intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
```

`apps/api/src/plugins/demo-reset.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { seed } from '@tabletap/db/seed';
import { scheduleDemoReset } from '../lib/demo-reset';

export const demoResetPlugin = fp(async (app: FastifyInstance) => {
  const { config } = app;
  if (!config.demoMode || config.DEMO_RESET_INTERVAL_MINUTES <= 0 || config.NODE_ENV === 'test') return;
  const stop = scheduleDemoReset({
    intervalMs: config.DEMO_RESET_INTERVAL_MINUTES * 60_000,
    run: async () => {
      const result = await seed(app.db, {
        mode: 'reset',
        demoPassword: config.DEMO_PASSWORD,
        tableTokenSecret: config.TABLE_TOKEN_SECRET,
        tableTokenTtlDays: config.TABLE_TOKEN_TTL_DAYS,
        webOrigin: config.WEB_ORIGIN,
      });
      app.log.info({ counts: result.counts }, 'demo data reset');
    },
    log: { info: (msg) => app.log.info(msg), error: (obj, msg) => app.log.error(obj, msg) },
  });
  app.addHook('onClose', async () => stop());
  app.log.info({ everyMinutes: config.DEMO_RESET_INTERVAL_MINUTES }, 'demo reset scheduled');
});
```
Register in `server.ts` right after `principalPlugin`. `.env.example` (api section, after `DEMO_PASSWORD`): `# Demo mode: exposes GET /api/demo/links and resets the seed on an interval (0 disables the reset).` `DEMO_MODE=true` `DEMO_RESET_INTERVAL_MINUTES=60`. `docker-compose.yml` api `environment`: add `DEMO_MODE: ${DEMO_MODE:-true}`.

Run: whole api suite, typecheck, lint, prettier → PASS.
```bash
git add apps/api packages/db .env.example docker-compose.yml
git commit -m "feat(api): hourly demo reset scheduler

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Web data layer, basket store, `/t/[token]`, `/session-ended`

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; anthropic-skills:ui-styling.

**Files:**
- Create: `apps/web/lib/api.ts`, `lib/api.test.ts`, `lib/guest-cookie.ts`, `lib/cart.ts`, `lib/cart.test.ts`, `lib/money.ts`, `lib/money.test.ts`, `lib/elapsed.ts`, `lib/elapsed.test.ts`, `components/claim-table.tsx`, `components/claim-table.test.tsx`, `app/t/[token]/page.tsx`, `app/session-ended/page.tsx`, `app/not-found.tsx`
- Modify: `apps/web/app/layout.tsx` (`metadataBase`)

**Interfaces (produced):**
```ts
// lib/api.ts (isomorphic)
export class ApiError extends Error { status: number; code: ErrorCode | 'UNKNOWN'; details?: unknown }
export const API_URL: string                       // process.env.API_URL ?? 'http://localhost:4000'
export const GUEST_COOKIE = 'tt_guest'
export async function apiFetch<T>(path: string, opts: { schema: ZodType<T>; cookie?: string | null; init?: RequestInit }): Promise<T>   // server → API_URL, forwards tt_guest
export async function clientFetch<T>(path: string, opts: { schema: ZodType<T>; init?: RequestInit }): Promise<T>                          // browser → same origin
// lib/guest-cookie.ts (server only)
export async function guestCookie(): Promise<string | null>
// lib/cart.ts
export interface Cart { items: Record<string, number> }
export const EMPTY_CART, MAX_QUANTITY = 20, MAX_LINES = 50
export function addItem(cart, menuItemId, by = 1): Cart; setQuantity(cart, menuItemId, quantity): Cart; removeItem(cart, menuItemId): Cart; clearCart(): Cart
export function countItems(cart): number
export interface CartLine { menuItemId: string; quantity: number; item: MenuItemDto | null; lineTotalCents: number; available: boolean }
export function cartLines(cart, menu: MenuResponse): CartLine[]; cartTotalCents(cart, menu): number; toOrderItems(cart, menu): { menuItemId; quantity }[]
export function cartStorageKey(tableId): string
export function useCart(tableId: string): { cart: Cart; add(id, by?): void; setQuantity(id, q): void; remove(id): void; clear(): void }
// lib/money.ts
export function formatCents(cents: number, currency = 'USD'): string   // 2600 → "$26.00"
// lib/elapsed.ts
export function formatElapsed(fromIso: string, nowMs = Date.now()): string   // "Just now" | "1 min ago" | "12 min ago" | "1 h 5 min ago"
```

- [ ] **Step 1: Failing tests for the pure helpers**

`apps/web/lib/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatCents } from './money';
describe('formatCents', () => {
  it('formats USD cents', () => {
    expect(formatCents(2600)).toBe('$26.00');
    expect(formatCents(450)).toBe('$4.50');
    expect(formatCents(0)).toBe('$0.00');
  });
});
```
`apps/web/lib/elapsed.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatElapsed } from './elapsed';
const t0 = Date.parse('2026-09-03T10:00:00Z');
describe('formatElapsed', () => {
  it('speaks in honest minutes', () => {
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 30_000)).toBe('Just now');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 60_000)).toBe('1 min ago');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 12 * 60_000 + 5_000)).toBe('12 min ago');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 65 * 60_000)).toBe('1 h 5 min ago');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 - 5_000)).toBe('Just now');
  });
});
```
`apps/web/lib/cart.test.ts`:
```ts
import { act, renderHook } from '@testing-library/react';
import type { MenuResponse } from '@tabletap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_CART, addItem, cartLines, cartStorageKey, cartTotalCents, countItems, removeItem, setQuantity, toOrderItems, useCart } from './cart';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = {
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' },
  categories: [{ id: U(2), name: 'Flatbreads', sortOrder: 0, items: [
    { id: U(3), categoryId: U(2), name: 'Margherita Flatbread', description: '', priceCents: 1200, allergens: [], isAvailable: true, imageUrl: null, sortOrder: 0 },
    { id: U(4), categoryId: U(2), name: 'Burrata & Peaches', description: '', priceCents: 1100, allergens: [], isAvailable: false, imageUrl: null, sortOrder: 1 },
  ] }],
};

describe('cart functions', () => {
  it('adds, clamps, sets and removes', () => {
    let c = addItem(EMPTY_CART, U(3));
    c = addItem(c, U(3));
    expect(c.items[U(3)]).toBe(2);
    c = addItem(c, U(3), 100);
    expect(c.items[U(3)]).toBe(20);
    c = setQuantity(c, U(3), 3);
    expect(countItems(c)).toBe(3);
    c = setQuantity(c, U(3), 0);
    expect(c.items[U(3)]).toBeUndefined();
    c = removeItem(addItem(EMPTY_CART, U(4)), U(4));
    expect(countItems(c)).toBe(0);
  });
  it('prices lines from the menu and skips what is gone', () => {
    const c = addItem(addItem(addItem(EMPTY_CART, U(3), 2), U(4)), U(9));
    const lines = cartLines(c, menu);
    expect(lines.map((l) => [l.item?.name ?? null, l.quantity, l.lineTotalCents, l.available])).toEqual([
      ['Margherita Flatbread', 2, 2400, true],
      ['Burrata & Peaches', 1, 1100, false],
      [null, 1, 0, false],
    ]);
    expect(cartTotalCents(c, menu)).toBe(2400);
    expect(toOrderItems(c, menu)).toEqual([{ menuItemId: U(3), quantity: 2 }]);
  });
});

describe('useCart', () => {
  beforeEach(() => localStorage.clear());
  it('persists per table and survives a remount', () => {
    const { result, unmount } = renderHook(() => useCart('table-a'));
    act(() => result.current.add(U(3)));
    act(() => result.current.add(U(3)));
    expect(result.current.cart.items[U(3)]).toBe(2);
    unmount();
    const again = renderHook(() => useCart('table-a'));
    expect(again.result.current.cart.items[U(3)]).toBe(2);
    expect(renderHook(() => useCart('table-b')).result.current.cart).toEqual(EMPTY_CART);
    expect(localStorage.getItem(cartStorageKey('table-a'))).toContain(U(3));
  });
  it('ignores corrupted storage and clears', () => {
    localStorage.setItem(cartStorageKey('table-c'), '{not json');
    const { result } = renderHook(() => useCart('table-c'));
    expect(result.current.cart).toEqual(EMPTY_CART);
    act(() => result.current.add(U(3)));
    act(() => result.current.clear());
    expect(result.current.cart).toEqual(EMPTY_CART);
  });
});
```
`apps/web/lib/api.test.ts`:
```ts
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, clientFetch } from './api';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api helpers', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('parses a success body with the schema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { ok: true })));
    expect(await clientFetch('/api/x', { schema: z.object({ ok: z.boolean() }) })).toEqual({ ok: true });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
  });
  it('turns an envelope into an ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { error: { code: 'ITEM_UNAVAILABLE', message: 'Some items are sold out today.', details: { unavailable: [] } } })));
    await expect(clientFetch('/api/x', { schema: z.unknown() })).rejects.toMatchObject({ status: 409, code: 'ITEM_UNAVAILABLE', details: { unavailable: [] } });
  });
  it('forwards the guest cookie server-side and never caches', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, {})));
    await apiFetch('/api/menu', { schema: z.object({}), cookie: 'abc.sig+/=' });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/menu$/);
    expect(init).toMatchObject({ cache: 'no-store', headers: { cookie: `tt_guest=${encodeURIComponent('abc.sig+/=')}` } });
  });
  it('maps a non-envelope failure to UNKNOWN', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway', { status: 502 })));
    await expect(clientFetch('/api/x', { schema: z.unknown() })).rejects.toBeInstanceOf(ApiError);
    await expect(clientFetch('/api/x', { schema: z.unknown() })).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });
});
```
Run: `corepack pnpm --filter @tabletap/web test` → FAIL (modules missing).

- [ ] **Step 2: Implement the helpers**

`apps/web/lib/money.ts`:
```ts
export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
```
`apps/web/lib/elapsed.ts`:
```ts
export function formatElapsed(fromIso: string, nowMs = Date.now()): string {
  const minutes = Math.floor(Math.max(0, nowMs - Date.parse(fromIso)) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`;
}
```
`apps/web/lib/api.ts`:
```ts
import { ErrorEnvelopeSchema, type ErrorCode } from '@tabletap/shared';
import type { ZodType } from 'zod';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const GUEST_COOKIE = 'tt_guest';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'UNKNOWN',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseResponse<T>(res: Response, schema: ZodType<T>): Promise<T> {
  if (res.ok) return schema.parse(await res.json());
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const env = ErrorEnvelopeSchema.safeParse(body);
  if (env.success) throw new ApiError(res.status, env.data.error.code, env.data.error.message, env.data.error.details);
  throw new ApiError(res.status, 'UNKNOWN', `Request failed with status ${res.status}`);
}

/** Server components: talk to the API directly and forward the guest cookie. */
export async function apiFetch<T>(path: string, opts: { schema: ZodType<T>; cookie?: string | null; init?: RequestInit }): Promise<T> {
  const headers = new Headers(opts.init?.headers);
  if (opts.cookie) headers.set('cookie', `${GUEST_COOKIE}=${encodeURIComponent(opts.cookie)}`);
  const res = await fetch(`${API_URL}${path}`, { ...opts.init, headers, cache: 'no-store' });
  return parseResponse(res, opts.schema);
}

/** Browser: same origin, the rewrite proxies /api/* and the browser sends the cookies. */
export async function clientFetch<T>(path: string, opts: { schema: ZodType<T>; init?: RequestInit }): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...opts.init });
  return parseResponse(res, opts.schema);
}
```
Add `zod@4.5.4` to `apps/web` dependencies (`corepack pnpm --filter @tabletap/web add --save-exact zod@4.5.4`).

`apps/web/lib/guest-cookie.ts`:
```ts
import { cookies } from 'next/headers';
import { GUEST_COOKIE } from './api';

export async function guestCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(GUEST_COOKIE)?.value ?? null;
}
```

`apps/web/lib/cart.ts`:
```ts
'use client';
import type { MenuItemDto, MenuResponse } from '@tabletap/shared';
import { useCallback, useSyncExternalStore } from 'react';

export interface Cart {
  items: Record<string, number>;
}
export const EMPTY_CART: Cart = { items: {} };
export const MAX_QUANTITY = 20;
export const MAX_LINES = 50;

export function addItem(cart: Cart, menuItemId: string, by = 1): Cart {
  const current = cart.items[menuItemId] ?? 0;
  if (current === 0 && Object.keys(cart.items).length >= MAX_LINES) return cart;
  return { items: { ...cart.items, [menuItemId]: Math.min(MAX_QUANTITY, current + by) } };
}
export function setQuantity(cart: Cart, menuItemId: string, quantity: number): Cart {
  if (quantity <= 0) return removeItem(cart, menuItemId);
  return { items: { ...cart.items, [menuItemId]: Math.min(MAX_QUANTITY, Math.floor(quantity)) } };
}
export function removeItem(cart: Cart, menuItemId: string): Cart {
  const { [menuItemId]: _gone, ...rest } = cart.items;
  return { items: rest };
}
export function clearCart(): Cart {
  return EMPTY_CART;
}
export function countItems(cart: Cart): number {
  return Object.values(cart.items).reduce((a, b) => a + b, 0);
}

export interface CartLine {
  menuItemId: string;
  quantity: number;
  item: MenuItemDto | null;
  lineTotalCents: number;
  available: boolean;
}
function indexMenu(menu: MenuResponse): Map<string, MenuItemDto> {
  return new Map(menu.categories.flatMap((c) => c.items).map((i) => [i.id, i]));
}
export function cartLines(cart: Cart, menu: MenuResponse): CartLine[] {
  const index = indexMenu(menu);
  return Object.entries(cart.items).map(([menuItemId, quantity]) => {
    const item = index.get(menuItemId) ?? null;
    const available = item !== null && item.isAvailable;
    return { menuItemId, quantity, item, lineTotalCents: available ? item.priceCents * quantity : 0, available };
  });
}
export function cartTotalCents(cart: Cart, menu: MenuResponse): number {
  return cartLines(cart, menu).reduce((sum, l) => sum + l.lineTotalCents, 0);
}
export function toOrderItems(cart: Cart, menu: MenuResponse): { menuItemId: string; quantity: number }[] {
  return cartLines(cart, menu).filter((l) => l.available).map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity }));
}

export const cartStorageKey = (tableId: string) => `tt-cart:${tableId}`;

// --- store -------------------------------------------------------------------------------------
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; cart: Cart }>();

function read(key: string): Cart {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.cart;
  let cart = EMPTY_CART;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { items?: Record<string, unknown> };
      const items: Record<string, number> = {};
      for (const [id, q] of Object.entries(parsed.items ?? {})) if (typeof q === 'number' && q > 0) items[id] = Math.min(MAX_QUANTITY, Math.floor(q));
      cart = { items };
    } catch {
      cart = EMPTY_CART;
    }
  }
  cache.set(key, { raw, cart });
  return cart;
}
function write(key: string, cart: Cart) {
  const raw = countItems(cart) === 0 ? null : JSON.stringify(cart);
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    // storage unavailable: keep the in-memory value for this page load
  }
  cache.set(key, { raw, cart });
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useCart(tableId: string) {
  const key = cartStorageKey(tableId);
  const cart = useSyncExternalStore(subscribe, () => read(key), () => EMPTY_CART);
  const update = useCallback((next: (c: Cart) => Cart) => write(key, next(read(key))), [key]);
  return {
    cart,
    add: useCallback((id: string, by = 1) => update((c) => addItem(c, id, by)), [update]),
    setQuantity: useCallback((id: string, q: number) => update((c) => setQuantity(c, id, q)), [update]),
    remove: useCallback((id: string) => update((c) => removeItem(c, id)), [update]),
    clear: useCallback(() => update(() => clearCart()), [update]),
  };
}
```
Run the four test files → PASS. Commit `feat(web): api client, basket store and formatting helpers`.

- [ ] **Step 3: Failing test for the claim screen**

`apps/web/components/claim-table.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import { ClaimTable } from './claim-table';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ClaimTable', () => {
  afterEach(() => { vi.unstubAllGlobals(); replace.mockClear(); });
  it('claims the table and goes to the menu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { table: { id: '1', number: 7, label: 'Table 7' }, expiresAt: '2026-09-03T14:00:00.000Z' })));
    render(<ClaimTable token="abc" />);
    expect(screen.getByRole('status')).toHaveTextContent('Finding your table…');
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/menu'));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/guest/claim');
  });
  it('explains an expired code and can retry', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(401, { error: { code: 'TOKEN_EXPIRED', message: 'x' } })).mockResolvedValueOnce(json(200, { table: { id: '1', number: 7, label: 'Table 7' }, expiresAt: '2026-09-03T14:00:00.000Z' }));
    vi.stubGlobal('fetch', f);
    render(<ClaimTable token="abc" />);
    expect(await screen.findByText('This QR code has expired. Ask staff for a new one.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/menu'));
  });
  it('maps the other failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { error: { code: 'NOT_FOUND', message: 'x' } })));
    render(<ClaimTable token="abc" />);
    expect(await screen.findByText('This table is not available right now.')).toBeInTheDocument();
  });
});
```
Run → FAIL.

- [ ] **Step 4: Implement the claim screen and static pages**

`apps/web/components/claim-table.tsx`:
```tsx
'use client';
import { Button } from '@tabletap/ui';
import { ClaimResponseSchema } from '@tabletap/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, clientFetch } from '../lib/api';

const MESSAGE: Record<string, string> = {
  TOKEN_EXPIRED: 'This QR code has expired. Ask staff for a new one.',
  TOKEN_INVALID: 'This QR code is not valid.',
  NOT_FOUND: 'This table is not available right now.',
};
const UNREACHABLE = "Can't reach the server. Check the connection and try again.";

export function ClaimTable({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const claim = useCallback(async () => {
    setError(null);
    try {
      await clientFetch('/api/guest/claim', {
        schema: ClaimResponseSchema,
        init: { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) },
      });
      router.replace('/menu');
    } catch (err) {
      setError(err instanceof ApiError ? (MESSAGE[err.code] ?? UNREACHABLE) : UNREACHABLE);
    }
  }, [router, token]);
  useEffect(() => {
    void claim();
  }, [claim]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">Little Furnace</h1>
      {error === null ? (
        <p role="status" aria-live="polite" className="text-muted-foreground">Finding your table…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="alert">{error}</p>
          <Button type="button" onClick={() => void claim()}>Try again</Button>
        </div>
      )}
    </main>
  );
}
```
`apps/web/app/t/[token]/page.tsx`:
```tsx
import { ClaimTable } from '../../../components/claim-table';
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClaimTable token={token} />;
}
```
`apps/web/app/session-ended/page.tsx`:
```tsx
import Link from 'next/link';
export const metadata = { title: 'Session ended · TableTap' };
export default function SessionEndedPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">Your session has ended.</h1>
      <p>Scan the QR code on your table to start again.</p>
      <Link href="/" className="underline underline-offset-4">Back to the start</Link>
    </main>
  );
}
```
`apps/web/app/not-found.tsx`: same layout, heading "Nothing here.", text "The link may be old or mistyped.", link "Back to the start". `apps/web/app/layout.tsx`: `metadata.metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')`.

Run: web tests, lint, typecheck, `next build`, validate-tokens, prettier → PASS.
```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): guest claim screen, session-ended and not-found pages

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: `/menu` with dish cards, steppers, sticky basket bar and basket sheet

**REQUIRED SUB-SKILLS:** anthropic-skills:ui-styling (shadcn `sheet`, `textarea`, Tailwind 4), anthropic-skills:ui-ux-pro-max (audit: touch ≥ 44 px, loading/empty/error states, `aria-live`, keyboard in the sheet), anthropic-skills:frontend-design (printed-menu-card direction from the spec §3: paper background, display grotesque names, tabular prices, generous rhythm), superpowers:test-driven-development.

**Files:**
- Create: `packages/ui/src/components/sheet.tsx`, `textarea.tsx` (shadcn), `status-badge.tsx`, `status-badge.test.tsx`
- Modify: `packages/ui/src/index.ts`, `packages/ui/package.json`, `assets/design-tokens.json` (`status.ready` → `#2D853C`), `packages/ui/tokens.css` (regenerated), `packages/ui/src/tokens.test.ts`, `docs/brand-guidelines.md`, `design-system/tabletap/MASTER.md` (the ready hex where it appears), `docs/design/components.md` (badge section: ready is now filled)
- Create: `apps/web/app/menu/page.tsx`, `apps/web/components/menu/menu-screen.tsx`, `category-nav.tsx`, `dish-card.tsx`, `dish-card.test.tsx`, `quantity-stepper.tsx`, `quantity-stepper.test.tsx`, `apps/web/components/basket/basket-bar.tsx`, `basket-bar.test.tsx`, `basket-sheet.tsx`, `basket-sheet.test.tsx`, `apps/web/components/menu/menu-screen.test.tsx`

**Interfaces (produced):**
```tsx
// @tabletap/ui
export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose }  // shadcn
export { Textarea }
export function StatusBadge({ status }: { status: OrderStatus }): JSX.Element   // "Placed", "Cooking", … with bg-status-<status>
// apps/web
<MenuScreen menu={MenuResponse} tableId tableNumber />                 // client; owns useCart(tableId)
<DishCard item category quantity onAdd onSetQuantity currency />       // Add button → QuantityStepper when quantity > 0; unavailable → "Sold out today"
<QuantityStepper name value onChange max={20} />                      // buttons "Remove one <name>" / "Add one more <name>", value with aria-live
<BasketBar count totalCents currency onOpen />                          // region "Basket", "2 items · $26.00", button "View basket"
<BasketSheet open onOpenChange lines currency onSetQuantity onRemove /> // bottom sheet; empty: "Nothing in the basket yet."; link "Go to checkout"
```

- [ ] **Step 1: shadcn components and the ready token**

```bash
cd packages/ui && corepack pnpm dlx shadcn@latest add sheet textarea --yes && cd ../..
```
Fix imports to `../lib/utils` (as in M1), keep `@radix-ui/react-dialog` (added by the CLI) pinned exactly in `packages/ui/package.json` (edit the caret away if the CLI wrote one and run `corepack pnpm install`). Export both from `src/index.ts`. Set the sheet's bottom-side content classes so the panel gets `rounded-t-lg` and `max-h-[85dvh]`? — no arbitrary values: use `rounded-t-lg` and `max-h-dvh` plus an inner `overflow-y-auto`.

Token: in `assets/design-tokens.json` set `primitive.color.status.ready` to `#2D853C`; run `corepack pnpm tokens`; in `packages/ui/src/tokens.test.ts` add inside the guest-surface test: `expect(contrastRatio(sem('primary-foreground'), sem('status-ready'))).toBeGreaterThanOrEqual(4.5)` and `expect(contrastRatio(sem('foreground'), sem('status-cooking'))).toBeGreaterThanOrEqual(4.5)` (write these first and watch the ready one fail with the old hex). Update `docs/brand-guidelines.md` (Semantic table ready row and the Accessibility ratios: recompute and state them), `design-system/tabletap/MASTER.md`, and `docs/design/components.md` (status badge: every status filled; foreground is `--primary-foreground` except `cooking`, which uses `--foreground`). Run `corepack pnpm brand:sync && git diff --exit-code -- assets/design-tokens.json packages/ui/tokens.css` to confirm the sync is still a no-op (it only touches ember/olive/ink).

- [ ] **Step 2: Failing status badge test, then the component**

`packages/ui/src/components/status-badge.test.tsx` (add `"include": ["src/**/*.test.{ts,tsx}"]` and `environment: 'jsdom'` + `@vitejs/plugin-react` to `packages/ui/vitest.config.ts`; add dev deps `@testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 jsdom@30.0.1 @vitejs/plugin-react@6.1.1` to `packages/ui`; keep node-environment tests working by putting `// @vitest-environment jsdom` at the top of tsx tests instead of changing the global environment):
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';
describe('StatusBadge', () => {
  it('names the status in text and colours it by token class', () => {
    render(<StatusBadge status="cooking" />);
    const badge = screen.getByText('Cooking');
    expect(badge.className).toContain('bg-status-cooking');
    expect(badge.className).toContain('text-foreground');
  });
  it('uses the light foreground on dark statuses', () => {
    render(<StatusBadge status="placed" />);
    expect(screen.getByText('Placed').className).toContain('text-primary-foreground');
  });
});
```
`packages/ui/src/components/status-badge.tsx`:
```tsx
import type { OrderStatus } from '@tabletap/shared';
import { cn } from '../lib/utils';

const LABEL: Record<OrderStatus, string> = { draft: 'Draft', placed: 'Placed', paid: 'Paid', cooking: 'Cooking', ready: 'Ready', served: 'Served', cancelled: 'Cancelled' };
// Static class strings so Tailwind can see them; the foreground follows docs/design/components.md.
const STYLE: Record<OrderStatus, string> = {
  draft: 'bg-muted text-foreground',
  placed: 'bg-status-placed text-primary-foreground',
  paid: 'bg-status-paid text-primary-foreground',
  cooking: 'bg-status-cooking text-foreground',
  ready: 'bg-status-ready text-primary-foreground',
  served: 'bg-status-served text-primary-foreground',
  cancelled: 'bg-status-cancelled text-primary-foreground',
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cn('inline-flex h-7 items-center rounded-full px-3 text-sm font-semibold', STYLE[status], className)}>
      {LABEL[status]}
    </span>
  );
}
```
Add `@tabletap/shared` as a dependency of `packages/ui` (`workspace:*`). Export from `src/index.ts`. Run ui tests → PASS. Commit `feat(ui): sheet, textarea and status badge; darker ready status`.

- [ ] **Step 3: Failing web component tests**

`apps/web/components/menu/quantity-stepper.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './quantity-stepper';
describe('QuantityStepper', () => {
  it('labels both buttons with the dish name and announces the value', async () => {
    const onChange = vi.fn();
    render(<QuantityStepper name="Margherita Flatbread" value={2} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add one more Margherita Flatbread' }));
    expect(onChange).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole('button', { name: 'Remove one Margherita Flatbread' }));
    expect(onChange).toHaveBeenCalledWith(1);
    expect(screen.getByText('2')).toHaveAttribute('aria-live', 'polite');
  });
  it('disables plus at the maximum', () => {
    render(<QuantityStepper name="x" value={20} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Add one more x' })).toBeDisabled();
  });
});
```
`apps/web/components/menu/dish-card.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DishCard } from './dish-card';
const item = { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', categoryId: 'c', name: 'Margherita Flatbread', description: 'Tomato, fior di latte, basil.', priceCents: 1200, allergens: ['gluten', 'dairy'] as const, isAvailable: true, imageUrl: null, sortOrder: 0 };
describe('DishCard', () => {
  it('shows price, allergens and an Add button that becomes a stepper', async () => {
    const onAdd = vi.fn();
    const { rerender } = render(<DishCard item={{ ...item, allergens: [...item.allergens] }} category="Flatbreads" quantity={0} currency="USD" onAdd={onAdd} onSetQuantity={() => undefined} />);
    expect(screen.getByText('$12.00')).toBeInTheDocument();
    expect(screen.getByText('Contains gluten, dairy')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Margherita Flatbread' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add Margherita Flatbread' }));
    expect(onAdd).toHaveBeenCalled();
    rerender(<DishCard item={{ ...item, allergens: [...item.allergens] }} category="Flatbreads" quantity={1} currency="USD" onAdd={onAdd} onSetQuantity={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Add one more Margherita Flatbread' })).toBeInTheDocument();
  });
  it('marks a sold-out dish and offers no button', () => {
    render(<DishCard item={{ ...item, allergens: [], isAvailable: false }} category="Sides" quantity={0} currency="USD" onAdd={() => undefined} onSetQuantity={() => undefined} />);
    expect(screen.getByText('Sold out today')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```
`apps/web/components/basket/basket-bar.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BasketBar } from './basket-bar';
describe('BasketBar', () => {
  it('summarises the basket in a live region and offers the sheet', () => {
    render(<BasketBar count={2} totalCents={2600} currency="USD" onOpen={() => undefined} />);
    const region = screen.getByRole('region', { name: 'Basket' });
    expect(region).toHaveTextContent('2 items · $26.00');
    expect(screen.getByRole('button', { name: 'View basket' })).toBeInTheDocument();
  });
  it('uses the singular for one item', () => {
    render(<BasketBar count={1} totalCents={400} currency="USD" onOpen={() => undefined} />);
    expect(screen.getByRole('region', { name: 'Basket' })).toHaveTextContent('1 item · $4.00');
  });
});
```
`apps/web/components/basket/basket-sheet.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BasketSheet } from './basket-sheet';
const line = (name: string, quantity: number, cents: number, available = true) => ({ menuItemId: name, quantity, item: { id: name, categoryId: 'c', name, description: '', priceCents: cents, allergens: [], isAvailable: available, imageUrl: null, sortOrder: 0 }, lineTotalCents: available ? cents * quantity : 0, available });
describe('BasketSheet', () => {
  it('lists lines, removes one and links to checkout', async () => {
    const onRemove = vi.fn();
    render(<BasketSheet open onOpenChange={() => undefined} lines={[line('House Lemonade', 2, 400)]} currency="USD" onSetQuantity={() => undefined} onRemove={onRemove} />);
    expect(screen.getByRole('dialog', { name: 'Your basket' })).toBeInTheDocument();
    expect(screen.getByText('$8.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove House Lemonade' }));
    expect(onRemove).toHaveBeenCalledWith('House Lemonade');
    expect(screen.getByRole('link', { name: 'Go to checkout' })).toHaveAttribute('href', '/checkout');
  });
  it('shows the empty state and flags a sold-out line', () => {
    const { rerender } = render(<BasketSheet open onOpenChange={() => undefined} lines={[]} currency="USD" onSetQuantity={() => undefined} onRemove={() => undefined} />);
    expect(screen.getByText('Nothing in the basket yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to checkout' })).toBeNull();
    rerender(<BasketSheet open onOpenChange={() => undefined} lines={[line('Burrata & Peaches', 1, 1100, false)]} currency="USD" onSetQuantity={() => undefined} onRemove={() => undefined} />);
    expect(screen.getByText('Sold out today. Remove it to continue.')).toBeInTheDocument();
  });
});
```
`apps/web/components/menu/menu-screen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuResponse } from '@tabletap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MenuScreen } from './menu-screen';
const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = { restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' }, categories: [
  { id: U(2), name: 'Flatbreads', sortOrder: 0, items: [{ id: U(3), categoryId: U(2), name: 'Margherita Flatbread', description: '', priceCents: 1200, allergens: ['gluten'], isAvailable: true, imageUrl: null, sortOrder: 0 }] },
  { id: U(4), name: 'Drinks', sortOrder: 3, items: [{ id: U(5), categoryId: U(4), name: 'House Lemonade', description: '', priceCents: 400, allergens: [], isAvailable: true, imageUrl: null, sortOrder: 0 }] },
] };
describe('MenuScreen', () => {
  beforeEach(() => localStorage.clear());
  it('renders sections with navigation, builds a basket and opens the sheet', async () => {
    render(<MenuScreen menu={menu} tableId="t1" tableNumber={7} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Little Furnace');
    expect(screen.getByText('Table 7')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Drinks' })).toHaveAttribute('href', '#category-' + U(4));
    expect(screen.queryByRole('region', { name: 'Basket' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add Margherita Flatbread' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add one more Margherita Flatbread' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add House Lemonade' }));
    expect(screen.getByRole('region', { name: 'Basket' })).toHaveTextContent('3 items · $28.00');
    await userEvent.click(screen.getByRole('button', { name: 'View basket' }));
    expect(screen.getByRole('dialog', { name: 'Your basket' })).toBeInTheDocument();
  });
});
```
Run → FAIL (modules missing).

- [ ] **Step 4: Implement the components and the page**

`apps/web/components/menu/quantity-stepper.tsx`:
```tsx
'use client';
import { Button } from '@tabletap/ui';
import { MAX_QUANTITY } from '../../lib/cart';

export function QuantityStepper({ name, value, onChange, max = MAX_QUANTITY }: { name: string; value: number; onChange: (next: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-2" style={{ touchAction: 'manipulation' }}>
      <Button type="button" variant="secondary" size="icon" className="size-11" aria-label={`Remove one ${name}`} onClick={() => onChange(value - 1)}>−</Button>
      <span className="min-w-6 text-center font-semibold" aria-live="polite" aria-atomic="true">{value}</span>
      <Button type="button" variant="secondary" size="icon" className="size-11" aria-label={`Add one more ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</Button>
    </div>
  );
}
```
(If the shadcn button has no `size="icon"` variant with a 44 px box, use `className="size-11 p-0"` alone.)

`apps/web/components/menu/dish-card.tsx`:
```tsx
'use client';
import { Button, Plate, kindFromCategory } from '@tabletap/ui';
import type { MenuItemDto } from '@tabletap/shared';
import { formatCents } from '../../lib/money';
import { QuantityStepper } from './quantity-stepper';

export function DishCard({ item, category, quantity, currency, onAdd, onSetQuantity }: { item: MenuItemDto; category: string; quantity: number; currency: string; onAdd: () => void; onSetQuantity: (q: number) => void }) {
  const allergens = item.allergens.length > 0 ? `Contains ${item.allergens.join(', ')}` : 'No listed allergens';
  return (
    <article aria-disabled={!item.isAvailable || undefined} className={['flex gap-4 rounded-lg border border-border bg-card p-3', item.isAvailable ? '' : 'opacity-70'].join(' ')}>
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- M5 uploads arbitrary hosts; sizes are fixed by the card
        <img src={item.imageUrl} alt="" className="size-24 shrink-0 rounded-md object-cover" />
      ) : (
        <Plate name={item.name} kind={kindFromCategory(category)} size={96} className="size-24" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-display text-lg font-semibold leading-tight">{item.name}</h3>
        {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
        <p className="text-xs text-muted-foreground">{allergens}</p>
        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="font-semibold">{formatCents(item.priceCents, currency)}</span>
          {!item.isAvailable ? (
            <span className="text-sm font-semibold text-muted-foreground">Sold out today</span>
          ) : quantity === 0 ? (
            <Button type="button" className="h-11" aria-label={`Add ${item.name}`} onClick={onAdd}>Add</Button>
          ) : (
            <QuantityStepper name={item.name} value={quantity} onChange={onSetQuantity} />
          )}
        </div>
      </div>
    </article>
  );
}
```
(`eslint-disable` for `no-img-element` is the only permitted one; explain it in the comment as shown. If the lint config lacks the Next plugin rule, drop the comment.)

`apps/web/components/menu/category-nav.tsx`: `<nav aria-label="Menu sections" className="sticky top-0 z-10 -mx-4 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur"><ul className="flex gap-2">{categories.map(c => <li key={c.id}><a href={`#category-${c.id}`} className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-semibold">{c.name}</a></li>)}</ul></nav>`.

`apps/web/components/basket/basket-bar.tsx`:
```tsx
'use client';
import { Button } from '@tabletap/ui';
import { formatCents } from '../../lib/money';
export function BasketBar({ count, totalCents, currency, onOpen }: { count: number; totalCents: number; currency: string; onOpen: () => void }) {
  return (
    <section role="region" aria-label="Basket" aria-live="polite" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-4">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
        <span className="font-semibold">{`${count} ${count === 1 ? 'item' : 'items'} · ${formatCents(totalCents, currency)}`}</span>
        <Button type="button" className="h-11" onClick={onOpen}>View basket</Button>
      </div>
    </section>
  );
}
```
`apps/web/components/basket/basket-sheet.tsx`: `Sheet` with `side="bottom"`; `SheetContent` `aria-describedby` to a `SheetDescription` "Anything else?"; `SheetTitle` "Your basket"; lines: name, `QuantityStepper` (or "Sold out today. Remove it to continue." for unavailable/missing with only the Remove button), line total, `Button variant="ghost" aria-label={`Remove ${name}`}`; footer: subtotal, `Link href="/checkout"` styled as a primary button "Go to checkout" (only when at least one available line), `SheetClose` "Keep browsing"; empty state paragraph "Nothing in the basket yet." Missing item (`line.item === null`) shows "No longer on the menu" with Remove.

`apps/web/components/menu/menu-screen.tsx`:
```tsx
'use client';
import type { MenuResponse } from '@tabletap/shared';
import { useState } from 'react';
import { cartLines, cartTotalCents, countItems, useCart } from '../../lib/cart';
import { BasketBar } from '../basket/basket-bar';
import { BasketSheet } from '../basket/basket-sheet';
import { CategoryNav } from './category-nav';
import { DishCard } from './dish-card';

export function MenuScreen({ menu, tableId, tableNumber }: { menu: MenuResponse; tableId: string; tableNumber: number }) {
  const { cart, add, setQuantity, remove } = useCart(tableId);
  const [open, setOpen] = useState(false);
  const count = countItems(cart);
  const currency = menu.restaurant.currency;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-28 pt-6">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-3xl font-semibold">{menu.restaurant.name}</h1>
        <span className="text-muted-foreground">{`Table ${tableNumber}`}</span>
      </header>
      <CategoryNav categories={menu.categories} />
      {menu.categories.map((category) => (
        <section key={category.id} id={`category-${category.id}`} aria-labelledby={`heading-${category.id}`} className="flex flex-col gap-3 scroll-mt-16">
          <h2 id={`heading-${category.id}`} className="font-display text-2xl font-semibold">{category.name}</h2>
          {category.items.map((item) => (
            <DishCard key={item.id} item={item} category={category.name} currency={currency} quantity={cart.items[item.id] ?? 0} onAdd={() => add(item.id)} onSetQuantity={(q) => setQuantity(item.id, q)} />
          ))}
        </section>
      ))}
      {count > 0 ? <BasketBar count={count} totalCents={cartTotalCents(cart, menu)} currency={currency} onOpen={() => setOpen(true)} /> : null}
      <BasketSheet open={open} onOpenChange={setOpen} lines={cartLines(cart, menu)} currency={currency} onSetQuantity={setQuantity} onRemove={remove} />
    </main>
  );
}
```
`apps/web/app/menu/page.tsx`:
```tsx
import { MeResponseSchema, MenuResponseSchema } from '@tabletap/shared';
import { redirect } from 'next/navigation';
import { MenuScreen } from '../../components/menu/menu-screen';
import { ApiError, apiFetch } from '../../lib/api';
import { guestCookie } from '../../lib/guest-cookie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Menu · Little Furnace' };

export default async function MenuPage() {
  const cookie = await guestCookie();
  if (!cookie) redirect('/session-ended');
  try {
    const [me, menu] = await Promise.all([
      apiFetch('/api/me', { schema: MeResponseSchema, cookie }),
      apiFetch('/api/menu', { schema: MenuResponseSchema, cookie }),
    ]);
    if (me.principal.kind !== 'guest') redirect('/session-ended');
    return <MenuScreen menu={menu} tableId={me.principal.tableId} tableNumber={me.principal.tableNumber} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/session-ended');
    throw err;
  }
}
```
(`redirect()` throws; keep it outside the `try` where possible — Next's redirect error must not be swallowed: rethrow anything that is not an `ApiError`.) Add `apps/web/app/menu/loading.tsx` with a skeleton: heading placeholder and six card-shaped `div`s with `min-h-32 animate-none rounded-lg bg-muted` (no motion in M2).

Run: web tests, lint, typecheck, `next build`, validate-tokens, prettier → PASS. Manual check if a database is available; otherwise rely on Task 10's e2e.
```bash
git add apps/web packages/ui pnpm-lock.yaml
git commit -m "feat(web): guest menu with basket bar and sheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `/checkout` and `/orders/[id]`

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; anthropic-skills:ui-styling; anthropic-skills:ui-ux-pro-max (error placement near the problem, live status).

**Files:**
- Create: `apps/web/app/checkout/page.tsx`, `apps/web/components/checkout/checkout-screen.tsx`, `checkout-screen.test.tsx`, `apps/web/app/orders/[id]/page.tsx`, `apps/web/components/order/order-screen.tsx`, `order-screen.test.tsx`, `apps/web/components/order/elapsed-since.tsx`, `elapsed-since.test.tsx`

**Interfaces (produced):**
```tsx
<CheckoutScreen menu tableId />                 // client; posts /api/orders with Idempotency-Key from sessionStorage['tt-idem:<tableId>']
<OrderScreen order currency />                  // "Order #42 sent to the kitchen.", StatusBadge, lines, note, <ElapsedSince iso />
<ElapsedSince iso intervalMs=30000 />           // aria-live="polite", re-renders on the interval
```

- [ ] **Step 1: Failing tests**

`apps/web/components/order/elapsed-since.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElapsedSince } from './elapsed-since';
describe('ElapsedSince', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-03T10:02:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('shows and updates the elapsed time in a live region', () => {
    render(<ElapsedSince iso="2026-09-03T10:00:00.000Z" intervalMs={1000} />);
    expect(screen.getByRole('status')).toHaveTextContent('Placed 2 min ago');
    vi.advanceTimersByTime(60_000);
    expect(screen.getByRole('status')).toHaveTextContent('Placed 3 min ago');
  });
});
```
`apps/web/components/order/order-screen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderScreen } from './order-screen';
const order = { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', number: 42, status: 'placed' as const, tableId: 't', tableNumber: 7, items: [{ id: 'a', menuItemId: 'm', name: 'Margherita Flatbread', unitPriceCents: 1200, quantity: 2, lineTotalCents: 2400 }], subtotalCents: 2400, totalCents: 2400, note: 'No basil', placedAt: '2026-09-03T10:00:00.000Z', createdAt: '2026-09-03T10:00:00.000Z' };
describe('OrderScreen', () => {
  it('confirms in the brand voice with the number, lines, note and status', () => {
    render(<OrderScreen order={order} currency="USD" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order #42 sent to the kitchen.');
    expect(screen.getByText('Table 7')).toBeInTheDocument();
    expect(screen.getByText('Placed')).toBeInTheDocument();
    expect(screen.getByText('2 × Margherita Flatbread')).toBeInTheDocument();
    expect(screen.getByText('$24.00')).toBeInTheDocument();
    expect(screen.getByText('No basil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to menu' })).toHaveAttribute('href', '/menu');
  });
});
```
`apps/web/components/checkout/checkout-screen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuResponse } from '@tabletap/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import { CheckoutScreen } from './checkout-screen';
import { addItem, cartStorageKey } from '../../lib/cart';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = { restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' }, categories: [{ id: U(2), name: 'Drinks', sortOrder: 0, items: [
  { id: U(3), categoryId: U(2), name: 'House Lemonade', description: '', priceCents: 400, allergens: [], isAvailable: true, imageUrl: null, sortOrder: 0 },
  { id: U(4), categoryId: U(2), name: 'Cold Brew', description: '', priceCents: 450, allergens: [], isAvailable: true, imageUrl: null, sortOrder: 1 },
] }] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const orderBody = { order: { id: U(9), number: 42, status: 'placed', tableId: 't1', tableNumber: 7, items: [], subtotalCents: 800, totalCents: 800, note: null, placedAt: '2026-09-03T10:00:00.000Z', createdAt: '2026-09-03T10:00:00.000Z' } };

describe('CheckoutScreen', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); replace.mockClear(); localStorage.setItem(cartStorageKey('t1'), JSON.stringify(addItem(addItem({ items: {} }, U(3), 2), U(4)))); });
  afterEach(() => vi.unstubAllGlobals());
  it('posts the basket with an idempotency key and a note, then clears and navigates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(201, orderBody)));
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    expect(screen.getByText('2 × House Lemonade')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Note for the kitchen'), 'No ice');
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/orders/${U(9)}`));
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/orders');
    const headers = new Headers(init?.headers);
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(init?.body))).toEqual({ items: [{ menuItemId: U(3), quantity: 2 }, { menuItemId: U(4), quantity: 1 }], note: 'No ice' });
    expect(localStorage.getItem(cartStorageKey('t1'))).toBeNull();
  });
  it('reuses the same idempotency key on retry and marks sold-out lines', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(409, { error: { code: 'ITEM_UNAVAILABLE', message: 'x', details: { unavailable: [{ menuItemId: U(4), name: 'Cold Brew' }] } } })).mockResolvedValueOnce(json(201, orderBody));
    vi.stubGlobal('fetch', f);
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Sold out today. Remove it to continue.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Cold Brew' }));
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    const keys = f.mock.calls.map((c) => new Headers((c[1] as RequestInit).headers).get('idempotency-key'));
    expect(keys[0]).toBe(keys[1]);
  });
  it('sends an ended session back to the start and explains other failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } })));
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/session-ended'));
  });
  it('redirects to the menu when the basket is empty', () => {
    localStorage.clear();
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    expect(replace).toHaveBeenCalledWith('/menu');
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

`apps/web/components/order/elapsed-since.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { formatElapsed } from '../../lib/elapsed';
export function ElapsedSince({ iso, intervalMs = 30_000 }: { iso: string; intervalMs?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return <p role="status" aria-live="polite" className="text-muted-foreground">{`Placed ${formatElapsed(iso, now)}`}</p>;
}
```
`apps/web/components/order/order-screen.tsx`: `<main>` with `<h1>` "Order #{number} sent to the kitchen.", `<p>Table {tableNumber}</p>`, `<StatusBadge status={order.status} />`, `<ElapsedSince iso={order.placedAt ?? order.createdAt} />`, `<ul>` lines "{quantity} × {name}" with `formatCents(lineTotalCents)`, total row, note under "Note for the kitchen" when present, `<Link href="/menu">Back to menu</Link>`.

`apps/web/components/checkout/checkout-screen.tsx`: reads `useCart(tableId)`; `useEffect` → if `countItems(cart) === 0` `router.replace('/menu')`; lines via `cartLines(cart, menu)`; unavailable/missing lines and lines flagged by the last `ITEM_UNAVAILABLE` response show "Sold out today. Remove it to continue." with a `Remove <name>` button; note `Textarea` with `<Label htmlFor="note">Note for the kitchen</Label>`, `maxLength={280}`, counter "12 / 280"; `Total` row using `cartTotalCents`; idempotency key: `sessionStorage.getItem(`tt-idem:${tableId}`) ?? crypto.randomUUID()` stored on first use; submit: `clientFetch('/api/orders', { schema: OrderResponseSchema, init: { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ items: toOrderItems(cart, menu), ...(note.trim() ? { note: note.trim() } : {}) }) } })`; on success `clear()`, `sessionStorage.removeItem(key)`, `router.replace(`/orders/${order.id}`)`; `ApiError` mapping: 401 → `router.replace('/session-ended')`; `ITEM_UNAVAILABLE` → mark ids from `details.unavailable` and message "Some items are sold out today. Remove them to continue."; `VALIDATION_FAILED` → "Something in the basket is not right. Go back to the menu."; 429 → "Too many orders in a minute. Wait a moment and try again."; else "Can't reach the server. Check the connection and try again." Messages render in a `role="status"` `aria-live="polite"` paragraph next to the button; the button shows "Sending to the kitchen…" with `disabled` + `aria-busy` while submitting; disabled when no available lines.

`apps/web/app/checkout/page.tsx`: same server shape as `/menu` (cookie → `/api/me` + `/api/menu`), renders `<CheckoutScreen menu tableId />`; `dynamic = 'force-dynamic'`.
`apps/web/app/orders/[id]/page.tsx`:
```tsx
import { OrderResponseSchema } from '@tabletap/shared';
import { notFound, redirect } from 'next/navigation';
import { OrderScreen } from '../../../components/order/order-screen';
import { ApiError, apiFetch } from '../../../lib/api';
import { guestCookie } from '../../../lib/guest-cookie';
export const dynamic = 'force-dynamic';
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = await guestCookie();
  if (!cookie) redirect('/session-ended');
  let order;
  try {
    ({ order } = await apiFetch(`/api/orders/${id}`, { schema: OrderResponseSchema, cookie }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/session-ended');
    if (err instanceof ApiError && (err.status === 403 || err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  return <OrderScreen order={order} currency="USD" />;
}
```
(Currency: the order DTO carries no currency; the single restaurant is USD in M2 — note it in code; M5 can add currency to the DTO.)

Run: web tests, lint, typecheck, `next build`, validate-tokens, prettier → PASS.
```bash
git add apps/web
git commit -m "feat(web): checkout with idempotent order placement and the order page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: Landing with Demo mode and one-click staff sign-in

**REQUIRED SUB-SKILLS:** anthropic-skills:frontend-design (the landing is the recruiter's first screen: restrained, typographic, the plate illustrations as the only decoration), anthropic-skills:ui-styling, anthropic-skills:ui-ux-pro-max (landmarks, heading order, link names), superpowers:test-driven-development (landing content and demo sign-in logic).

**Files:**
- Create: `apps/web/lib/demo-links.ts`, `apps/web/components/landing/landing-content.tsx`, `landing-content.test.tsx`, `apps/web/app/page.tsx`
- Modify: `apps/web/next.config.ts` (remove the `/` redirect), `apps/web/app/login/page.tsx`, `apps/web/components/login-form.tsx`, `login-form.test.tsx`, `apps/web/package.json` (`qrcode`, `@types/qrcode`)

**Interfaces (produced):**
```ts
export async function fetchDemoLinks(): Promise<DemoLinksResponse | null>   // server; null when demo mode is off or the API is unreachable
<LandingContent links={DemoLinksResponse | null} qrSvg={string | null} />
LoginForm props += { demo?: { email: string; password: string; name: string } }   // signs in once on mount
```

- [ ] **Step 1: Dependencies and the demo links helper**

```bash
corepack pnpm --filter @tabletap/web add --save-exact qrcode@1.5.4
corepack pnpm --filter @tabletap/web add --save-dev --save-exact @types/qrcode@1
```
`apps/web/lib/demo-links.ts`:
```ts
import { DemoLinksResponseSchema, type DemoLinksResponse } from '@tabletap/shared';
import { ApiError, apiFetch } from './api';

/** Demo mode is an API flag; the landing degrades to a plain product page without it. */
export async function fetchDemoLinks(): Promise<DemoLinksResponse | null> {
  try {
    return await apiFetch('/api/demo/links', { schema: DemoLinksResponseSchema });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    console.warn('demo links unavailable:', err instanceof Error ? err.message : err);
    return null;
  }
}
```

- [ ] **Step 2: Failing landing test**

`apps/web/components/landing/landing-content.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LandingContent } from './landing-content';
const links = { guest: { tableNumber: 7, url: 'http://localhost:3000/t/abc.def.ghi' }, staff: [{ role: 'kitchen' as const, email: 'kitchen@littlefurnace.demo', name: 'Theo Baptiste', password: 'tabletap-demo' }, { role: 'admin' as const, email: 'admin@littlefurnace.demo', name: 'Mara Quinn', password: 'tabletap-demo' }], resetsEveryMinutes: 60 };
describe('LandingContent', () => {
  it('offers the three demo entry points and the QR code', () => {
    render(<LandingContent links={links} qrSvg="<svg role='presentation'></svg>" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TableTap');
    expect(screen.getByRole('link', { name: 'Table 7 as a guest' })).toHaveAttribute('href', '/t/abc.def.ghi');
    expect(screen.getByRole('link', { name: 'Open the kitchen display' })).toHaveAttribute('href', '/login?demo=kitchen');
    expect(screen.getByRole('link', { name: 'Open the admin' })).toHaveAttribute('href', '/login?demo=admin');
    expect(screen.getByText('QR code for table 7')).toBeInTheDocument();
    expect(screen.getByText('Demo data resets every 60 minutes.')).toBeInTheDocument();
  });
  it('degrades to a product page without demo mode', () => {
    render(<LandingContent links={null} qrSvg={null} />);
    expect(screen.queryByRole('link', { name: 'Table 7 as a guest' })).toBeNull();
    expect(screen.getByText('Scan the QR code on your table to order.')).toBeInTheDocument();
  });
});
```
Run → FAIL.

- [ ] **Step 3: Implement the landing**

`apps/web/components/landing/landing-content.tsx` (presentational; no `'use client'`):
- `<header>` with `<h1 className="font-display text-4xl font-semibold">TableTap</h1>` and the one-liner "Order from your table. The kitchen sees it the moment you tap."
- `<main>` with three `Card`s in a responsive grid (`grid gap-4 sm:grid-cols-3`):
  - Guest: title "Guest", text "Scan the code with your phone, or open table {n} in this browser." When `qrSvg`: `<div aria-hidden className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />` and `<p className="sr-only">QR code for table {n}</p>`; `Link` styled as the primary button (`buttonVariants()` from `@tabletap/ui`, `h-11`) "Table {n} as a guest" with `href={new URL(links.guest.url).pathname}`.
  - Kitchen: "Kitchen", text "Tickets appear the moment a guest orders. Arrives in the next milestone; today it signs you in as kitchen staff.", `Link` "Open the kitchen display" → `/login?demo=kitchen`.
  - Admin: "Admin", text "Menu, tables, QR codes and a dashboard. Arrives later; today it signs you in as an admin.", `Link` "Open the admin" → `/login?demo=admin`.
  - Without `links`: the guest card says "Scan the QR code on your table to order." and the staff cards keep their text without links.
- "How it works" `<section aria-labelledby>` with an ordered list: "Scan the QR code on the table.", "Pick dishes and add a note.", "Place the order.", "Follow its status on your phone."
- "Built with" list: Next.js 16, Fastify 5, Postgres 17 + Drizzle, better-auth, Tailwind 4, Playwright, Docker Compose.
- Notice: when `links?.resetsEveryMinutes` → "Demo data resets every {n} minutes."; when demo on but null interval → "Demo data is not reset automatically."
- `<footer>`: "Source, ADRs and the case study live in the repository README."
Decoration: three small `Plate` illustrations (flatbread, bowl, drink) in the header row on `sm+` screens (`aria-hidden`).

`apps/web/app/page.tsx`:
```tsx
import QRCode from 'qrcode';
import { LandingContent } from '../components/landing/landing-content';
import { fetchDemoLinks } from '../lib/demo-links';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'TableTap — QR ordering with a live kitchen display' };
export default async function LandingPage() {
  const links = await fetchDemoLinks();
  const qrSvg = links ? await QRCode.toString(links.guest.url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null;
  return <LandingContent links={links} qrSvg={qrSvg} />;
}
```
`apps/web/next.config.ts`: delete the `redirects()` block.

- [ ] **Step 4: Failing demo sign-in tests, then the login changes**

Append to `apps/web/components/login-form.test.tsx`:
```tsx
it('signs in once with the demo credentials and shows who it is signing in as', async () => {
  const email = vi.fn(async () => ({ error: null }));
  const client = makeClient({ signIn: { email } });
  render(<LoginForm client={client} demo={{ email: 'kitchen@littlefurnace.demo', password: 'tabletap-demo', name: 'Theo Baptiste' }} />);
  expect(screen.getByRole('status')).toHaveTextContent('Signing in as Theo Baptiste…');
  await waitFor(() => expect(email).toHaveBeenCalledWith({ email: 'kitchen@littlefurnace.demo', password: 'tabletap-demo' }));
  expect(email).toHaveBeenCalledTimes(1);
});
it('falls back to the form when the demo sign-in fails', async () => {
  const client = makeClient({ signIn: { email: vi.fn(async () => ({ error: { status: 401 } })) } });
  render(<LoginForm client={client} demo={{ email: 'x@y.z', password: 'p', name: 'X' }} />);
  expect(await screen.findByText("That email and password don't match.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
});
```
`LoginForm`: new optional prop `demo`; `const attempted = useRef(false)`; `useEffect(() => { if (!demo || attempted.current || session.isPending || session.data) return; attempted.current = true; setStatus({ kind: 'submitting' }); void client.signIn.email(demo).then((r) => { if (r.error) { setStatus({ kind: 'error', message: messageFor(r.error.status) }); } else { setStatus({ kind: 'idle' }); session.refetch?.(); } }).catch(() => setStatus({ kind: 'error', message: UNREACHABLE })); }, [client, demo, session])`; while `demo && status.kind === 'submitting'` render `<p role="status" aria-live="polite">Signing in as {demo.name}…</p>` instead of the form (the `Card` stays). Extract `messageFor(status?: number)` from the existing submit handler and reuse it.

`apps/web/app/login/page.tsx`:
```tsx
import { StaffRoleSchema } from '@tabletap/shared';
import { LoginForm } from '../../components/login-form';
import { fetchDemoLinks } from '../../lib/demo-links';
export const dynamic = 'force-dynamic';
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const role = StaffRoleSchema.safeParse(demo);
  const links = role.success ? await fetchDemoLinks() : null;
  const account = links?.staff.find((s) => s.role === role.data) ?? null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">TableTap</h1>
      <LoginForm demo={account ? { email: account.email, password: account.password, name: account.name } : undefined} />
    </main>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: web tests, lint, typecheck, `next build`, validate-tokens, prettier → PASS. Check with `curl -s http://localhost:3000/ | grep -c "Table 7 as a guest"` while `pnpm dev` runs for api and web if a database exists; otherwise the landing degrades (no links) and Task 10's e2e is the proof.
```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): demo landing with QR code and one-click staff sign-in

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Lighthouse audit script, guest e2e, CI

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development (the e2e spec first; RED locally without a stack).

**Files:**
- Create: `scripts/lighthouse-audit.mjs`, `e2e/guest-order.spec.ts`
- Modify: root `package.json` (devDependencies `lighthouse@13.4.1`, `chrome-launcher@1.2.1`; script `"lighthouse": "node scripts/lighthouse-audit.mjs"`), `.github/workflows/ci.yml`, `.prettierignore` (`docs/lighthouse-results.json`), `.gitignore` (nothing new)

- [ ] **Step 1: The guest e2e (RED without a stack)**

`e2e/guest-order.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('a guest orders from the landing page QR link', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Table 7 as a guest' }).click();
  await page.waitForURL('**/menu');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Little Furnace');
  await expect(page.getByText('Table 7')).toBeVisible();
  await page.getByRole('button', { name: 'Add Margherita Flatbread' }).click();
  await page.getByRole('button', { name: 'Add one more Margherita Flatbread' }).click();
  await page.getByRole('button', { name: 'Add House Lemonade' }).click();
  await expect(page.getByRole('region', { name: 'Basket' })).toContainText('3 items · $28.00');
  await page.getByRole('button', { name: 'View basket' }).click();
  await page.getByRole('link', { name: 'Go to checkout' }).click();
  await page.waitForURL('**/checkout');
  await page.getByLabel('Note for the kitchen').fill('No basil');
  await page.getByRole('button', { name: 'Place order' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Order #\d+ sent to the kitchen\.$/);
  await expect(page.getByText('2 × Margherita Flatbread')).toBeVisible();
  await expect(page.getByText('1 × House Lemonade')).toBeVisible();
  await expect(page.getByText('No basil')).toBeVisible();
  await expect(page.getByText('Placed')).toBeVisible();
});

test('an expired QR code explains itself', async ({ page }) => {
  await page.goto('/t/not-a-token');
  await expect(page.getByRole('alert')).toHaveText('This QR code is not valid.');
});
```
Run `corepack pnpm e2e` with nothing running → FAIL (connection refused). Record it.

- [ ] **Step 2: The Lighthouse script**

```bash
corepack pnpm add -w --save-dev --save-exact lighthouse@13.4.1 chrome-launcher@1.2.1
```
`scripts/lighthouse-audit.mjs`:
```js
#!/usr/bin/env node
/**
 * Lighthouse over the guest surface. Needs the stack running (docker compose up, or pnpm dev for api+web
 * with a database). Claims table 7 through the web origin so /menu is audited as a real guest.
 * Usage: node scripts/lighthouse-audit.mjs [--base http://localhost:3000] [--min-a11y 95] [--out docs/lighthouse-results.json]
 */
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import fs from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : dflt; };
const BASE = opt('base', 'http://localhost:3000');
const MIN_A11Y = Number(opt('min-a11y', '95'));
const OUT = opt('out', 'docs/lighthouse-results.json');

const links = await fetch(`${BASE}/api/demo/links`).then((r) => { if (!r.ok) throw new Error(`demo links: ${r.status}`); return r.json(); });
const token = new URL(links.guest.url).pathname.split('/t/')[1];
const claim = await fetch(`${BASE}/api/guest/claim`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
if (!claim.ok) throw new Error(`claim: ${claim.status}`);
const cookie = claim.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('claim returned no cookie');

const PAGES = [
  { slug: 'landing', path: '/', headers: undefined },
  { slug: 'menu', path: '/menu', headers: { Cookie: cookie } },
];
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
const results = [];
try {
  for (const page of PAGES) {
    const { lhr } = await lighthouse(`${BASE}${page.path}`, {
      port: chrome.port, output: 'json', logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      extraHeaders: page.headers,
    });
    const score = (c) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
    results.push({ slug: page.slug, url: lhr.finalDisplayedUrl, performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), lcpMs: Math.round(lhr.audits['largest-contentful-paint']?.numericValue ?? 0), cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? 0 });
  }
} finally {
  await chrome.kill();
}
console.table(results);
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + '\n');
const failing = results.filter((r) => r.accessibility < MIN_A11Y);
if (failing.length > 0) { console.error(`accessibility below ${MIN_A11Y}: ${failing.map((f) => `${f.slug}=${f.accessibility}`).join(', ')}`); process.exit(1); }
```
Root `package.json` scripts: `"lighthouse": "node scripts/lighthouse-audit.mjs"`. `.prettierignore`: add `docs/lighthouse-results.json`. Sanity check without a stack: `node scripts/lighthouse-audit.mjs --base http://localhost:9` must fail fast with `demo links:`/fetch error, not a syntax error.

- [ ] **Step 3: CI**

`.github/workflows/ci.yml` `compose-e2e`, after `- run: pnpm e2e`: `- run: pnpm lighthouse --base http://localhost:3000 --min-a11y 95` and `- if: always()` `uses: actions/upload-artifact@v4` with `name: lighthouse-results`, `path: docs/lighthouse-results.json`. Parse the YAML (`node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"`).

- [ ] **Step 4: Commit**

Run: `corepack pnpm exec playwright test --list` shows four tests; prettier check; lint.
```bash
git add scripts/lighthouse-audit.mjs e2e package.json pnpm-lock.yaml .github .prettierignore
git commit -m "ci: guest order e2e and lighthouse accessibility gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: ADRs 0006–0007, README, backlog, spec/plan status and the quality gate

**REQUIRED SUB-SKILLS:** superpowers:requesting-code-review (whole branch, run by the controller), superpowers:finishing-a-development-branch (controller: merge into `main`, delete the branch).

**Files:**
- Create: `docs/adr/0006-guest-reads-and-orders.md`, `docs/adr/0007-illustrated-menu.md`
- Modify: `README.md`, `docs/backlog.md`, `docs/superpowers/specs/2026-09-03-m2-guest-flow-design.md` (status line), this plan (checkboxes)

- [ ] **Step 1: ADRs** (`# ADR NNNN: <title>`, `Date: 2026-09-03`, `Status: accepted`, Context / Decision / Consequences):
- **0006 Guest reads, basket and order placement.** Context: guest pages must render fast on a phone; the API owns sessions and prices; the demo resets hourly. Decision: server components forward the `tt_guest` cookie to the API for reads; the basket is client-side per table; `POST /api/orders` creates the order as `placed` in one transaction with database prices and an `Idempotency-Key`; rate limit per guest session via the rate-limit plugin's `preHandler` hook. Rejected: Server Actions (no guest cookie on the Next origin), server-side draft orders. Consequences: `draft` unused; the guest never sees a price it did not get from the server; a reset logs guests out (`/session-ended`).
- **0007 Illustrated menu instead of photography.** Context: no photo assets, no image-generation keys, a portfolio audience; performance and honesty. Decision: deterministic SVG plates from category kind + dish name, brand tokens only; `image_url` overrides when present. Consequences: zero image requests; consistent look; M5 uploads win per dish; the planner is unit-tested for determinism and bounds.

- [ ] **Step 2: README** — add a "Try the demo" section (landing → QR/table 7 → basket → order; staff buttons), the new scripts (`lighthouse`), the env variables (`DEMO_MODE`, `DEMO_RESET_INTERVAL_MINUTES`), the guest URL list, the Lighthouse note (gate in CI; results in `docs/lighthouse-results.json` once CI runs), the M2 line in the milestone list. Keep the honesty note about Docker/CI.

- [ ] **Step 3: Backlog** — mark as done (delete the bullets) the M1 items now addressed: indexes, `NEXT_PUBLIC_APP_URL`, `--status-ready`, light-surface timer assertions if added; append `## Deferred from M2` with anything the tasks reported (at least: currency on `OrderDto` for M5; basket lines for items renamed after a reset; landing performance score if below 90).

- [ ] **Step 4: Status and gate**

Spec status line → `Status: implemented on branch feat/m2-guest-flow (2026-09-03); merge pending final review`. Tick every checkbox in this plan.
```bash
corepack pnpm lint && corepack pnpm exec prettier --check . && corepack pnpm typecheck && corepack pnpm test && corepack pnpm validate-tokens && corepack pnpm tokens && git diff --exit-code -- packages/ui/tokens.css && corepack pnpm brand:sync && git diff --exit-code -- assets/design-tokens.json packages/ui/tokens.css && corepack pnpm build
```
All green; e2e and Lighthouse stay CI-only without Docker (say so in the report).
```bash
git add docs README.md
git commit -m "docs: ADRs 0006-0007, demo walkthrough and M2 status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 5: Controller** — final whole-branch review, one fix wave if needed, then `superpowers:finishing-a-development-branch` (merge into `main`, delete branch and worktree), then set the spec status to merged.

---

## Parallel tracks

After Task 6 is merged into the feature branch, Tasks 7–8 (guest pages) and Task 9 (landing + login) touch disjoint files except `apps/web/package.json`/`pnpm-lock.yaml` (Task 9 adds `qrcode`) and `apps/web/next.config.ts` (Task 9 removes the redirect). The controller may run Task 9 in a second worktree branched from `feat/m2-guest-flow` (`superpowers:dispatching-parallel-agents`) and merge it back before Task 10; resolve the lockfile by re-running `corepack pnpm install` after the merge. Sequential execution is equally valid.

## Self-review notes (already applied)

- Spec coverage: §3 → T1 (planner), T7 (cards); §4.1 → T2; §4.2 → T1; §4.3 → T3, T4, T5; §4.4–4.5 → T5; §5 → T6, T7, T8, T9; §6 → T7 (a11y), T10 (Lighthouse); §7 → every task + T10; §8 → parallel tracks note, T11; §9 → T11.
- Names used across tasks: `ApiError`, `apiFetch`, `clientFetch`, `guestCookie` (T6) ← T7, T8, T9; `useCart`, `cartLines`, `cartTotalCents`, `toOrderItems`, `countItems`, `cartStorageKey` (T6) ← T7, T8; `formatCents` (T6) ← T7, T8; `formatElapsed` (T6) ← T8; `Plate`, `kindFromCategory` (T1) ← T7, T9; `StatusBadge`, `Sheet*`, `Textarea` (T7) ← T8; `MenuResponseSchema`, `OrderResponseSchema`, `MeResponseSchema`, `DemoLinksResponseSchema`, `IDEMPOTENCY_KEY_HEADER` (T1/M1) ← T3–T9; `restaurantId` on the guest principal (T2) ← T3, T4; `requireAction`, `requireAuthenticated` (M1) ← T3, T4; `DEMO_STAFF`, `DEMO_RESTAURANT_SLUG` re-export (T5) ← T5 route; rate-limit `hook: 'preHandler'` (T4) ← T5 (public route limits still keyed by ip).
- Copy strings are identical between components and tests: "Add {name}", "Add one more {name}", "Remove one {name}", "Remove {name}", "View basket", "Your basket", "Anything else?", "Go to checkout", "Keep browsing", "Nothing in the basket yet.", "Sold out today", "Sold out today. Remove it to continue.", "Note for the kitchen", "Place order", "Sending to the kitchen…", "Order #N sent to the kitchen.", "Placed X min ago", "Back to menu", "Finding your table…", "Try again", "Table 7 as a guest", "Open the kitchen display", "Open the admin", "Signing in as {name}…".
