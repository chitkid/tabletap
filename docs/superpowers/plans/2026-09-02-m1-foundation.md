# M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation of TableTap (QR table ordering + real-time kitchen display): monorepo, schema and migrations, staff auth and guest table sessions with RBAC, shared contracts, brand and design tokens for three surfaces, seed, Docker Compose, CI and `/health`.

**Architecture:** pnpm + Turborepo monorepo. `apps/api` is a Fastify 5 server with Drizzle (Postgres 17) and better-auth for staff, plus a custom signed guest session bound to a table via a JWT carried in the QR code; every request resolves to a `Principal` (`staff | guest | anonymous`) and route guards consult a data-driven RBAC matrix in `packages/shared`. `apps/web` is a Next.js 16 App Router app that reaches the API through a same-origin `/api/*` rewrite so cookies stay first-party. Tests run on PGlite (embedded Postgres) so `pnpm test` never needs Docker; Docker Compose and one Playwright smoke prove the real stack.

**Tech Stack:** Node 24, pnpm 11 (corepack), Turborepo 2, TypeScript 5.9 (strict), Fastify 5, `fastify-type-provider-zod` 7, Zod 4, Drizzle ORM 0.45 + drizzle-kit 0.31, `postgres` driver, `@electric-sql/pglite` 0.5, better-auth 1.7 + `@better-auth/drizzle-adapter`, `jose` 6, pino, Next.js 16, React 19, Tailwind 4, shadcn, Vitest 4, Testing Library, Playwright 1.62, tsup 8, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-m1-foundation-design.md` — read it before any task. The master brief (in the conversation that produced the spec) defines M1–M6; this plan covers M1 only.

## Global Constraints

- Language: code, comments, commits, ADRs, README, docs in English. Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `build:`, `ci:`). Every commit ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Every commit is a working state; no TODO stubs.
- Work happens in a git worktree on branch `feat/m1-foundation` created from `main` with the `superpowers:using-git-worktrees` skill (worktree root under `.claude/worktrees/`, which is gitignored). Every path below is relative to that worktree root.
- Node `>=22` (host has 24), pnpm through corepack (`packageManager: "pnpm@11.25.0"`). Install with `pnpm add -E` (exact versions). TypeScript stays on 5.x (`typescript@5`), never 7.x.
- TypeScript strict everywhere; `noUncheckedIndexedAccess: true`; `verbatimModuleSyntax: true` (use `import type`).
- TDD (red → verify → green → refactor → commit) for all business logic, API routes, guards, token helpers, principal resolution, seed logic, the login form and the token contrast test. Exempt: configs, migrations, generated shadcn components, purely presentational components.
- Never trust client-supplied ids for scoping: a guest's table comes from the `guest_sessions` row, never from the request.
- No raw hex, `rgb()`, multi-digit `px` or `rem` in `apps/` (`pnpm validate-tokens` scans `apps/`, scanning `.css .scss .tsx .jsx .ts .js`, ignoring `node_modules .git dist build .next` and files named `globals.css`). Tailwind utilities are fine; arbitrary values with hex or px are not; do not put hex strings or `: 24px` patterns in TypeScript either.
- Money is integer cents. IDs are UUID v7 from the `uuidv7` package (`$defaultFn`) except better-auth tables (text ids from better-auth) and `audit_log` (bigserial).
- Public URLs are fixed: `/t/<token>`, `/login`, `/kitchen` (M3), `/admin` (M5). API prefix `/api`, health at `/health` (no prefix).
- Error envelope for every non-2xx API response: `{ error: { code, message, details? } }` with `code` in `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_FAILED | TOKEN_INVALID | TOKEN_EXPIRED | RATE_LIMITED | INTERNAL`.
- Brand voice for any UI copy: talk like the person at the counter; say the thing; time is honest. No exclamation-heavy cheer, no emoji, no apologising errors. Demo tenant: **Little Furnace** (product: **TableTap**).
- `.gitattributes` forces LF (`* text=auto eol=lf`); the host has `core.autocrlf` on.
- Line-endings, secrets and ports: API 4000, web 3000, Postgres 5432. `.env` is gitignored; `.env.example` is committed with comments.

## Context files for every task

Every task below is self-contained, but these paths are the shared reference points (some are produced by later tasks; a task says which ones it needs):

| Path | What it is | Exists from |
|---|---|---|
| `docs/superpowers/specs/2026-09-02-m1-foundation-design.md` | The approved M1 spec | now |
| `docs/brand-guidelines.md` | Brand: Little Furnace name, voice, palette, typography | Task 10 |
| `design-system/tabletap/MASTER.md` | ui-ux-pro-max design system (guest surface default) | Task 11 |
| `design-system/tabletap/pages/kitchen.md`, `pages/admin.md` | Per-surface overrides | Task 11 |
| `assets/design-tokens.json` | Single source of truth for tokens (primitive → semantic → component) | Task 10 (primitives), Task 12 (complete) |
| `packages/ui/tokens.css` | Generated CSS custom properties (`pnpm tokens`) | Task 12 |
| `packages/ui/theme.css` | Hand-written surface aliases + Tailwind `@theme inline` | Task 12 |
| `docs/design/components.md` | State specs for button, dish card, order card, status badge, cart counter | Task 12 |
| `docs/design/motion-spec.md` | Motion spec — **does not exist until M6**; M1 adds no motion | M6 |

Skill scripts live outside the repo; the plan copies the three token scripts into `scripts/`:

- `C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py` (run with `python`)
- `C:/Users/chitkid/.claude/skills/brand/scripts/sync-brand-to-tokens.cjs`
- `C:/Users/chitkid/.claude/skills/brand/templates/brand-guidelines-starter.md`
- `C:/Users/chitkid/.claude/skills/design-system/scripts/generate-tokens.cjs`
- `C:/Users/chitkid/.claude/skills/design-system/scripts/validate-tokens.cjs`

## File structure (end state of M1)

```
tabletap/
  package.json pnpm-workspace.yaml turbo.json tsconfig.base.json
  eslint.config.js .prettierrc .gitattributes .gitignore .dockerignore .env.example
  docker-compose.yml Dockerfile.api Dockerfile.web playwright.config.ts
  .github/workflows/ci.yml
  scripts/generate-tokens.cjs scripts/validate-tokens.cjs scripts/sync-brand-to-tokens.cjs
  assets/design-tokens.json
  design-system/tabletap/MASTER.md design-system/tabletap/pages/{kitchen,admin}.md
  docs/brand-guidelines.md docs/backlog.md docs/design/components.md
  docs/adr/0001-staff-auth-and-guest-sessions.md … 0005-one-token-source-three-surfaces.md
  e2e/staff-login.spec.ts
  packages/shared/
    package.json tsconfig.json vitest.config.ts
    src/index.ts roles.ts orders.ts menu.ts errors.ts principal.ts api.ts events.ts
    src/server/index.ts src/server/table-token.ts
    src/*.test.ts src/server/table-token.test.ts
  packages/db/
    package.json tsconfig.json vitest.config.ts drizzle.config.ts
    migrations/0000_init.sql migrations/meta/*
    src/index.ts client.ts migrate.ts testing.ts
    src/schema/index.ts enums.ts helpers.ts auth.ts restaurant.ts menu.ts orders.ts guest.ts audit.ts
    src/seed/data.ts src/seed/run.ts src/seed/run.test.ts
    src/cli/migrate.ts src/cli/seed.ts
    src/schema.test.ts
  packages/ui/
    package.json tsconfig.json vitest.config.ts components.json
    tokens.css (generated) theme.css
    src/index.ts src/lib/utils.ts src/lib/contrast.ts src/lib/contrast.test.ts src/tokens.test.ts
    src/components/{button,input,label,card,badge}.tsx
  apps/api/
    package.json tsconfig.json vitest.config.ts tsup.config.ts docker-entrypoint.sh
    src/main.ts server.ts config.ts auth.ts types.ts
    src/plugins/error-handler.ts auth.ts principal.ts rbac.ts
    src/routes/health.ts me.ts guest.ts tables.ts
    src/lib/errors.ts audit.ts guest-sessions.ts
    src/cli/migrate.ts src/cli/seed.ts
    src/test/helpers.ts
    src/**/*.test.ts
  apps/web/
    package.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.js vitest.config.ts vitest.setup.ts
    app/layout.tsx app/globals.css app/login/page.tsx
    components/login-form.tsx components/login-form.test.tsx
    lib/auth-client.ts
    public/.gitkeep
```

---

### Task 1: Monorepo scaffold

**REQUIRED SUB-SKILLS:** superpowers:using-git-worktrees (once, before this task), superpowers:test-driven-development (exempt here: configs only).

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.gitattributes`, `.dockerignore`, `.env.example`, `docs/backlog.md`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/vitest.config.ts`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/index.ts`, `packages/db/vitest.config.ts`
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`, `packages/ui/vitest.config.ts`
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/main.ts`, `apps/api/vitest.config.ts`
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/vitest.config.ts`
- Modify: `.gitignore` (already exists on `main`)

**Interfaces:**
- Produces: workspace names `@tabletap/shared`, `@tabletap/db`, `@tabletap/ui`, `@tabletap/api`, `@tabletap/web`; root scripts `dev build lint typecheck test e2e tokens validate-tokens brand:sync db:generate db:migrate db:seed format`.

- [x] **Step 1: Create the worktree and branch**

Follow `superpowers:using-git-worktrees`: from the repo root on `main`, create a worktree for branch `feat/m1-foundation`. All following commands run inside the worktree.

- [x] **Step 2: Root files**

`.gitattributes`:
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.webp binary
*.woff2 binary
```

`package.json`:
```json
{
  "name": "tabletap",
  "private": true,
  "packageManager": "pnpm@11.25.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "e2e": "playwright test",
    "tokens": "node scripts/generate-tokens.cjs --config assets/design-tokens.json -o packages/ui/tokens.css",
    "validate-tokens": "node scripts/validate-tokens.cjs --dir apps/",
    "brand:sync": "node scripts/sync-brand-to-tokens.cjs",
    "db:generate": "pnpm --filter @tabletap/db generate",
    "db:migrate": "pnpm --filter @tabletap/db migrate",
    "db:seed": "pnpm --filter @tabletap/db seed",
    "format": "prettier --write ."
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
nodeLinker: hoisted
allowBuilds:
  esbuild: true
  sharp: true
  '@tailwindcss/oxide': true
  unrs-resolver: true
```
(pnpm 11 replaced the `onlyBuiltDependencies` list with the `allowBuilds` map.)

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": {},
    "test": { "outputs": [] },
    "generate": { "cache": false },
    "migrate": { "cache": false },
    "seed": { "cache": false }
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": []
  }
}
```

`eslint.config.js`:
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/migrations/**', 'scripts/**', '**/*.cjs', '**/.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  { rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
);
```

`.prettierrc`:
```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

`.dockerignore`:
```
node_modules
**/node_modules
**/dist
**/.next
.git
.claude
docs
design-system
e2e
test-results
playwright-report
.env
```

`.env.example` (every line commented; values are development defaults):
```
# --- api ---
NODE_ENV=development
PORT=4000
# Postgres connection used by the API, migrations and the seed. Compose overrides the host to "postgres".
DATABASE_URL=postgres://tabletap:tabletap@localhost:5432/tabletap
# better-auth: at least 32 random chars. Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
BETTER_AUTH_SECRET=dev-better-auth-secret-change-me-0123456789
# Public URL of the API (cookie prefix + callback base).
BETTER_AUTH_URL=http://localhost:4000
# Browser origin of the web app; used for CORS and better-auth trustedOrigins.
WEB_ORIGIN=http://localhost:3000
# Signs the tt_guest cookie (@fastify/cookie). At least 32 chars.
COOKIE_SECRET=dev-cookie-secret-change-me-0123456789abcdef
# Signs the table token inside QR codes (HS256). At least 32 chars.
TABLE_TOKEN_SECRET=dev-table-token-secret-change-me-0123456789
# Printed QR codes must outlive demo resets: token lifetime in days.
TABLE_TOKEN_TTL_DAYS=365
# Guest session lifetime (sliding) in hours.
GUEST_SESSION_TTL_HOURS=4
# pino level: fatal error warn info debug trace silent
LOG_LEVEL=info
# Password for the three seeded staff accounts.
DEMO_PASSWORD=tabletap-demo

# --- web ---
# Server-side rewrite target for /api/* (build-time in Next.js). Compose passes http://api:4000 as a build arg.
API_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# --- postgres (docker compose) ---
POSTGRES_USER=tabletap
POSTGRES_PASSWORD=tabletap
POSTGRES_DB=tabletap
```

`docs/backlog.md`:
```markdown
# Backlog

Out-of-scope items noticed during work. Nothing here is scheduled.

- Secret rotation for table tokens (`kid` header) — spec 17.
- Admin-triggered QR regeneration — M5.
- Waiter-created orders — not in the brief.
- Multi-restaurant tenancy — non-goal.
```

Append to `.gitignore`:
```
.env.local
apps/web/.env*.local
```

- [x] **Step 3: Workspace package skeletons**

`packages/shared/package.json`:
```json
{
  "name": "@tabletap/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./server": "./src/server/index.ts" },
  "scripts": { "lint": "eslint .", "typecheck": "tsc --noEmit", "test": "vitest run --passWithNoTests" }
}
```
`packages/shared/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'] } });
```
`packages/shared/src/index.ts`: `export {};` (replaced in Task 2).

`packages/db/package.json`:
```json
{
  "name": "@tabletap/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./testing": "./src/testing.ts",
    "./migrate": "./src/migrate.ts",
    "./seed": "./src/seed/run.ts",
    "./cli/migrate": "./src/cli/migrate.ts",
    "./cli/seed": "./src/cli/seed.ts"
  },
  "scripts": {
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/cli/migrate.ts",
    "seed": "tsx src/cli/seed.ts"
  }
}
```
`packages/db/tsconfig.json`: same as shared. `packages/db/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 } });
```
`packages/db/src/index.ts`: `export {};`

`packages/ui/package.json`:
```json
{
  "name": "@tabletap/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./tokens.css": "./tokens.css", "./theme.css": "./theme.css" },
  "scripts": { "lint": "eslint .", "typecheck": "tsc --noEmit", "test": "vitest run --passWithNoTests" }
}
```
`packages/ui/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2023", "DOM", "DOM.Iterable"] }, "include": ["src"] }
```
`packages/ui/vitest.config.ts`: same as shared. `packages/ui/src/index.ts`: `export {};`

`apps/api/package.json`:
```json
{
  "name": "@tabletap/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsup",
    "start": "node dist/main.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  }
}
```
`apps/api/tsconfig.json` (Node globals such as `console` and `process` need the `node` types because the base config sets `"types": []`):
```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src"] }
```
`apps/api/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['src/**/*.test.ts'], testTimeout: 30000, hookTimeout: 30000 } });
```
`apps/api/src/main.ts` (temporary until Task 6 replaces it): `console.log('api: not built yet');`

`apps/web/package.json`:
```json
{
  "name": "@tabletap/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  }
}
```
`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "allowJs": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```
`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom', include: ['**/*.test.{ts,tsx}'], exclude: ['node_modules', '.next'] } });
```

- [x] **Step 4: Install root dev tooling**

```bash
corepack enable
pnpm add -w --save-dev --save-exact turbo@2.10.12 typescript@5 prettier@3.9.6 eslint@9 typescript-eslint@8.69.0 @eslint/js@9 globals@17.12.0 @playwright/test@1.62.1 vitest@4.1.11 @types/node@24 jsdom@30.0.1
pnpm install
```
(`jsdom` is required by `apps/web/vitest.config.ts`; use the long flags `--save-dev --save-exact` — short-flag bundles like `-wDE` are not parsed as expected by pnpm 11.)
If `@eslint/js@9` does not resolve, use the latest 9.x shown by `npm view @eslint/js versions --json`. `typescript@5` must resolve to a 5.9.x; confirm with `pnpm exec tsc -v`.

- [x] **Step 5: Verify the pipeline runs end to end**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: turbo runs the three tasks in all five workspaces; every one exits 0 (`--passWithNoTests` covers empty packages).

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm + turborepo monorepo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `packages/shared` — roles, RBAC matrix, order transitions, contracts

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `packages/shared/src/roles.ts`, `src/roles.test.ts`, `src/orders.ts`, `src/orders.test.ts`, `src/menu.ts`, `src/errors.ts`, `src/principal.ts`, `src/api.ts`, `src/api.test.ts`, `src/events.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/package.json` (add `zod`)

**Interfaces (produced):**
- `ROLES`, `STAFF_ROLES`, `type Role = 'guest'|'waiter'|'kitchen'|'admin'`, `type StaffRole`, `RoleSchema`, `StaffRoleSchema`, `ACTIONS`, `type Action`, `can(role: Role, action: Action): boolean`
- `ORDER_STATUSES`, `type OrderStatus`, `OrderStatusSchema`, `ORDER_TRANSITIONS`, `canTransition(from: OrderStatus, to: OrderStatus): boolean`
- `ALLERGENS`, `type Allergen`, `AllergenSchema`
- `ERROR_CODES`, `type ErrorCode`, `ErrorEnvelopeSchema`, `type ErrorEnvelope`
- `PrincipalSchema`, `type Principal`, `type StaffPrincipal`, `type GuestPrincipal`
- `ClaimRequestSchema`, `ClaimResponseSchema`, `TableDtoSchema`, `type TableDto`, `TablesResponseSchema`, `TableResponseSchema`, `MeResponseSchema`, `HealthResponseSchema` and their inferred types (`ClaimRequest`, `ClaimResponse`, `MeResponse`, `HealthResponse`)

- [x] **Step 1: Add zod**

```bash
pnpm --filter @tabletap/shared add -E zod@4.5.4
```

- [x] **Step 2: Failing tests for roles and transitions**

`packages/shared/src/roles.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ACTIONS, ROLES, can } from './roles';

describe('can()', () => {
  it('lets every role read the menu', () => {
    for (const role of ROLES) expect(can(role, 'menu.read')).toBe(true);
  });
  it('restricts writes to admin', () => {
    expect(can('admin', 'menu.write')).toBe(true);
    expect(can('waiter', 'menu.write')).toBe(false);
    expect(can('kitchen', 'tables.write')).toBe(false);
    expect(can('guest', 'audit.read')).toBe(false);
  });
  it('scopes guests to their own table and orders', () => {
    expect(can('guest', 'tables.read.own')).toBe(true);
    expect(can('guest', 'tables.read')).toBe(false);
    expect(can('guest', 'orders.create')).toBe(true);
    expect(can('guest', 'orders.read.own')).toBe(true);
    expect(can('guest', 'orders.read.all')).toBe(false);
    expect(can('guest', 'orders.cancel.own')).toBe(true);
  });
  it('lets staff read all tables and orders and transition orders', () => {
    for (const role of ['waiter', 'kitchen', 'admin'] as const) {
      expect(can(role, 'tables.read')).toBe(true);
      expect(can(role, 'orders.read.all')).toBe(true);
      expect(can(role, 'orders.transition')).toBe(true);
      expect(can(role, 'orders.create')).toBe(false);
    }
  });
  it('has a decision for every action and role', () => {
    for (const action of ACTIONS) for (const role of ROLES) expect(typeof can(role, action)).toBe('boolean');
  });
});
```

`packages/shared/src/orders.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, canTransition } from './orders';

describe('canTransition()', () => {
  it('follows the happy path', () => {
    expect(canTransition('draft', 'placed')).toBe(true);
    expect(canTransition('placed', 'paid')).toBe(true);
    expect(canTransition('paid', 'cooking')).toBe(true);
    expect(canTransition('cooking', 'ready')).toBe(true);
    expect(canTransition('ready', 'served')).toBe(true);
  });
  it('allows cancel only from placed and paid', () => {
    expect(canTransition('placed', 'cancelled')).toBe(true);
    expect(canTransition('paid', 'cancelled')).toBe(true);
    expect(canTransition('cooking', 'cancelled')).toBe(false);
    expect(canTransition('draft', 'cancelled')).toBe(false);
    expect(canTransition('ready', 'cancelled')).toBe(false);
  });
  it('rejects skips, reversals and self transitions', () => {
    expect(canTransition('placed', 'cooking')).toBe(false);
    expect(canTransition('ready', 'cooking')).toBe(false);
    for (const s of ORDER_STATUSES) expect(canTransition(s, s)).toBe(false);
    expect(canTransition('served', 'placed')).toBe(false);
    expect(canTransition('cancelled', 'paid')).toBe(false);
  });
});
```

- [x] **Step 3: Run to verify they fail**

Run: `pnpm --filter @tabletap/shared test`
Expected: FAIL, cannot resolve `./roles` and `./orders`.

- [x] **Step 4: Implement roles and orders**

`packages/shared/src/roles.ts`:
```ts
import { z } from 'zod';

export const STAFF_ROLES = ['waiter', 'kitchen', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ROLES = ['guest', ...STAFF_ROLES] as const;
export type Role = (typeof ROLES)[number];
export const StaffRoleSchema = z.enum(STAFF_ROLES);
export const RoleSchema = z.enum(ROLES);

export const ACTIONS = [
  'menu.read',
  'menu.write',
  'tables.read',
  'tables.read.own',
  'tables.write',
  'orders.create',
  'orders.read.own',
  'orders.read.all',
  'orders.transition',
  'orders.cancel.own',
  'audit.read',
  'dashboard.read',
] as const;
export type Action = (typeof ACTIONS)[number];

const STAFF: readonly Role[] = STAFF_ROLES;
const ADMIN: readonly Role[] = ['admin'];
const GUEST: readonly Role[] = ['guest'];

/** Single source of truth for permissions. Later milestones add actions here first. */
const MATRIX: Record<Action, readonly Role[]> = {
  'menu.read': ROLES,
  'menu.write': ADMIN,
  'tables.read': STAFF,
  'tables.read.own': GUEST,
  'tables.write': ADMIN,
  'orders.create': GUEST,
  'orders.read.own': GUEST,
  'orders.read.all': STAFF,
  'orders.transition': STAFF,
  'orders.cancel.own': GUEST,
  'audit.read': ADMIN,
  'dashboard.read': ADMIN,
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[action].includes(role);
}
```

`packages/shared/src/orders.ts`:
```ts
import { z } from 'zod';

export const ORDER_STATUSES = ['draft', 'placed', 'paid', 'cooking', 'ready', 'served', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const OrderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['placed'],
  placed: ['paid', 'cancelled'],
  paid: ['cooking', 'cancelled'],
  cooking: ['ready'],
  ready: ['served'],
  served: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
```

- [x] **Step 5: Run tests, expect PASS, commit**

Run: `pnpm --filter @tabletap/shared test` → PASS (2 files).
```bash
git add packages/shared
git commit -m "feat(shared): RBAC matrix and order state transitions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [x] **Step 6: Failing test for API contracts**

`packages/shared/src/api.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ClaimRequestSchema, ClaimResponseSchema, ErrorEnvelopeSchema, MeResponseSchema, TableDtoSchema } from './index';

describe('API contracts', () => {
  it('requires a non-empty token to claim a table', () => {
    expect(ClaimRequestSchema.safeParse({ token: '' }).success).toBe(false);
    expect(ClaimRequestSchema.safeParse({ token: 'abc' }).success).toBe(true);
  });
  it('validates a table dto', () => {
    const ok = TableDtoSchema.safeParse({ id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', number: 7, label: 'Table 7', seats: 4, isActive: true });
    expect(ok.success).toBe(true);
    expect(TableDtoSchema.safeParse({ id: 'nope', number: 0, label: '', seats: 4, isActive: true }).success).toBe(false);
  });
  it('validates claim and me responses', () => {
    expect(ClaimResponseSchema.safeParse({ table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', number: 7, label: 'Table 7' }, expiresAt: '2026-09-02T12:00:00.000Z' }).success).toBe(true);
    expect(MeResponseSchema.safeParse({ principal: { kind: 'staff', userId: 'u1', email: 'a@b.c', name: 'A', role: 'kitchen' } }).success).toBe(true);
    expect(MeResponseSchema.safeParse({ principal: { kind: 'guest', guestSessionId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f61', tableNumber: 3, expiresAt: '2026-09-02T12:00:00.000Z' } }).success).toBe(true);
    expect(MeResponseSchema.safeParse({ principal: { kind: 'anonymous' } }).success).toBe(true);
    expect(MeResponseSchema.safeParse({ principal: { kind: 'staff', role: 'chef' } }).success).toBe(false);
  });
  it('validates the error envelope', () => {
    expect(ErrorEnvelopeSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Table not found' } }).success).toBe(true);
    expect(ErrorEnvelopeSchema.safeParse({ error: { code: 'OOPS', message: 'x' } }).success).toBe(false);
  });
});
```

- [x] **Step 7: Run to verify it fails**

Run: `pnpm --filter @tabletap/shared test` → FAIL (exports missing from `./index`).

- [x] **Step 8: Implement contracts**

`packages/shared/src/menu.ts`:
```ts
import { z } from 'zod';
export const ALLERGENS = ['gluten', 'dairy', 'egg', 'fish', 'shellfish', 'nuts', 'peanuts', 'soy', 'sesame'] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const AllergenSchema = z.enum(ALLERGENS);
```

`packages/shared/src/errors.ts`:
```ts
import { z } from 'zod';
export const ERROR_CODES = ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED', 'TOKEN_INVALID', 'TOKEN_EXPIRED', 'RATE_LIMITED', 'INTERNAL'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const ErrorEnvelopeSchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string(), details: z.unknown().optional() }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
```

`packages/shared/src/principal.ts`:
```ts
import { z } from 'zod';
import { StaffRoleSchema } from './roles';

export const StaffPrincipalSchema = z.object({
  kind: z.literal('staff'),
  userId: z.string().min(1),
  email: z.string(),
  name: z.string(),
  role: StaffRoleSchema,
});
export const GuestPrincipalSchema = z.object({
  kind: z.literal('guest'),
  guestSessionId: z.uuid(),
  tableId: z.uuid(),
  tableNumber: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});
export const AnonymousPrincipalSchema = z.object({ kind: z.literal('anonymous') });
export const PrincipalSchema = z.discriminatedUnion('kind', [StaffPrincipalSchema, GuestPrincipalSchema, AnonymousPrincipalSchema]);
export type StaffPrincipal = z.infer<typeof StaffPrincipalSchema>;
export type GuestPrincipal = z.infer<typeof GuestPrincipalSchema>;
export type Principal = z.infer<typeof PrincipalSchema>;
```

`packages/shared/src/api.ts`:
```ts
import { z } from 'zod';
import { PrincipalSchema } from './principal';

export const ClaimRequestSchema = z.object({ token: z.string().min(1) });
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

export const TableDtoSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  label: z.string().min(1),
  seats: z.number().int().positive(),
  isActive: z.boolean(),
});
export type TableDto = z.infer<typeof TableDtoSchema>;

export const ClaimResponseSchema = z.object({
  table: TableDtoSchema.pick({ id: true, number: true, label: true }),
  expiresAt: z.iso.datetime(),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

export const MeResponseSchema = z.object({ principal: PrincipalSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const TablesResponseSchema = z.object({ tables: z.array(TableDtoSchema) });
export const TableResponseSchema = z.object({ table: TableDtoSchema });

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptime: z.number(),
  checks: z.object({ db: z.enum(['ok', 'fail']) }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
```

`packages/shared/src/events.ts`:
```ts
/** Typed Socket.io event map. Filled in M3 (kitchen display). Kept here so web and api share one contract. */
export type ServerToClientEvents = Record<string, never>;
export type ClientToServerEvents = Record<string, never>;
```

`packages/shared/src/index.ts`:
```ts
export * from './roles';
export * from './orders';
export * from './menu';
export * from './errors';
export * from './principal';
export * from './api';
export * from './events';
```

- [x] **Step 9: Run tests, lint, typecheck; commit**

Run: `pnpm --filter @tabletap/shared test && pnpm --filter @tabletap/shared lint && pnpm --filter @tabletap/shared typecheck` → all PASS.
```bash
git add packages/shared
git commit -m "feat(shared): API contracts, principal and error envelope schemas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 3: `packages/shared/server` — signed table token for QR codes

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `packages/shared/src/server/table-token.ts`, `src/server/table-token.test.ts`, `src/server/index.ts`
- Modify: `packages/shared/package.json` (add `jose`)

**Interfaces (produced):**
```ts
export interface TableTokenInput { tableId: string; restaurantId: string; tableNumber: number }
export interface TableTokenClaims extends TableTokenInput { issuedAt: number; expiresAt: number } // unix seconds
export class TableTokenVerifyError extends Error { readonly code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' }
export function signTableToken(input: TableTokenInput, opts: { secret: string; ttlSeconds: number; now?: Date }): Promise<string>
export function verifyTableToken(token: string, opts: { secret: string; now?: Date }): Promise<TableTokenClaims>
```
Header `alg: HS256`, `typ: tt-table`; claims `sub` = tableId, `rid`, `tn`, `iat`, `exp`. Never import `@tabletap/shared/server` from `apps/web`.

- [x] **Step 1: Add jose**

```bash
pnpm --filter @tabletap/shared add -E jose@6.2.10
```

- [x] **Step 2: Failing tests**

`packages/shared/src/server/table-token.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { TableTokenVerifyError, signTableToken, verifyTableToken } from './table-token';

const secret = 'test-table-token-secret-0123456789abcdef';
const input = { tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', restaurantId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f61', tableNumber: 7 };
const now = new Date('2026-09-02T10:00:00Z');

describe('table token', () => {
  it('round-trips claims', async () => {
    const token = await signTableToken(input, { secret, ttlSeconds: 3600, now });
    const claims = await verifyTableToken(token, { secret, now });
    expect(claims).toEqual({ ...input, issuedAt: 1788343200, expiresAt: 1788346800 });
  });
  it('rejects a tampered token as TOKEN_INVALID', async () => {
    const token = await signTableToken(input, { secret, ttlSeconds: 3600, now });
    const [h, p, s] = token.split('.');
    const forged = `${h}.${p}.${s?.slice(0, -2)}AA`;
    await expect(verifyTableToken(forged, { secret, now })).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
  it('rejects a token signed with another secret as TOKEN_INVALID', async () => {
    const token = await signTableToken(input, { secret: 'another-secret-another-secret-12345678', ttlSeconds: 3600, now });
    await expect(verifyTableToken(token, { secret, now })).rejects.toBeInstanceOf(TableTokenVerifyError);
    await expect(verifyTableToken(token, { secret, now })).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
  it('rejects an expired token as TOKEN_EXPIRED', async () => {
    const token = await signTableToken(input, { secret, ttlSeconds: 60, now });
    const later = new Date(now.getTime() + 61_000);
    await expect(verifyTableToken(token, { secret, now: later })).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });
  it('rejects garbage as TOKEN_INVALID', async () => {
    await expect(verifyTableToken('not-a-jwt', { secret, now })).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
});
```

- [x] **Step 3: Run to verify it fails**

Run: `pnpm --filter @tabletap/shared test` → FAIL (module not found).

- [x] **Step 4: Implement**

`packages/shared/src/server/table-token.ts`:
```ts
import { SignJWT, errors, jwtVerify } from 'jose';

export interface TableTokenInput {
  tableId: string;
  restaurantId: string;
  tableNumber: number;
}
export interface TableTokenClaims extends TableTokenInput {
  issuedAt: number;
  expiresAt: number;
}
export type TableTokenErrorCode = 'TOKEN_INVALID' | 'TOKEN_EXPIRED';

export class TableTokenVerifyError extends Error {
  constructor(public readonly code: TableTokenErrorCode) {
    super(code);
    this.name = 'TableTokenVerifyError';
  }
}

const TYP = 'tt-table';
const ALG = 'HS256';
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signTableToken(
  input: TableTokenInput,
  opts: { secret: string; ttlSeconds: number; now?: Date },
): Promise<string> {
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ rid: input.restaurantId, tn: input.tableNumber })
    .setProtectedHeader({ alg: ALG, typ: TYP })
    .setSubject(input.tableId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + opts.ttlSeconds)
    .sign(key(opts.secret));
}

export async function verifyTableToken(
  token: string,
  opts: { secret: string; now?: Date },
): Promise<TableTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, key(opts.secret), {
      algorithms: [ALG],
      typ: TYP,
      currentDate: opts.now,
    });
    const { sub, rid, tn, iat, exp } = payload;
    if (typeof sub !== 'string' || typeof rid !== 'string' || typeof tn !== 'number' || typeof iat !== 'number' || typeof exp !== 'number') {
      throw new TableTokenVerifyError('TOKEN_INVALID');
    }
    return { tableId: sub, restaurantId: rid, tableNumber: tn, issuedAt: iat, expiresAt: exp };
  } catch (err) {
    if (err instanceof TableTokenVerifyError) throw err;
    if (err instanceof errors.JWTExpired) throw new TableTokenVerifyError('TOKEN_EXPIRED');
    throw new TableTokenVerifyError('TOKEN_INVALID');
  }
}
```

`packages/shared/src/server/index.ts`:
```ts
export * from './table-token';
```

`TextEncoder` needs Node's ambient types: set `packages/shared/tsconfig.json` to `{ "extends": "../../tsconfig.base.json", "compilerOptions": { "types": ["node"] }, "include": ["src"] }`.

- [x] **Step 5: Run tests, expect PASS, commit**

Run: `pnpm --filter @tabletap/shared test && pnpm --filter @tabletap/shared typecheck` → PASS.
```bash
git add packages/shared
git commit -m "feat(shared): signed table token for QR codes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `packages/db` — schema, migrations, client, PGlite test helper

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development (the schema test drives the migration; the schema files themselves are exempt config).

**Files:**
- Create: `packages/db/drizzle.config.ts`, `src/schema/{index,enums,helpers,auth,restaurant,menu,orders,guest,audit}.ts`, `src/client.ts`, `src/migrate.ts`, `src/testing.ts`, `src/schema.test.ts`, `src/cli/migrate.ts`, `migrations/*` (generated)
- Modify: `packages/db/src/index.ts`, `packages/db/package.json`

**Interfaces (produced):**
- `import * as schema from '@tabletap/db/schema'` with tables `restaurants, tables, menuCategories, menuItems, orders, orderItems, payments, users, sessions, accounts, verifications, guestSessions, auditLog` and enums `userRoleEnum, orderStatusEnum, paymentStatusEnum, paymentProviderEnum, actorTypeEnum`.
- `type Db = PgDatabase<PgQueryResultHKT, typeof schema>` (works for both postgres-js and PGlite instances).
- `createDb(url: string, opts?: { max?: number }): { db: Db; close(): Promise<void> }` (postgres-js).
- `resolveMigrationsDir(): string` (env `MIGRATIONS_DIR` or `<package>/migrations`), `runMigrations(url: string): Promise<void>`.
- `createTestDb(): Promise<{ db: Db; close(): Promise<void> }>` from `@tabletap/db/testing` (PGlite in memory with migrations applied).

- [x] **Step 1: Dependencies**

```bash
pnpm --filter @tabletap/db add -E drizzle-orm@0.45.2 postgres@3.4.9 uuidv7@1.2.1 dotenv@17.4.2 better-auth@1.7.2
pnpm --filter @tabletap/db add -E "@tabletap/shared@workspace:*"
pnpm --filter @tabletap/db add -DE drizzle-kit@0.31.10 @electric-sql/pglite@0.5.8 tsx@4.23.13
```
`better-auth` is needed in Task 5 for `hashPassword`; add it now so the lockfile changes once.

- [x] **Step 2: Failing schema test**

`packages/db/src/schema.test.ts`:
```ts
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from './testing';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.close(); });

describe('migrations', () => {
  it('create every table from the spec', async () => {
    const rows = await ctx.db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`);
    const names = rows.rows.map((r) => r.table_name as string);
    for (const t of ['restaurants', 'tables', 'menu_categories', 'menu_items', 'orders', 'order_items', 'payments', 'users', 'sessions', 'accounts', 'verifications', 'guest_sessions', 'audit_log']) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });
  it('defines the order_status enum with all seven statuses', async () => {
    const rows = await ctx.db.execute(sql`select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where pg_type.typname = 'order_status' order by enumsortorder`);
    expect(rows.rows.map((r) => r.enumlabel)).toEqual(['draft', 'placed', 'paid', 'cooking', 'ready', 'served', 'cancelled']);
  });
  it('enforces unique table numbers per restaurant', async () => {
    const r = await ctx.db.execute(sql`insert into restaurants (name, slug) values ('R', 'r') returning id`);
    const rid = r.rows[0]?.id as string;
    await ctx.db.execute(sql`insert into tables (restaurant_id, number, label, seats) values (${rid}, 1, 'Table 1', 2)`);
    await expect(ctx.db.execute(sql`insert into tables (restaurant_id, number, label, seats) values (${rid}, 1, 'Dup', 2)`)).rejects.toThrow();
  });
});
```
Note: `restaurants.id` and `tables.id` must have a database default (`gen_random_uuid()`) so raw SQL inserts work too; the app still prefers `uuidv7()` via `$defaultFn`.

- [x] **Step 3: Run to verify it fails**

Run: `pnpm --filter @tabletap/db test` → FAIL (`./testing` missing).

- [x] **Step 4: Schema files**

`packages/db/src/schema/enums.ts`:
```ts
import { pgEnum } from 'drizzle-orm/pg-core';
export const userRoleEnum = pgEnum('user_role', ['waiter', 'kitchen', 'admin']);
export const orderStatusEnum = pgEnum('order_status', ['draft', 'placed', 'paid', 'cooking', 'ready', 'served', 'cancelled']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'succeeded', 'failed', 'refunded']);
export const paymentProviderEnum = pgEnum('payment_provider', ['stripe', 'demo']);
export const actorTypeEnum = pgEnum('actor_type', ['user', 'guest', 'system']);
```

`packages/db/src/schema/helpers.ts`:
```ts
import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`).$defaultFn(() => uuidv7());
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
};
```

`packages/db/src/schema/auth.ts` — generated by `npx auth@latest generate` for better-auth 1.7.2 (`usePlural: true`, additional field `role`); the only edit is `role` typed with `userRoleEnum`. Copy verbatim:
```ts
import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  role: userRoleEnum('role').default('waiter').notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_userId_idx').on(table.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
  },
  (table) => [uniqueIndex('accounts_issuer_accountId_uidx').on(table.issuer, table.accountId), index('accounts_userId_idx').on(table.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const usersRelations = relations(users, ({ many }) => ({ sessions: many(sessions), accounts: many(accounts) }));
export const sessionsRelations = relations(sessions, ({ one }) => ({ user: one(users, { fields: [sessions.userId], references: [users.id] }) }));
export const accountsRelations = relations(accounts, ({ one }) => ({ user: one(users, { fields: [accounts.userId], references: [users.id] }) }));
```

`packages/db/src/schema/restaurant.ts`:
```ts
import { boolean, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './helpers';

export const restaurants = pgTable('restaurants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  currency: text('currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('UTC'),
  ...timestamps,
});

export const tables = pgTable(
  'tables',
  {
    id: id(),
    restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    label: text('label').notNull(),
    seats: integer('seats').notNull().default(2),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [unique('tables_restaurant_number_unique').on(t.restaurantId, t.number)],
);
```

`packages/db/src/schema/menu.ts`:
```ts
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './helpers';
import { restaurants } from './restaurant';

export const menuCategories = pgTable('menu_categories', {
  id: id(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps,
});

export const menuItems = pgTable('menu_items', {
  id: id(),
  categoryId: uuid('category_id').notNull().references(() => menuCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  priceCents: integer('price_cents').notNull(),
  imageUrl: text('image_url'),
  allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});
```

`packages/db/src/schema/guest.ts`:
```ts
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './helpers';
import { tables } from './restaurant';

export const guestSessions = pgTable('guest_sessions', {
  id: id(),
  tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
});
```

`packages/db/src/schema/orders.ts`:
```ts
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orderStatusEnum, paymentProviderEnum, paymentStatusEnum } from './enums';
import { guestSessions } from './guest';
import { id, timestamps } from './helpers';
import { menuItems } from './menu';
import { restaurants, tables } from './restaurant';

export const orders = pgTable('orders', {
  id: id(),
  restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').notNull().references(() => tables.id, { onDelete: 'restrict' }),
  guestSessionId: uuid('guest_session_id').references(() => guestSessions.id, { onDelete: 'set null' }),
  status: orderStatusEnum('status').notNull().default('draft'),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull().default(0),
  note: text('note'),
  idempotencyKey: text('idempotency_key').unique(),
  placedAt: timestamp('placed_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  servedAt: timestamp('served_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  ...timestamps,
});

export const orderItems = pgTable('order_items', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  menuItemId: uuid('menu_item_id').notNull().references(() => menuItems.id, { onDelete: 'restrict' }),
  nameSnapshot: text('name_snapshot').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  quantity: integer('quantity').notNull(),
  lineTotalCents: integer('line_total_cents').notNull(),
  ...timestamps,
});

export const payments = pgTable('payments', {
  id: id(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  provider: paymentProviderEnum('provider').notNull(),
  providerSessionId: text('provider_session_id'),
  providerPaymentIntentId: text('provider_payment_intent_id'),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('USD'),
  status: paymentStatusEnum('status').notNull().default('pending'),
  ...timestamps,
});
```

`packages/db/src/schema/audit.ts`:
```ts
import { bigserial, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { actorTypeEnum } from './enums';

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  actorType: actorTypeEnum('actor_type').notNull(),
  actorId: text('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

`packages/db/src/schema/index.ts`:
```ts
export * from './enums';
export * from './auth';
export * from './restaurant';
export * from './menu';
export * from './guest';
export * from './orders';
export * from './audit';
```

- [x] **Step 5: Client, migrator, testing helper, drizzle config**

`packages/db/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({ dialect: 'postgresql', schema: './src/schema/index.ts', out: './migrations' });
```

`packages/db/src/client.ts`:
```ts
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(url: string, opts: { max?: number } = {}): { db: Db; close: () => Promise<void> } {
  const sql = postgres(url, { max: opts.max ?? 10 });
  const db = drizzle(sql, { schema });
  return { db: db as unknown as Db, close: () => sql.end() };
}
```

`packages/db/src/migrate.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

export function resolveMigrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../migrations', import.meta.url));
}

export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: resolveMigrationsDir() });
  } finally {
    await sql.end();
  }
}
```

`packages/db/src/testing.ts`:
```ts
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { Db } from './client';
import { resolveMigrationsDir } from './migrate';
import * as schema from './schema/index';

/** In-memory Postgres (PGlite) with all migrations applied. One per test file. */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolveMigrationsDir() });
  return { db: db as unknown as Db, close: () => client.close() };
}
```

`packages/db/src/cli/migrate.ts`:
```ts
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { runMigrations } from '../migrate';

loadDotenv({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')], quiet: true });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
await runMigrations(url);
console.log('migrations applied');
```

`packages/db/src/index.ts`:
```ts
export * as schema from './schema/index';
export * from './schema/index';
export { createDb, type Db } from './client';
export { resolveMigrationsDir, runMigrations } from './migrate';
```

- [x] **Step 6: Generate the migration**

```bash
pnpm --filter @tabletap/db generate --name init
```
Expected: `packages/db/migrations/0000_init.sql` plus `migrations/meta/`. Open the SQL and confirm it contains `CREATE TYPE "public"."order_status"`, all 13 tables, `tables_restaurant_number_unique`, `accounts_issuer_accountId_uidx`.

- [x] **Step 7: Run tests, expect PASS, commit**

Run: `pnpm --filter @tabletap/db test && pnpm --filter @tabletap/db typecheck && pnpm --filter @tabletap/db lint` → PASS.
```bash
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): drizzle schema, initial migration and PGlite test helper

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 5: `packages/db` — idempotent seed (Little Furnace)

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `packages/db/src/seed/data.ts`, `src/seed/run.ts`, `src/seed/run.test.ts`, `src/cli/seed.ts`

**Interfaces (produced):**
```ts
export const DEMO_RESTAURANT_SLUG = 'little-furnace';
export const DEMO_STAFF: ReadonlyArray<{ email: string; name: string; role: 'admin' | 'kitchen' | 'waiter' }>;
export interface SeedOptions { mode: 'if-empty' | 'reset'; demoPassword: string; tableTokenSecret: string; tableTokenTtlDays: number; webOrigin: string; now?: Date }
export interface SeedResult { skipped: boolean; counts: { restaurants: number; tables: number; categories: number; items: number; users: number }; guestUrls: string[] }
export function seed(db: Db, opts: SeedOptions): Promise<SeedResult>
```
Consumes: `Db`, `schema` (Task 4); `signTableToken` (Task 3); `hashPassword` from `better-auth/crypto`.

- [x] **Step 1: Failing tests**

`packages/db/src/seed/run.test.ts`:
```ts
import { verifyPassword } from 'better-auth/crypto';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyTableToken } from '@tabletap/shared/server';
import * as schema from '../schema/index';
import { createTestDb } from '../testing';
import { DEMO_RESTAURANT_SLUG, DEMO_STAFF } from './data';
import { seed, type SeedOptions } from './run';

const opts: SeedOptions = {
  mode: 'reset',
  demoPassword: 'tabletap-demo',
  tableTokenSecret: 'test-table-token-secret-0123456789abcdef',
  tableTokenTtlDays: 365,
  webOrigin: 'http://localhost:3000',
};

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.close(); });

async function countRows() {
  const [r, t, c, i, u, a] = await Promise.all([
    ctx.db.select({ n: count() }).from(schema.restaurants),
    ctx.db.select({ n: count() }).from(schema.tables),
    ctx.db.select({ n: count() }).from(schema.menuCategories),
    ctx.db.select({ n: count() }).from(schema.menuItems),
    ctx.db.select({ n: count() }).from(schema.users),
    ctx.db.select({ n: count() }).from(schema.accounts),
  ]);
  return { restaurants: r[0]?.n, tables: t[0]?.n, categories: c[0]?.n, items: i[0]?.n, users: u[0]?.n, accounts: a[0]?.n };
}

describe('seed', () => {
  it('seeds Little Furnace with 12 tables, 4 categories, 20 items and 3 staff', async () => {
    const result = await seed(ctx.db, opts);
    expect(result.skipped).toBe(false);
    expect(result.counts).toEqual({ restaurants: 1, tables: 12, categories: 4, items: 20, users: 3 });
    expect(await countRows()).toEqual({ restaurants: 1, tables: 12, categories: 4, items: 20, users: 3, accounts: 3 });
    const [restaurant] = await ctx.db.select().from(schema.restaurants).where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
    expect(restaurant?.name).toBe('Little Furnace');
    expect(restaurant?.currency).toBe('USD');
  });
  it('marks exactly one item unavailable', async () => {
    const unavailable = await ctx.db.select().from(schema.menuItems).where(eq(schema.menuItems.isAvailable, false));
    expect(unavailable.map((i) => i.name)).toEqual(['Burrata & Peaches']);
  });
  it('creates staff accounts whose password verifies with better-auth', async () => {
    for (const staff of DEMO_STAFF) {
      const [user] = await ctx.db.select().from(schema.users).where(eq(schema.users.email, staff.email));
      expect(user?.role).toBe(staff.role);
      expect(user?.name).toBe(staff.name);
      const [account] = await ctx.db.select().from(schema.accounts).where(eq(schema.accounts.userId, user!.id));
      expect(account?.providerId).toBe('credential');
      expect(account?.issuer).toBe('local:credential');
      expect(account?.accountId).toBe(user!.id);
      expect(await verifyPassword({ hash: account!.password!, password: 'tabletap-demo' })).toBe(true);
    }
  });
  it('returns one signed guest URL per table', async () => {
    const result = await seed(ctx.db, opts);
    expect(result.guestUrls).toHaveLength(12);
    const token = result.guestUrls[0]!.replace('http://localhost:3000/t/', '');
    const claims = await verifyTableToken(token, { secret: opts.tableTokenSecret });
    expect(claims.tableNumber).toBe(1);
  });
  it('reset twice yields identical counts', async () => {
    await seed(ctx.db, opts);
    const first = await countRows();
    await seed(ctx.db, opts);
    expect(await countRows()).toEqual(first);
  });
  it('if-empty skips when the restaurant exists and seeds when it does not', async () => {
    const skipped = await seed(ctx.db, { ...opts, mode: 'if-empty' });
    expect(skipped.skipped).toBe(true);
    await ctx.db.delete(schema.restaurants);
    await ctx.db.delete(schema.users);
    const seeded = await seed(ctx.db, { ...opts, mode: 'if-empty' });
    expect(seeded.skipped).toBe(false);
    expect((await countRows()).tables).toBe(12);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `pnpm --filter @tabletap/db test` → FAIL (`./data`, `./run` missing).

- [x] **Step 3: Seed data**

`packages/db/src/seed/data.ts`:
```ts
import type { Allergen, StaffRole } from '@tabletap/shared';

export const DEMO_RESTAURANT_SLUG = 'little-furnace';
export const DEMO_RESTAURANT = { name: 'Little Furnace', slug: DEMO_RESTAURANT_SLUG, currency: 'USD', timezone: 'Europe/Lisbon' } as const;

export const DEMO_TABLES: ReadonlyArray<{ number: number; label: string; seats: number }> = Array.from({ length: 12 }, (_, i) => ({
  number: i + 1,
  label: `Table ${i + 1}`,
  seats: [2, 2, 4, 4, 4, 6, 2, 4, 4, 6, 2, 4][i]!,
}));

export interface SeedItem { name: string; description: string; priceCents: number; allergens: Allergen[]; isAvailable?: boolean }
export const DEMO_MENU: ReadonlyArray<{ category: string; items: SeedItem[] }> = [
  {
    category: 'Flatbreads',
    items: [
      { name: 'Margherita Flatbread', description: 'Tomato, fior di latte, basil.', priceCents: 1200, allergens: ['gluten', 'dairy'] },
      { name: 'Fennel Sausage & Honey', description: 'Fennel sausage, chili honey, pecorino.', priceCents: 1500, allergens: ['gluten', 'dairy'] },
      { name: 'Mushroom & Taleggio', description: 'Roast mushrooms, taleggio, thyme.', priceCents: 1400, allergens: ['gluten', 'dairy'] },
      { name: 'Charred Pepper & Olive', description: 'Charred peppers, olives, salsa verde. Vegan.', priceCents: 1300, allergens: ['gluten'] },
      { name: 'Prosciutto & Rocket', description: 'Prosciutto, rocket, parmesan, lemon.', priceCents: 1600, allergens: ['gluten', 'dairy'] },
      { name: 'Smoked Chili & Egg', description: 'Smoked chili, soft egg, spring onion.', priceCents: 1400, allergens: ['gluten', 'egg', 'dairy'] },
    ],
  },
  {
    category: 'Bowls',
    items: [
      { name: 'Roast Chicken Grain Bowl', description: 'Farro, roast chicken, greens, tahini.', priceCents: 1400, allergens: ['gluten'] },
      { name: 'Ember Salmon Bowl', description: 'Fire-roasted salmon, rice, pickles, sesame.', priceCents: 1700, allergens: ['fish', 'sesame'] },
      { name: 'Harissa Chickpea Bowl', description: 'Harissa chickpeas, roast roots, tahini. Vegan.', priceCents: 1200, allergens: ['sesame'] },
      { name: 'Lamb Meatball Bowl', description: 'Lamb meatballs, bulgur, yoghurt, mint.', priceCents: 1600, allergens: ['gluten', 'dairy'] },
      { name: 'Roast Squash & Feta', description: 'Roast squash, feta, toasted seeds, walnuts.', priceCents: 1300, allergens: ['dairy', 'nuts'] },
    ],
  },
  {
    category: 'Sides',
    items: [
      { name: 'Blistered Greens', description: 'Seasonal greens, garlic, lemon.', priceCents: 600, allergens: [] },
      { name: 'Furnace Potatoes', description: 'Crisp potatoes from the oven floor, rosemary salt.', priceCents: 700, allergens: [] },
      { name: 'Burrata & Peaches', description: 'Burrata, grilled peaches, basil oil.', priceCents: 1100, allergens: ['dairy'], isAvailable: false },
      { name: 'Wood-Fired Focaccia', description: 'Focaccia, olive oil, flaky salt.', priceCents: 500, allergens: ['gluten'] },
      { name: 'Marinated Olives', description: 'Olives, orange peel, fennel seed.', priceCents: 500, allergens: [] },
    ],
  },
  {
    category: 'Drinks',
    items: [
      { name: 'House Lemonade', description: 'Lemon, a little honey, soda.', priceCents: 400, allergens: [] },
      { name: 'Sparkling Water', description: '500 ml.', priceCents: 300, allergens: [] },
      { name: 'Cold Brew', description: 'Slow-steeped, served over ice.', priceCents: 450, allergens: [] },
      { name: 'Blood Orange Soda', description: 'Blood orange, soda, ice.', priceCents: 400, allergens: [] },
    ],
  },
];

export const DEMO_STAFF: ReadonlyArray<{ email: string; name: string; role: StaffRole }> = [
  { email: 'admin@littlefurnace.demo', name: 'Mara Quinn', role: 'admin' },
  { email: 'kitchen@littlefurnace.demo', name: 'Theo Baptiste', role: 'kitchen' },
  { email: 'waiter@littlefurnace.demo', name: 'Jun Okafor', role: 'waiter' },
];
```

- [x] **Step 4: Seed runner and CLI**

`packages/db/src/seed/run.ts`:
```ts
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { signTableToken } from '@tabletap/shared/server';
import { uuidv7 } from 'uuidv7';
import type { Db } from '../client';
import * as schema from '../schema/index';
import { DEMO_MENU, DEMO_RESTAURANT, DEMO_RESTAURANT_SLUG, DEMO_STAFF, DEMO_TABLES } from './data';

export interface SeedOptions {
  mode: 'if-empty' | 'reset';
  demoPassword: string;
  tableTokenSecret: string;
  tableTokenTtlDays: number;
  webOrigin: string;
  now?: Date;
}
export interface SeedResult {
  skipped: boolean;
  counts: { restaurants: number; tables: number; categories: number; items: number; users: number };
  guestUrls: string[];
}

export async function seed(db: Db, opts: SeedOptions): Promise<SeedResult> {
  const now = opts.now ?? new Date();
  const existing = await db.select({ id: schema.restaurants.id }).from(schema.restaurants).where(eq(schema.restaurants.slug, DEMO_RESTAURANT_SLUG));
  if (opts.mode === 'if-empty' && existing.length > 0) {
    return { skipped: true, counts: { restaurants: 0, tables: 0, categories: 0, items: 0, users: 0 }, guestUrls: [] };
  }

  const passwordHash = await hashPassword(opts.demoPassword);

  const inserted = await db.transaction(async (tx) => {
    // Delete in dependency order. Cascades handle children, listed anyway for clarity.
    await tx.delete(schema.auditLog);
    await tx.delete(schema.payments);
    await tx.delete(schema.orderItems);
    await tx.delete(schema.orders);
    await tx.delete(schema.guestSessions);
    await tx.delete(schema.menuItems);
    await tx.delete(schema.menuCategories);
    await tx.delete(schema.tables);
    await tx.delete(schema.restaurants);
    await tx.delete(schema.sessions);
    await tx.delete(schema.accounts);
    await tx.delete(schema.users);

    const [restaurant] = await tx.insert(schema.restaurants).values(DEMO_RESTAURANT).returning();
    if (!restaurant) throw new Error('seed: restaurant insert returned nothing');

    const tables = await tx
      .insert(schema.tables)
      .values(DEMO_TABLES.map((t) => ({ ...t, restaurantId: restaurant.id })))
      .returning();

    let items = 0;
    for (const [categoryIndex, group] of DEMO_MENU.entries()) {
      const [category] = await tx
        .insert(schema.menuCategories)
        .values({ restaurantId: restaurant.id, name: group.category, sortOrder: categoryIndex })
        .returning();
      if (!category) throw new Error('seed: category insert returned nothing');
      await tx.insert(schema.menuItems).values(
        group.items.map((item, index) => ({
          categoryId: category.id,
          name: item.name,
          description: item.description,
          priceCents: item.priceCents,
          allergens: item.allergens,
          isAvailable: item.isAvailable ?? true,
          sortOrder: index,
        })),
      );
      items += group.items.length;
    }

    for (const staff of DEMO_STAFF) {
      const userId = uuidv7();
      await tx.insert(schema.users).values({ id: userId, name: staff.name, email: staff.email, emailVerified: true, role: staff.role, createdAt: now, updatedAt: now });
      await tx.insert(schema.accounts).values({
        id: uuidv7(),
        userId,
        accountId: userId,
        providerId: 'credential',
        issuer: 'local:credential',
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { restaurant, tables, categories: DEMO_MENU.length, items, users: DEMO_STAFF.length };
  });

  const guestUrls: string[] = [];
  for (const table of [...inserted.tables].sort((a, b) => a.number - b.number)) {
    const token = await signTableToken(
      { tableId: table.id, restaurantId: inserted.restaurant.id, tableNumber: table.number },
      { secret: opts.tableTokenSecret, ttlSeconds: opts.tableTokenTtlDays * 86_400, now },
    );
    guestUrls.push(`${opts.webOrigin}/t/${token}`);
  }

  return {
    skipped: false,
    counts: { restaurants: 1, tables: inserted.tables.length, categories: inserted.categories, items: inserted.items, users: inserted.users },
    guestUrls,
  };
}
```

`packages/db/src/cli/seed.ts`:
```ts
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { createDb } from '../client';
import { seed } from '../seed/run';

loadDotenv({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')], quiet: true });

const arg = process.argv.slice(2).find((a) => a === '--if-empty' || a === '--reset');
if (!arg) {
  console.error('usage: seed --if-empty | --reset');
  process.exit(1);
}
const env = process.env;
const url = env.DATABASE_URL;
const tableTokenSecret = env.TABLE_TOKEN_SECRET;
if (!url || !tableTokenSecret) {
  console.error('DATABASE_URL and TABLE_TOKEN_SECRET must be set');
  process.exit(1);
}
const { db, close } = createDb(url, { max: 1 });
try {
  const result = await seed(db, {
    mode: arg === '--reset' ? 'reset' : 'if-empty',
    demoPassword: env.DEMO_PASSWORD ?? 'tabletap-demo',
    tableTokenSecret,
    tableTokenTtlDays: Number(env.TABLE_TOKEN_TTL_DAYS ?? 365),
    webOrigin: env.WEB_ORIGIN ?? 'http://localhost:3000',
  });
  if (result.skipped) console.log('seed: demo data already present, skipped');
  else {
    console.log(`seed: ${JSON.stringify(result.counts)}`);
    console.log('guest URLs:');
    for (const u of result.guestUrls) console.log(`  ${u}`);
  }
} finally {
  await close();
}
```

- [x] **Step 5: Run tests, expect PASS, commit**

Run: `pnpm --filter @tabletap/db test && pnpm --filter @tabletap/db typecheck && pnpm --filter @tabletap/db lint` → PASS.
```bash
git add packages/db
git commit -m "feat(db): idempotent Little Furnace seed with staff accounts and guest URLs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `apps/api` — config, app factory, error handler, `/health`, `main.ts`

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `apps/api/src/config.ts`, `src/config.test.ts`, `src/lib/errors.ts`, `src/plugins/error-handler.ts`, `src/routes/health.ts`, `src/server.ts`, `src/types.ts`, `src/test/helpers.ts`, `src/routes/health.test.ts`, `src/plugins/error-handler.test.ts`, `src/main.ts` (replace), `src/cli/migrate.ts`, `src/cli/seed.ts`
- Modify: `apps/api/package.json`

**Interfaces (produced):**
```ts
export type Config = { NODE_ENV: 'development'|'test'|'production'; PORT: number; DATABASE_URL: string; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL: string; WEB_ORIGIN: string; COOKIE_SECRET: string; TABLE_TOKEN_SECRET: string; TABLE_TOKEN_TTL_DAYS: number; GUEST_SESSION_TTL_HOURS: number; LOG_LEVEL: string }
export function loadConfig(env?: NodeJS.ProcessEnv): Config           // throws Error listing every invalid variable
export class AppError extends Error { code: ErrorCode; statusCode: number; details?: unknown }
export interface BuildAppOptions { db: Db; config: Config; logger?: boolean }
export function buildApp(opts: BuildAppOptions): Promise<FastifyInstance>
// test helpers
export const TEST_CONFIG: Config
export function createTestApp(): Promise<{ app: FastifyInstance; db: Db; close(): Promise<void> }>   // PGlite + seed + buildApp
```
Fastify decorations: `app.db: Db`, `app.config: Config`; every route may set `config: { principal: false }` (used by Task 7).

- [x] **Step 1: Dependencies**

```bash
pnpm --filter @tabletap/api add -E fastify@5.12.1 @fastify/cors@11.3.0 @fastify/cookie@11.1.2 @fastify/rate-limit@11.2.0 fastify-type-provider-zod@7.0.0 zod@4.5.4 better-auth@1.7.2 @better-auth/drizzle-adapter@1.7.2 drizzle-orm@0.45.2 dotenv@17.4.2 uuidv7@1.2.1
pnpm --filter @tabletap/api add -E "@tabletap/db@workspace:*" "@tabletap/shared@workspace:*"
pnpm --filter @tabletap/api add -DE tsx@4.23.13 tsup@8.5.1 pino-pretty@13 @electric-sql/pglite@0.5.8
```
If `pino-pretty@13` does not resolve, take the latest major from `npm view pino-pretty version`.

- [x] **Step 2: Failing config test**

`apps/api/src/config.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECRET: 'y'.repeat(32),
  TABLE_TOKEN_SECRET: 'z'.repeat(32),
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(valid);
    expect(c.PORT).toBe(4000);
    expect(c.NODE_ENV).toBe('development');
    expect(c.TABLE_TOKEN_TTL_DAYS).toBe(365);
    expect(c.GUEST_SESSION_TTL_HOURS).toBe(4);
    expect(c.LOG_LEVEL).toBe('info');
  });
  it('coerces numbers', () => {
    expect(loadConfig({ ...valid, PORT: '5000', GUEST_SESSION_TTL_HOURS: '2' })).toMatchObject({ PORT: 5000, GUEST_SESSION_TTL_HOURS: 2 });
  });
  it('lists every invalid variable in one readable error', () => {
    expect(() => loadConfig({ ...valid, BETTER_AUTH_SECRET: 'short', WEB_ORIGIN: 'not a url' })).toThrow(/BETTER_AUTH_SECRET[\s\S]*WEB_ORIGIN/);
  });
});
```

- [x] **Step 3: Run to verify it fails, then implement config**

Run: `pnpm --filter @tabletap/api test` → FAIL.

`apps/api/src/config.ts`:
```ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_ORIGIN: z.url(),
  COOKIE_SECRET: z.string().min(32),
  TABLE_TOKEN_SECRET: z.string().min(32),
  TABLE_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(365),
  GUEST_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(4),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (parsed.success) return parsed.data;
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
  throw new Error(`Invalid environment:\n${lines.join('\n')}`);
}
```
Run tests → PASS. Commit: `git add apps/api && git commit -m "feat(api): zod-validated config" ...` (with the trailer).

- [x] **Step 4: Failing tests for health and the error envelope**

`apps/api/src/test/helpers.ts` (test-only, no production code depends on it):
```ts
import { seed } from '@tabletap/db/seed';
import { createTestDb } from '@tabletap/db/testing';
import type { Db } from '@tabletap/db';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config';
import { buildApp } from '../server';

export const TEST_CONFIG: Config = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: 'pglite://memory',
  BETTER_AUTH_SECRET: 'test-better-auth-secret-0123456789abcdef',
  BETTER_AUTH_URL: 'http://localhost:4000',
  WEB_ORIGIN: 'http://localhost:3000',
  COOKIE_SECRET: 'test-cookie-secret-0123456789abcdefghijk',
  TABLE_TOKEN_SECRET: 'test-table-token-secret-0123456789abcdef',
  TABLE_TOKEN_TTL_DAYS: 365,
  GUEST_SESSION_TTL_HOURS: 4,
  LOG_LEVEL: 'silent',
};
export const TEST_DEMO_PASSWORD = 'tabletap-demo';

export async function createTestApp(opts: { seed?: boolean } = {}): Promise<{ app: FastifyInstance; db: Db; close: () => Promise<void> }> {
  const { db, close: closeDb } = await createTestDb();
  if (opts.seed !== false) {
    await seed(db, { mode: 'reset', demoPassword: TEST_DEMO_PASSWORD, tableTokenSecret: TEST_CONFIG.TABLE_TOKEN_SECRET, tableTokenTtlDays: 365, webOrigin: TEST_CONFIG.WEB_ORIGIN });
  }
  const app = await buildApp({ db, config: TEST_CONFIG, logger: false });
  await app.ready();
  return { app, db, close: async () => { await app.close(); await closeDb(); } };
}
```

`apps/api/src/routes/health.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthResponseSchema } from '@tabletap/shared';
import { createTestApp } from '../test/helpers';

describe('GET /health', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp({ seed: false }); });
  afterAll(async () => { await ctx.close(); });

  it('reports ok with a db check and echoes the request id', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-123' } });
    expect(res.statusCode).toBe(200);
    const body = HealthResponseSchema.parse(res.json());
    expect(body.status).toBe('ok');
    expect(body.checks.db).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.headers['x-request-id']).toBe('req-123');
  });
  it('reports degraded with 503 when the database is gone', async () => {
    await ctx.close();
    const res = await ctx.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: 'degraded', checks: { db: 'fail' } });
  });
});
```
(The second test closes the PGlite client; `app.inject` still works on a closed Fastify only if `close()` runs after the request. Order the calls exactly as shown: close db first via `ctx.close()` closes both, so instead build a second app for this case: create `const { db, close } = await createTestDb(); await close(); const app = await buildApp({ db, config: TEST_CONFIG, logger: false });` and inject on that app, then `await app.close()`. Write the test that way.)

`apps/api/src/plugins/error-handler.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorEnvelopeSchema } from '@tabletap/shared';
import { AppError } from '../lib/errors';
import { createTestApp } from '../test/helpers';

describe('error handler', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp({ seed: false });
    ctx.app.get('/boom', { config: { principal: false } }, async () => { throw new Error('secret stack'); });
    ctx.app.get('/teapot', { config: { principal: false } }, async () => { throw new AppError('NOT_FOUND', 404, 'Nothing here'); });
    ctx.app.post('/validate', { config: { principal: false }, schema: { body: z.object({ n: z.number() }) } }, async () => ({ ok: true }));
    await ctx.app.ready();
  });
  afterAll(async () => { await ctx.close(); });

  it('maps AppError to its status and code', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/teapot' });
    expect(res.statusCode).toBe(404);
    expect(ErrorEnvelopeSchema.parse(res.json()).error).toEqual({ code: 'NOT_FOUND', message: 'Nothing here' });
  });
  it('maps validation failures to 400 VALIDATION_FAILED with details', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/validate', payload: { n: 'x' } });
    expect(res.statusCode).toBe(400);
    const body = ErrorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toBeDefined();
  });
  it('hides internals behind 500 INTERNAL', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
    expect(JSON.stringify(res.json())).not.toContain('secret stack');
  });
  it('returns NOT_FOUND envelope for unknown routes', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route GET /nope not found' } });
  });
});
```
Note: routes added after `buildApp()` but before `app.ready()` — `createTestApp` already calls `ready()`. Change `createTestApp` to accept `{ seed?: boolean; ready?: boolean }` and skip `ready()` when `ready: false`; the error-handler test passes `ready: false` and calls `ready()` itself. Keep that option in the helper.

- [x] **Step 5: Run to verify they fail, then implement**

`apps/api/src/lib/errors.ts`:
```ts
import type { ErrorCode } from '@tabletap/shared';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

`apps/api/src/types.ts`:
```ts
import type { Db } from '@tabletap/db';
import type { Principal } from '@tabletap/shared';
import type { Config } from './config';
import type { Auth } from './auth';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
    auth: Auth;
  }
  interface FastifyRequest {
    principal: Principal;
  }
  interface FastifyContextConfig {
    /** Set to false on routes that must not resolve a principal (health, auth handler). */
    principal?: boolean;
  }
}
```
`Auth` comes from Task 7; until then create `apps/api/src/auth.ts` with `export type Auth = unknown;` and replace it in Task 7.

`apps/api/src/plugins/error-handler.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors';

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
  });
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: 'Request did not match the expected shape.', details: error.validation } });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) } });
    }
    const status = typeof (error as { statusCode?: number }).statusCode === 'number' ? (error as { statusCode: number }).statusCode : 500;
    if (status === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } });
    }
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'VALIDATION_FAILED', message: error.message } });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  });
});
```
Add `fastify-plugin`: `pnpm --filter @tabletap/api add -E fastify-plugin@5`.

`apps/api/src/routes/health.ts`:
```ts
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import pkg from '../../package.json' with { type: 'json' };

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', { config: { principal: false } }, async (_request, reply) => {
    let db: 'ok' | 'fail' = 'ok';
    try {
      await app.db.execute(sql`select 1`);
    } catch {
      db = 'fail';
    }
    const body = { status: db === 'ok' ? 'ok' : 'degraded', version: pkg.version, uptime: process.uptime(), checks: { db } };
    return reply.status(db === 'ok' ? 200 : 503).send(body);
  });
}
```

`apps/api/src/server.ts`:
```ts
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@tabletap/db';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { randomUUID } from 'node:crypto';
import type { Config } from './config';
import { errorHandlerPlugin } from './plugins/error-handler';
import { healthRoutes } from './routes/health';
import './types';

export interface BuildAppOptions {
  db: Db;
  config: Config;
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = opts;
  const app = Fastify({
    logger: opts.logger === false ? false : {
      level: config.LOG_LEVEL,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', opts.db);
  app.decorate('config', config);
  app.addHook('onSend', async (request, reply) => { reply.header('x-request-id', request.id); });

  await app.register(errorHandlerPlugin);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(rateLimit, {
    global: false,
    // @fastify/rate-limit throws this value, so it must carry its own statusCode or the
    // error handler's generic mapping reads it as a 500 instead of a 429.
    errorResponseBuilder: (_req, context) => ({
      statusCode: context.statusCode,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' },
    }),
  });
  await app.register(healthRoutes);
  return app;
}
```

`apps/api/src/main.ts`:
```ts
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { createDb } from '@tabletap/db';
import { loadConfig } from './config';
import { buildApp } from './server';

loadDotenv({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')], quiet: true });
const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL);
const app = await buildApp({ db, config });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
```

`apps/api/src/cli/migrate.ts`: `import '@tabletap/db/cli/migrate';`
`apps/api/src/cli/seed.ts`: `import '@tabletap/db/cli/seed';`

`apps/api/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { main: 'src/main.ts', migrate: 'src/cli/migrate.ts', seed: 'src/cli/seed.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: [/^@tabletap\//],
});
```

- [x] **Step 6: Run tests, lint, typecheck, build; commit**

Run: `pnpm --filter @tabletap/api test && pnpm --filter @tabletap/api typecheck && pnpm --filter @tabletap/api lint && pnpm --filter @tabletap/api build`
Expected: tests PASS; `dist/main.js`, `dist/migrate.js`, `dist/seed.js` exist.
Also smoke the dev server without a database: `pnpm --filter @tabletap/api dev` must fail fast with `Invalid environment:` listing `DATABASE_URL` when `.env` is absent (copy `.env.example` to `.env` to make it start; with no Postgres running it starts and `/health` returns 503 — that is correct behaviour).
```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): fastify app factory, error envelope and /health

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 7: `apps/api` — better-auth for staff, principal resolution, `GET /api/me`

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `apps/api/src/auth.ts` (replace the stub), `src/plugins/auth.ts`, `src/plugins/principal.ts`, `src/routes/me.ts`, `src/routes/me.test.ts`, `src/plugins/auth.test.ts`
- Modify: `apps/api/src/server.ts`, `src/test/helpers.ts`

**Interfaces (produced):**
```ts
export function createAuth(opts: { db: Db; config: Config }): Auth   // better-auth instance
export type Auth = ReturnType<typeof createAuth>
// plugins
authPlugin      // decorates app.auth, mounts ALL /api/auth/* (+ POST /api/auth/sign-in/email rate-limited 10/min/IP)
principalPlugin // preHandler: request.principal = staff | guest | anonymous (guest branch completed in Task 8)
// test helpers
export function signInAs(app: FastifyInstance, email: string): Promise<string>   // returns "Cookie" header value
```
Verified facts (scratch test on 2026-09-02): sign-in returns 200 and a `better-auth.session_token` cookie; `getSession` returns `user.role`; POST requests need an `origin` header equal to `WEB_ORIGIN` (CSRF check); `disableSignUp` makes sign-up return 400.

- [x] **Step 1: Failing tests**

`apps/api/src/plugins/auth.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, TEST_DEMO_PASSWORD, createTestApp } from '../test/helpers';

describe('better-auth mount', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });

  const signIn = (payload: object) => ctx.app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { origin: TEST_CONFIG.WEB_ORIGIN }, payload });

  it('signs in a seeded staff member and sets a session cookie', async () => {
    const res = await signIn({ email: 'kitchen@littlefurnace.demo', password: TEST_DEMO_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.cookies.some((c) => c.name === 'better-auth.session_token')).toBe(true);
  });
  it('rejects a wrong password with 401', async () => {
    const res = await signIn({ email: 'kitchen@littlefurnace.demo', password: 'wrong' });
    expect(res.statusCode).toBe(401);
  });
  it('refuses sign-up', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/sign-up/email', headers: { origin: TEST_CONFIG.WEB_ORIGIN }, payload: { email: 'new@x.y', password: 'tabletap-demo', name: 'New' } });
    expect(res.statusCode).toBe(400);
  });
  it('rate-limits sign-in to 10 per minute per IP', async () => {
    const results: number[] = [];
    for (let i = 0; i < 11; i++) results.push((await signIn({ email: 'nobody@littlefurnace.demo', password: 'wrong' })).statusCode);
    expect(results.at(-1)).toBe(429);
    const last = await signIn({ email: 'nobody@littlefurnace.demo', password: 'wrong' });
    expect(last.json()).toEqual({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } });
  });
});
```
Order matters: the rate-limit test runs last in the file (same IP), and the earlier tests use fewer than 10 sign-ins.

`apps/api/src/routes/me.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MeResponseSchema } from '@tabletap/shared';
import { createTestApp, signInAs } from '../test/helpers';

describe('GET /api/me', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });

  it('returns 401 UNAUTHORIZED for anonymous', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' } });
  });
  it.each([
    ['admin@littlefurnace.demo', 'admin', 'Mara Quinn'],
    ['kitchen@littlefurnace.demo', 'kitchen', 'Theo Baptiste'],
    ['waiter@littlefurnace.demo', 'waiter', 'Jun Okafor'],
  ])('returns the staff principal for %s', async (email, role, name) => {
    const cookie = await signInAs(ctx.app, email);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = MeResponseSchema.parse(res.json());
    expect(body.principal).toMatchObject({ kind: 'staff', email, role, name });
  });
  it('treats a garbage session cookie as anonymous', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'better-auth.session_token=garbage' } });
    expect(res.statusCode).toBe(401);
  });
});
```

Add to `apps/api/src/test/helpers.ts`:
```ts
export async function signInAs(app: FastifyInstance, email: string, password = TEST_DEMO_PASSWORD): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/sign-in/email', headers: { origin: TEST_CONFIG.WEB_ORIGIN }, payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`sign-in failed for ${email}: ${res.statusCode} ${res.body}`);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
```

- [x] **Step 2: Run to verify they fail**

Run: `pnpm --filter @tabletap/api test` → FAIL (404 on `/api/auth/*`, `/api/me`).

- [x] **Step 3: Implement**

`apps/api/src/auth.ts`:
```ts
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { schema, type Db } from '@tabletap/db';
import { betterAuth } from 'better-auth';
import type { Config } from './config';

export function createAuth(opts: { db: Db; config: Config }) {
  const { config } = opts;
  return betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    basePath: '/api/auth',
    trustedOrigins: [config.WEB_ORIGIN],
    database: drizzleAdapter(opts.db, { provider: 'pg', usePlural: true, schema }),
    emailAndPassword: { enabled: true, disableSignUp: true },
    user: { additionalFields: { role: { type: 'string', required: true, defaultValue: 'waiter', input: false } } },
    advanced: { useSecureCookies: config.NODE_ENV === 'production' },
  });
}
export type Auth = ReturnType<typeof createAuth>;
```

`apps/api/src/plugins/auth.ts`:
```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { createAuth } from '../auth';

async function forward(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const url = new URL(request.url, `${request.protocol}://${request.headers.host ?? 'localhost'}`);
  const init: RequestInit = { method: request.method, headers: fromNodeHeaders(request.headers) };
  if (request.body !== undefined && request.body !== null) init.body = JSON.stringify(request.body);
  const response = await app.auth.handler(new Request(url, init));
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
  const text = await response.text();
  return reply.send(text.length > 0 ? text : null);
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate('auth', createAuth({ db: app.db, config: app.config }));
  const handler = (request: FastifyRequest, reply: FastifyReply) => forward(app, request, reply);
  app.route({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    config: { principal: false, rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler,
  });
  app.route({ method: ['GET', 'POST'], url: '/api/auth/*', config: { principal: false }, handler });
});
```

`apps/api/src/plugins/principal.ts` (guest branch is filled in Task 8; this version handles staff and anonymous):
```ts
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import { StaffRoleSchema, type Principal } from '@tabletap/shared';

const ANONYMOUS: Principal = { kind: 'anonymous' };

export const principalPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest<Principal, 'principal'>('principal', null as unknown as Principal);
  app.addHook('preHandler', async (request) => {
    request.principal = ANONYMOUS;
    if (request.routeOptions.config.principal === false) return;
    const session = await app.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (session) {
      const role = StaffRoleSchema.safeParse(session.user.role);
      if (role.success) {
        request.principal = { kind: 'staff', userId: session.user.id, email: session.user.email, name: session.user.name, role: role.data };
        return;
      }
    }
  });
});
```
(`decorateRequest` keeps the request shape stable; the hook always assigns before any handler runs, so the `null` default is never observed. The explicit type parameters and the cast are what `decorateRequest` needs when the declared property type is non-nullable.)

`apps/api/src/routes/me.ts`:
```ts
import type { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', async (request) => {
    if (request.principal.kind === 'anonymous') throw new AppError('UNAUTHORIZED', 401, 'Sign in to continue.');
    return { principal: request.principal };
  });
}
```

In `apps/api/src/server.ts`, after the rate-limit registration and before `healthRoutes`:
```ts
await app.register(authPlugin);
await app.register(principalPlugin);
await app.register(healthRoutes);
await app.register(meRoutes, { prefix: '/api' });
```
with imports `import { authPlugin } from './plugins/auth'; import { principalPlugin } from './plugins/principal'; import { meRoutes } from './routes/me';`.

- [x] **Step 4: Run tests, expect PASS, commit**

Run: `pnpm --filter @tabletap/api test && pnpm --filter @tabletap/api typecheck && pnpm --filter @tabletap/api lint` → PASS.
If `getSession` throws on the garbage cookie instead of returning null, wrap the call in `try/catch` and treat errors as anonymous (log at debug).
```bash
git add apps/api
git commit -m "feat(api): better-auth staff sign-in, principal resolution and /api/me

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `apps/api` — guest claim from QR token, guest sessions, audit log

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `apps/api/src/lib/guest-sessions.ts`, `src/lib/guest-sessions.test.ts`, `src/lib/audit.ts`, `src/routes/guest.ts`, `src/routes/guest.test.ts`
- Modify: `apps/api/src/plugins/principal.ts`, `src/server.ts`, `src/test/helpers.ts`

**Interfaces (produced):**
```ts
export const GUEST_COOKIE = 'tt_guest';
export function createGuestSession(db: Db, input: { tableId: string; ttlHours: number; now?: Date }): Promise<{ id: string; expiresAt: Date }>
export function findActiveGuestSession(db: Db, id: string, now?: Date): Promise<{ id: string; tableId: string; tableNumber: number; expiresAt: Date; lastSeenAt: Date } | null>
export function touchGuestSession(db: Db, id: string, input: { ttlHours: number; now?: Date }): Promise<Date>   // returns new expiresAt
export const SLIDE_AFTER_MS = 5 * 60 * 1000;
export function recordAudit(db: Db, entry: { actorType: 'user'|'guest'|'system'; actorId?: string | null; action: string; entityType: string; entityId?: string | null; payload?: Record<string, unknown> }): Promise<void>
// test helper
export function claimTable(app: FastifyInstance, db: Db, tableNumber: number): Promise<{ cookie: string; tableId: string }>
```

- [x] **Step 1: Failing tests for guest session helpers**

`apps/api/src/lib/guest-sessions.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../test/helpers';
import { createGuestSession, findActiveGuestSession, touchGuestSession } from './guest-sessions';

describe('guest sessions', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let tableId: string;
  const now = new Date('2026-09-02T10:00:00Z');
  beforeAll(async () => {
    ctx = await createTestApp();
    const [t] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, 3));
    tableId = t!.id;
  });
  afterAll(async () => { await ctx.close(); });

  it('creates a session that expires ttlHours later', async () => {
    const s = await createGuestSession(ctx.db, { tableId, ttlHours: 4, now });
    expect(s.expiresAt.toISOString()).toBe('2026-09-02T14:00:00.000Z');
    const found = await findActiveGuestSession(ctx.db, s.id, now);
    expect(found).toMatchObject({ id: s.id, tableId, tableNumber: 3 });
  });
  it('does not find an expired session', async () => {
    const s = await createGuestSession(ctx.db, { tableId, ttlHours: 1, now });
    expect(await findActiveGuestSession(ctx.db, s.id, new Date('2026-09-02T11:00:01Z'))).toBeNull();
  });
  it('touch extends expiry and updates lastSeenAt', async () => {
    const s = await createGuestSession(ctx.db, { tableId, ttlHours: 4, now });
    const later = new Date('2026-09-02T12:00:00Z');
    const expiresAt = await touchGuestSession(ctx.db, s.id, { ttlHours: 4, now: later });
    expect(expiresAt.toISOString()).toBe('2026-09-02T16:00:00.000Z');
    expect((await findActiveGuestSession(ctx.db, s.id, later))?.lastSeenAt.toISOString()).toBe('2026-09-02T12:00:00.000Z');
  });
  it('returns null for an unknown id', async () => {
    expect(await findActiveGuestSession(ctx.db, '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', now)).toBeNull();
  });
});
```

- [x] **Step 2: Run to verify it fails, then implement the helpers**

`apps/api/src/lib/guest-sessions.ts`:
```ts
import { and, eq, gt } from 'drizzle-orm';
import { schema, type Db } from '@tabletap/db';

export const GUEST_COOKIE = 'tt_guest';
export const SLIDE_AFTER_MS = 5 * 60 * 1000;

const hoursFrom = (now: Date, hours: number) => new Date(now.getTime() + hours * 3_600_000);

export async function createGuestSession(db: Db, input: { tableId: string; ttlHours: number; now?: Date }) {
  const now = input.now ?? new Date();
  const [row] = await db
    .insert(schema.guestSessions)
    .values({ tableId: input.tableId, expiresAt: hoursFrom(now, input.ttlHours), lastSeenAt: now, createdAt: now, updatedAt: now })
    .returning({ id: schema.guestSessions.id, expiresAt: schema.guestSessions.expiresAt });
  if (!row) throw new Error('guest session insert returned nothing');
  return row;
}

export async function findActiveGuestSession(db: Db, id: string, now: Date = new Date()) {
  const [row] = await db
    .select({
      id: schema.guestSessions.id,
      tableId: schema.guestSessions.tableId,
      tableNumber: schema.tables.number,
      expiresAt: schema.guestSessions.expiresAt,
      lastSeenAt: schema.guestSessions.lastSeenAt,
    })
    .from(schema.guestSessions)
    .innerJoin(schema.tables, eq(schema.tables.id, schema.guestSessions.tableId))
    .where(and(eq(schema.guestSessions.id, id), gt(schema.guestSessions.expiresAt, now)));
  return row ?? null;
}

export async function touchGuestSession(db: Db, id: string, input: { ttlHours: number; now?: Date }): Promise<Date> {
  const now = input.now ?? new Date();
  const expiresAt = hoursFrom(now, input.ttlHours);
  await db.update(schema.guestSessions).set({ lastSeenAt: now, expiresAt, updatedAt: now }).where(eq(schema.guestSessions.id, id));
  return expiresAt;
}
```
Non-uuid ids: guard `findActiveGuestSession` with a regex `^[0-9a-f-]{36}$` and return null early so Postgres never sees an invalid uuid literal.

`apps/api/src/lib/audit.ts`:
```ts
import { schema, type Db } from '@tabletap/db';

export interface AuditEntry {
  actorType: 'user' | 'guest' | 'system';
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}

export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(schema.auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    payload: entry.payload ?? {},
  });
}
```
Run the helper tests → PASS. Commit `feat(api): guest session and audit helpers`.

- [x] **Step 3: Failing tests for `POST /api/guest/claim` and the guest principal**

`apps/api/src/routes/guest.test.ts`:
```ts
import { eq } from 'drizzle-orm';
import { schema } from '@tabletap/db';
import { signTableToken } from '@tabletap/shared/server';
import { ClaimResponseSchema, MeResponseSchema } from '@tabletap/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, createTestApp } from '../test/helpers';

describe('POST /api/guest/claim', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let restaurantId: string;
  const tokenFor = async (tableNumber: number, extra: { secret?: string; ttlSeconds?: number; now?: Date } = {}) => {
    const [t] = await ctx.db.select().from(schema.tables).where(eq(schema.tables.number, tableNumber));
    return signTableToken({ tableId: t!.id, restaurantId, tableNumber }, { secret: extra.secret ?? TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: extra.ttlSeconds ?? 3600, now: extra.now });
  };
  const claim = (token: string) => ctx.app.inject({ method: 'POST', url: '/api/guest/claim', payload: { token } });

  beforeAll(async () => {
    ctx = await createTestApp();
    const [r] = await ctx.db.select().from(schema.restaurants);
    restaurantId = r!.id;
  });
  afterAll(async () => { await ctx.close(); });

  it('claims table 7, sets a signed httpOnly cookie and writes an audit row', async () => {
    const res = await claim(await tokenFor(7));
    expect(res.statusCode).toBe(200);
    const body = ClaimResponseSchema.parse(res.json());
    expect(body.table).toMatchObject({ number: 7, label: 'Table 7' });
    const cookie = res.cookies.find((c) => c.name === 'tt_guest');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/');
    const audit = await ctx.db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'guest.claimed'));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entityId).toBe(body.table.id);
  });
  it('makes /api/me report the guest principal', async () => {
    const res = await claim(await tokenFor(5));
    const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(MeResponseSchema.parse(me.json()).principal).toMatchObject({ kind: 'guest', tableNumber: 5 });
  });
  it('rejects a bad signature with 401 TOKEN_INVALID', async () => {
    const res = await claim(await tokenFor(7, { secret: 'another-secret-another-secret-12345678' }));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_INVALID');
  });
  it('rejects an expired token with 401 TOKEN_EXPIRED', async () => {
    const res = await claim(await tokenFor(7, { ttlSeconds: 60, now: new Date(Date.now() - 120_000) }));
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_EXPIRED');
  });
  it('rejects an inactive table with 404', async () => {
    await ctx.db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.number, 12));
    const res = await claim(await tokenFor(12));
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
  it('rejects a token for an unknown table with 404', async () => {
    const token = await signTableToken({ tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', restaurantId, tableNumber: 99 }, { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 });
    expect((await claim(token)).statusCode).toBe(404);
  });
  it('validates the body', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/guest/claim', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });
  it('treats a forged guest cookie as anonymous and clears it', async () => {
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: 'tt_guest=forged.value' } });
    expect(me.statusCode).toBe(401);
    const cleared = me.cookies.find((c) => c.name === 'tt_guest');
    expect(cleared?.value).toBe('');
  });
  it('rate-limits claims to 20 per minute per IP', async () => {
    const token = await tokenFor(1);
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await claim(token)).statusCode;
    expect(last).toBe(429);
  });
});
```
(This file performs 7 claims before the rate-limit test; 7 + 21 > 20, so the 429 arrives inside the loop — the assertion on the last call still holds.)

- [x] **Step 4: Run to verify they fail, then implement**

`apps/api/src/routes/guest.ts`:
```ts
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ClaimRequestSchema, ClaimResponseSchema } from '@tabletap/shared';
import { TableTokenVerifyError, verifyTableToken } from '@tabletap/shared/server';
import { schema } from '@tabletap/db';
import { recordAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { GUEST_COOKIE, createGuestSession } from '../lib/guest-sessions';

export async function guestRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/guest/claim',
    {
      config: { principal: false, rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: ClaimRequestSchema, response: { 200: ClaimResponseSchema } },
    },
    async (request, reply) => {
      let claims;
      try {
        claims = await verifyTableToken(request.body.token, { secret: app.config.TABLE_TOKEN_SECRET });
      } catch (err) {
        if (err instanceof TableTokenVerifyError) {
          throw new AppError(err.code, 401, err.code === 'TOKEN_EXPIRED' ? 'This QR code has expired. Ask staff for a new one.' : 'This QR code is not valid.');
        }
        throw err;
      }
      const [table] = await app.db
        .select({ id: schema.tables.id, number: schema.tables.number, label: schema.tables.label })
        .from(schema.tables)
        .where(and(eq(schema.tables.id, claims.tableId), eq(schema.tables.restaurantId, claims.restaurantId), eq(schema.tables.isActive, true)));
      if (!table) throw new AppError('NOT_FOUND', 404, 'This table is not available.');

      const session = await createGuestSession(app.db, { tableId: table.id, ttlHours: app.config.GUEST_SESSION_TTL_HOURS });
      reply.setCookie(GUEST_COOKIE, session.id, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: app.config.NODE_ENV === 'production',
        path: '/',
        expires: session.expiresAt,
      });
      await recordAudit(app.db, { actorType: 'guest', actorId: session.id, action: 'guest.claimed', entityType: 'table', entityId: table.id, payload: { tableNumber: table.number } });
      return { table, expiresAt: session.expiresAt.toISOString() };
    },
  );
}
```

Extend `apps/api/src/plugins/principal.ts` — after the staff branch, before falling through to anonymous:
```ts
const raw = request.cookies[GUEST_COOKIE];
if (raw) {
  const unsigned = request.unsignCookie(raw);
  if (unsigned.valid && unsigned.value) {
    const now = new Date();
    const guest = await findActiveGuestSession(app.db, unsigned.value, now);
    if (guest) {
      let expiresAt = guest.expiresAt;
      if (now.getTime() - guest.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
        expiresAt = await touchGuestSession(app.db, guest.id, { ttlHours: app.config.GUEST_SESSION_TTL_HOURS, now });
      }
      request.principal = { kind: 'guest', guestSessionId: guest.id, tableId: guest.tableId, tableNumber: guest.tableNumber, expiresAt: expiresAt.toISOString() };
      return;
    }
  }
  reply.clearCookie(GUEST_COOKIE, { path: '/' });
}
```
(The hook signature becomes `async (request, reply)`; import `GUEST_COOKIE, SLIDE_AFTER_MS, findActiveGuestSession, touchGuestSession` from `../lib/guest-sessions`.)

Register in `server.ts` after `meRoutes`: `await app.register(guestRoutes, { prefix: '/api' });`.

Add to `apps/api/src/test/helpers.ts`:
```ts
export async function claimTable(app: FastifyInstance, db: Db, tableNumber: number): Promise<{ cookie: string; tableId: string }> {
  const [restaurant] = await db.select().from(schema.restaurants);
  const [table] = await db.select().from(schema.tables).where(eq(schema.tables.number, tableNumber));
  if (!restaurant || !table) throw new Error(`table ${tableNumber} not seeded`);
  const token = await signTableToken({ tableId: table.id, restaurantId: restaurant.id, tableNumber }, { secret: TEST_CONFIG.TABLE_TOKEN_SECRET, ttlSeconds: 3600 });
  const res = await app.inject({ method: 'POST', url: '/api/guest/claim', payload: { token } });
  if (res.statusCode !== 200) throw new Error(`claim failed: ${res.statusCode} ${res.body}`);
  return { cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; '), tableId: table.id };
}
```
(imports: `eq` from drizzle-orm, `schema` from `@tabletap/db`, `signTableToken` from `@tabletap/shared/server`).

- [x] **Step 5: Sliding-expiry test, run everything, commit**

Append to `guest.test.ts`:
```ts
it('slides expiry when the guest is seen again after 5 minutes', async () => {
  const res = await claim(await tokenFor(2));
  const cookie = res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const before = ClaimResponseSchema.parse(res.json()).expiresAt;
  const [row] = await ctx.db.select().from(schema.guestSessions).orderBy(schema.guestSessions.createdAt);
  await ctx.db.update(schema.guestSessions).set({ lastSeenAt: new Date(Date.now() - 6 * 60_000) }).where(eq(schema.guestSessions.id, row!.id));
  const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
  const after = MeResponseSchema.parse(me.json()).principal;
  expect(after.kind).toBe('guest');
  if (after.kind === 'guest') expect(new Date(after.expiresAt).getTime()).toBeGreaterThan(new Date(before).getTime());
});
```
Place it before the rate-limit test. If `orderBy` picks the wrong row, select the row whose `id` equals the unsigned cookie value instead (`ctx.app.unsignCookie` is available on the instance via `@fastify/cookie`).

Run: `pnpm --filter @tabletap/api test && pnpm --filter @tabletap/api typecheck && pnpm --filter @tabletap/api lint` → PASS.
```bash
git add apps/api
git commit -m "feat(api): guest table claim from signed QR token with sliding sessions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 9: `apps/api` — RBAC guards and table routes

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development.

**Files:**
- Create: `apps/api/src/plugins/rbac.ts`, `src/plugins/rbac.test.ts`, `src/routes/tables.ts`, `src/routes/tables.test.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces (produced):**
```ts
export function roleOf(principal: Principal): Role | null                  // guest → 'guest', staff → role, anonymous → null
export function requireAuthenticated(): preHandlerAsyncHookHandler         // 401 UNAUTHORIZED for anonymous
export function requireAction(action: Action): preHandlerAsyncHookHandler  // 401 anonymous, 403 when !can(role, action)
export function requireStaff(...roles: StaffRole[]): preHandlerAsyncHookHandler
export function requireGuest(): preHandlerAsyncHookHandler
export function requireTableAccess(param: string): preHandlerAsyncHookHandler // staff via can(role,'tables.read'); guest only own tableId
```
Routes: `GET /api/tables` (staff), `GET /api/tables/:id` (staff any, guest own). `TableDto` from `@tabletap/shared`.

- [x] **Step 1: Failing tests**

`apps/api/src/plugins/rbac.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { claimTable, createTestApp, signInAs } from '../test/helpers';
import { requireAction, requireGuest, requireStaff, roleOf } from './rbac';

describe('rbac guards', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    ctx = await createTestApp({ ready: false });
    ctx.app.get('/g/admin-only', { preHandler: requireAction('menu.write') }, async () => ({ ok: true }));
    ctx.app.get('/g/staff', { preHandler: requireStaff('waiter', 'kitchen') }, async () => ({ ok: true }));
    ctx.app.get('/g/guest', { preHandler: requireGuest() }, async () => ({ ok: true }));
    await ctx.app.ready();
  });
  afterAll(async () => { await ctx.close(); });

  it('roleOf maps principals', () => {
    expect(roleOf({ kind: 'anonymous' })).toBeNull();
    expect(roleOf({ kind: 'guest', guestSessionId: 'g', tableId: 't', tableNumber: 1, expiresAt: 'x' })).toBe('guest');
    expect(roleOf({ kind: 'staff', userId: 'u', email: 'e', name: 'n', role: 'kitchen' })).toBe('kitchen');
  });
  it('anonymous gets 401 everywhere', async () => {
    for (const url of ['/g/admin-only', '/g/staff', '/g/guest']) {
      const res = await ctx.app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    }
  });
  it('requireAction consults the matrix', async () => {
    const admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    const waiter = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    expect((await ctx.app.inject({ method: 'GET', url: '/g/admin-only', headers: { cookie: admin } })).statusCode).toBe(200);
    const denied = await ctx.app.inject({ method: 'GET', url: '/g/admin-only', headers: { cookie: waiter } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toEqual({ code: 'FORBIDDEN', message: 'You do not have access to this.' });
  });
  it('requireStaff accepts listed roles only', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const admin = await signInAs(ctx.app, 'admin@littlefurnace.demo');
    const { cookie: guest } = await claimTable(ctx.app, ctx.db, 4);
    expect((await ctx.app.inject({ method: 'GET', url: '/g/staff', headers: { cookie: kitchen } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: '/g/staff', headers: { cookie: admin } })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: '/g/staff', headers: { cookie: guest } })).statusCode).toBe(403);
  });
  it('requireGuest accepts guests only', async () => {
    const { cookie: guest } = await claimTable(ctx.app, ctx.db, 4);
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    expect((await ctx.app.inject({ method: 'GET', url: '/g/guest', headers: { cookie: guest } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: 'GET', url: '/g/guest', headers: { cookie: kitchen } })).statusCode).toBe(403);
  });
});
```

`apps/api/src/routes/tables.test.ts`:
```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TableResponseSchema, TablesResponseSchema } from '@tabletap/shared';
import { claimTable, createTestApp, signInAs } from '../test/helpers';

describe('tables routes', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => { ctx = await createTestApp(); });
  afterAll(async () => { await ctx.close(); });

  it('GET /api/tables lists 12 tables for staff, ordered by number', async () => {
    const cookie = await signInAs(ctx.app, 'waiter@littlefurnace.demo');
    const res = await ctx.app.inject({ method: 'GET', url: '/api/tables', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { tables } = TablesResponseSchema.parse(res.json());
    expect(tables.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it('GET /api/tables is 401 for anonymous and 403 for guests', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/tables' })).statusCode).toBe(401);
    const { cookie } = await claimTable(ctx.app, ctx.db, 3);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/tables', headers: { cookie } })).statusCode).toBe(403);
  });
  it('GET /api/tables/:id lets a guest read only their own table', async () => {
    const own = await claimTable(ctx.app, ctx.db, 3);
    const other = await claimTable(ctx.app, ctx.db, 4);
    const ok = await ctx.app.inject({ method: 'GET', url: `/api/tables/${own.tableId}`, headers: { cookie: own.cookie } });
    expect(ok.statusCode).toBe(200);
    expect(TableResponseSchema.parse(ok.json()).table.number).toBe(3);
    const denied = await ctx.app.inject({ method: 'GET', url: `/api/tables/${other.tableId}`, headers: { cookie: own.cookie } });
    expect(denied.statusCode).toBe(403);
  });
  it('GET /api/tables/:id returns any table for staff and 404 for unknown', async () => {
    const cookie = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const { tableId } = await claimTable(ctx.app, ctx.db, 9);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/tables/${tableId}`, headers: { cookie } })).statusCode).toBe(200);
    const missing = await ctx.app.inject({ method: 'GET', url: '/api/tables/018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', headers: { cookie } });
    expect(missing.statusCode).toBe(404);
    const bad = await ctx.app.inject({ method: 'GET', url: '/api/tables/not-a-uuid', headers: { cookie } });
    expect(bad.statusCode).toBe(400);
  });
});
```

- [x] **Step 2: Run to verify they fail, then implement**

`apps/api/src/plugins/rbac.ts`:
```ts
import type { preHandlerAsyncHookHandler } from 'fastify';
import { can, type Action, type Principal, type Role, type StaffRole } from '@tabletap/shared';
import { AppError } from '../lib/errors';

export function roleOf(principal: Principal): Role | null {
  if (principal.kind === 'staff') return principal.role;
  if (principal.kind === 'guest') return 'guest';
  return null;
}

const unauthorized = () => new AppError('UNAUTHORIZED', 401, 'Sign in to continue.');
const forbidden = () => new AppError('FORBIDDEN', 403, 'You do not have access to this.');

export function requireAuthenticated(): preHandlerAsyncHookHandler {
  return async (request) => {
    if (request.principal.kind === 'anonymous') throw unauthorized();
  };
}

export function requireAction(action: Action): preHandlerAsyncHookHandler {
  return async (request) => {
    const role = roleOf(request.principal);
    if (role === null) throw unauthorized();
    if (!can(role, action)) throw forbidden();
  };
}

export function requireStaff(...roles: StaffRole[]): preHandlerAsyncHookHandler {
  return async (request) => {
    const p = request.principal;
    if (p.kind === 'anonymous') throw unauthorized();
    if (p.kind !== 'staff' || !roles.includes(p.role)) throw forbidden();
  };
}

export function requireGuest(): preHandlerAsyncHookHandler {
  return async (request) => {
    const p = request.principal;
    if (p.kind === 'anonymous') throw unauthorized();
    if (p.kind !== 'guest') throw forbidden();
  };
}

/** Staff pass through `tables.read`; a guest may only touch the table bound to their session. */
export function requireTableAccess(param: string): preHandlerAsyncHookHandler {
  return async (request) => {
    const p = request.principal;
    if (p.kind === 'anonymous') throw unauthorized();
    if (p.kind === 'staff') {
      if (!can(p.role, 'tables.read')) throw forbidden();
      return;
    }
    const requested = (request.params as Record<string, string | undefined>)[param];
    if (!can('guest', 'tables.read.own') || requested !== p.tableId) throw forbidden();
  };
}
```

`apps/api/src/routes/tables.ts`:
```ts
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { TableResponseSchema, TablesResponseSchema } from '@tabletap/shared';
import { schema } from '@tabletap/db';
import { AppError } from '../lib/errors';
import { requireStaff, requireTableAccess } from '../plugins/rbac';

const columns = { id: schema.tables.id, number: schema.tables.number, label: schema.tables.label, seats: schema.tables.seats, isActive: schema.tables.isActive };

export async function tablesRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get('/tables', { preHandler: requireStaff('waiter', 'kitchen', 'admin'), schema: { response: { 200: TablesResponseSchema } } }, async () => {
    const tables = await app.db.select(columns).from(schema.tables).orderBy(asc(schema.tables.number));
    return { tables };
  });
  r.get(
    '/tables/:id',
    { preHandler: requireTableAccess('id'), schema: { params: z.object({ id: z.uuid() }), response: { 200: TableResponseSchema } } },
    async (request) => {
      const [table] = await app.db.select(columns).from(schema.tables).where(eq(schema.tables.id, request.params.id));
      if (!table) throw new AppError('NOT_FOUND', 404, 'Table not found.');
      return { table };
    },
  );
}
```
Order of hooks: Fastify runs validation before `preHandler`, so `/tables/not-a-uuid` is 400 before any guard runs — the test expects exactly that.

Register in `server.ts` after `guestRoutes`: `await app.register(tablesRoutes, { prefix: '/api' });`.

- [x] **Step 3: Run the full API suite, commit**

Run: `pnpm --filter @tabletap/api test && pnpm --filter @tabletap/api typecheck && pnpm --filter @tabletap/api lint` → PASS.
```bash
git add apps/api
git commit -m "feat(api): RBAC guards and table routes with guest scoping

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then run `superpowers:requesting-code-review` for Tasks 6–9 together (the API surface) before moving on; fix Critical/Important findings via `superpowers:receiving-code-review`.

---

### Task 10: Brand guidelines for Little Furnace and primitive colour tokens

**REQUIRED SUB-SKILLS:** brand (or anthropic-skills:brand), ui-ux-pro-max (typography and palette searches). No code; TDD-exempt (documents), but the contrast checks below are mandatory acceptance criteria.

**Files:**
- Create: `docs/brand-guidelines.md`, `assets/design-tokens.json` (via sync), `scripts/sync-brand-to-tokens.cjs` (copy), `scripts/generate-tokens.cjs` (copy), `scripts/validate-tokens.cjs` (copy)

**Context:** spec section 3 (brand concept, voice, palette and typography direction). Template: `C:/Users/chitkid/.claude/skills/brand/templates/brand-guidelines-starter.md`. The sync script parses `| Primary Color | #RRGGBB |`, `| Secondary Color | #RRGGBB |`, `| Accent Color | #RRGGBB |` in the Quick Reference table and the `### Primary Colors`, `### Secondary Colors`, `### Accent Colors` tables (a row whose label contains "dark" or "light" sets the dark/light shade).

- [x] **Step 1: Copy the scripts into the repo**

```bash
mkdir -p scripts assets
cp "C:/Users/chitkid/.claude/skills/brand/scripts/sync-brand-to-tokens.cjs" scripts/
cp "C:/Users/chitkid/.claude/skills/design-system/scripts/generate-tokens.cjs" scripts/
cp "C:/Users/chitkid/.claude/skills/design-system/scripts/validate-tokens.cjs" scripts/
```
In `scripts/generate-tokens.cjs` change the dark-mode selector line `.dark {` to `.dark, [data-surface="kitchen"] {` (the only edit; add a comment `// TableTap: kitchen surface is the dark theme`).

- [x] **Step 2: Ground typography and palette with ui-ux-pro-max**

Run from the repo root and keep the outputs for the guidelines' rationale:
```bash
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "warm neighbourhood restaurant wood-fired flatbread" --domain typography -n 5
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "restaurant warm charcoal ember orange" --domain color -n 5
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "Bricolage Grotesque IBM Plex Sans" --domain google-fonts -n 5
```
Zero results are reported in the guidelines as "defaults used", never invented.

- [x] **Step 3: Write `docs/brand-guidelines.md`**

Follow the template's section order (Quick Reference, 1. Color Palette with Primary/Secondary/Accent/Neutral/Semantic tables and Accessibility, 2. Typography, 3. Logo Usage, then Voice). Content requirements:

- Title: `# Little Furnace — Brand Guidelines v1.0` with one paragraph: product TableTap, tenant Little Furnace, concept from spec section 3.
- Quick Reference rows: `Primary Color` = ember, `Secondary Color` = olive, `Accent Color` = ink, `Primary Font`, `Voice`.
- Starting palette (adjust lightness only if a contrast check below fails; record final values):
  - Ember (primary): base `#C23E18`, dark `#9E3112`, light `#F0663D`.
  - Olive (secondary): base `#6B7A3C`, dark `#4F5B2C`, light `#9CAB63`.
  - Ink (accent): base `#1C1917`, dark `#151311`, light `#3D3631`.
  - Neutral (guest surface): background `#F6F1E8` oat, surface `#FFFDF9`, sunken `#EDE6DA`, text `#1C1917`, muted text `#6F675F`, border `#E0D8CB`.
  - Neutral (kitchen surface, dark): background `#151311`, surface `#1C1917`, raised `#292420`, text `#F6F1E8`, muted text `#B8AFA5`, border `#3D3631`.
  - Semantic statuses (light / dark): placed `#3B6EA5` / `#8AB4E8`, paid `#1F7A6D` / `#6CC7B5`, cooking `#B7791F` / `#F0B84B`, ready `#2F8A3E` / `#7BD389`, served `#6F675F` / `#B8AFA5`, cancelled `#B3261E` / `#F28B82`. Timer: ok = ready colour, warn = cooking colour, late = cancelled colour.
- Accessibility section: state the pairs that must pass WCAG AA and their measured ratios (compute with the contrast helper from Task 12 once it exists, or with any WCAG calculator now): text on background ≥ 4.5, muted text on background ≥ 4.5, white (`#FFFDF9`) on ember base ≥ 4.5, ember light on kitchen background ≥ 4.5, every status colour on its surface ≥ 3.0.
- Typography: display `Bricolage Grotesque` (headings, prices on the guest surface), text `IBM Plex Sans` (body, tabular numerals via `font-variant-numeric: tabular-nums`), mono `IBM Plex Mono` (kitchen timers). Type scale table per the template (desktop/mobile) with kitchen body ≥ 20 px. If the searches in Step 2 recommend a different pairing with a stated reason, use it and record the reason; Playfair + Inter is disallowed.
- Logo Usage: "Wordmark only in M1; SVG logo arrives in M6" (no fake file names).
- Voice: the three principles with the sample copy from spec section 3, the forbidden list, and a vocabulary table (`Order sent to the kitchen` / `Ready when you are` / `About 12 min`; never `soon`, never emoji).

- [x] **Step 4: Sync primitives and fix the brand name**

```bash
pnpm brand:sync
```
Expected: `assets/design-tokens.json` gains `primitive.color.ember`, `primitive.color.olive`, `primitive.color.ink` scales (50–900). Then edit the file: set `"brand": "TableTap / Little Furnace"` (the script writes a placeholder brand string). If the script also created `assets/design-tokens.css`, delete it.

- [x] **Step 5: Commit**

```bash
git add docs/brand-guidelines.md assets/design-tokens.json scripts/
git commit -m "docs(brand): Little Furnace brand guidelines and primitive colour tokens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Design system files via ui-ux-pro-max (three surfaces)

**REQUIRED SUB-SKILLS:** ui-ux-pro-max (or anthropic-skills:ui-ux-pro-max). TDD-exempt (documents).

**Files:**
- Create: `design-system/tabletap/MASTER.md`, `design-system/tabletap/pages/kitchen.md`, `design-system/tabletap/pages/admin.md`, `docs/design/ux-notes.md`

**Context:** `docs/brand-guidelines.md` (Task 10) is the source of truth; MASTER and pages must agree with it. Spec section 11.

- [x] **Step 1: Generate and persist**

Run from the repo root (`--output-dir .` writes `design-system/tabletap/...` because the project name slugs to `tabletap`):
```bash
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "restaurant qr ordering mobile wood-fired warm neighbourhood ember charcoal oat" --design-system --persist -p "TableTap" --output-dir . --variance 6 --motion 5 --density 4
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "kitchen display board dark high-contrast" --design-system --persist -p "TableTap" --output-dir . --page kitchen --variance 4 --motion 3 --density 6
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "restaurant admin dashboard analytics" --design-system --persist -p "TableTap" --output-dir . --page admin --variance 3 --motion 2 --density 8
```
If the first command reports MASTER.md already exists, re-run it with `--force` once (fresh repo, nothing to keep).

- [x] **Step 2: Supplementary UX searches**

```bash
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "touch target size mobile ordering" --domain ux -n 5
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "loading state skeleton empty state error state" --domain ux -n 5
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "aria-live region real-time updates" --domain ux -n 5
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "app router forms" --stack nextjs -n 5
python "C:/Users/chitkid/.claude/skills/ui-ux-pro-max/scripts/search.py" "form dialog accessible" --stack shadcn -n 5
```
Write the results into `docs/design/ux-notes.md` grouped by heading (Touch targets, States, Live regions, Next.js, shadcn). Zero results → write "defaults used" under that heading.

- [x] **Step 3: Reconcile with the brand**

Open MASTER.md and both page files. Wherever the generated palette, fonts or spacing contradict `docs/brand-guidelines.md`, edit the design-system files (not the brand): colours to the brand palette, fonts to the brand pairing, kitchen body size ≥ 20 px in `pages/kitchen.md`, admin density from the `--density 8` spacing table. Add a top note to MASTER.md: "Source of truth for identity: docs/brand-guidelines.md; token values: assets/design-tokens.json."

- [x] **Step 4: Commit**

```bash
git add design-system docs/design/ux-notes.md
git commit -m "docs(design): ui-ux-pro-max design system for guest, kitchen and admin surfaces

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 12: Three-layer tokens, `packages/ui` (contrast test, theme, shadcn base)

**REQUIRED SUB-SKILLS:** design-system (or anthropic-skills:design-system), ui-styling (shadcn setup), superpowers:test-driven-development (contrast helper and tokens contract test).

**Files:**
- Modify: `assets/design-tokens.json` (complete semantic + component layers + `dark`)
- Create: `packages/ui/tokens.css` (generated, committed), `packages/ui/theme.css`, `packages/ui/src/lib/contrast.ts`, `src/lib/contrast.test.ts`, `src/tokens.test.ts`, `src/lib/utils.ts`, `src/components/{button,input,label,card,badge}.tsx`, `packages/ui/components.json`, `docs/design/components.md`
- Modify: `packages/ui/src/index.ts`, `packages/ui/package.json`

**Context:** `docs/brand-guidelines.md`, `design-system/tabletap/MASTER.md`, `design-system/tabletap/pages/kitchen.md`, `design-system/tabletap/pages/admin.md`. Generator facts: `primitive.*` → `--primitive-<path>`; `semantic.*` and `component.*` → `--<path>` (no prefix); `dark.semantic.*` → same names under `.dark, [data-surface="kitchen"]`; values may reference other tokens as `{primitive.color.ember.600}`.

**Interfaces (produced):**
```ts
export function relativeLuminance(hex: string): number
export function contrastRatio(hexA: string, hexB: string): number   // ≥ 1, symmetric
export function cn(...inputs: ClassValue[]): string
export { Button, buttonVariants, Input, Label, Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Badge, badgeVariants }
```
CSS custom properties consumed by the apps (shadcn names): `--background --foreground --card --card-foreground --popover --popover-foreground --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive --border --input --ring --radius --radius-sm --radius-lg --status-placed --status-paid --status-cooking --status-ready --status-served --status-cancelled --timer-ok --timer-warn --timer-late --font-display --font-text --font-mono --kitchen-body-size`.

- [x] **Step 1: Failing contrast tests**

`packages/ui/src/lib/contrast.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('contrast', () => {
  it('computes luminance of black and white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });
  it('black on white is 21:1 and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 2);
  });
  it('matches a known WCAG example', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
  });
  it('accepts 3-digit hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 2);
  });
});
```

- [x] **Step 2: Run to verify it fails, then implement**

`packages/ui/src/lib/contrast.ts`:
```ts
function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
```
Run tests → PASS. Commit `feat(ui): WCAG contrast helper`.

- [x] **Step 3: Failing tokens contract test**

`packages/ui/src/tokens.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './lib/contrast';

type Token = { $value: string };
type Tree = { [k: string]: Tree | Token };
const tokens = JSON.parse(readFileSync(fileURLToPath(new URL('../../../assets/design-tokens.json', import.meta.url)), 'utf8')) as Tree;

function get(path: string): string {
  const node = path.split('.').reduce<Tree | Token | undefined>((acc, key) => (acc && !('$value' in acc) ? acc[key] : undefined), tokens);
  if (!node || !('$value' in node)) throw new Error(`token not found: ${path}`);
  const v = node.$value;
  const ref = /^\{(.+)\}$/.exec(v);
  return ref ? get(ref[1]!) : v;
}
const sem = (name: string) => get(`semantic.${name}`);
const dark = (name: string) => get(`dark.semantic.${name}`);

describe('design tokens', () => {
  it('resolve every semantic and dark reference', () => {
    const walk = (tree: Tree, prefix: string) => {
      for (const [k, v] of Object.entries(tree)) {
        if ('$value' in v) expect(() => get(`${prefix}${k}`), `${prefix}${k}`).not.toThrow();
        else walk(v as Tree, `${prefix}${k}.`);
      }
    };
    walk(tokens.semantic as Tree, 'semantic.');
    walk((tokens.dark as Tree).semantic as Tree, 'dark.semantic.');
    walk(tokens.component as Tree, 'component.');
  });
  it('guest surface passes WCAG AA', () => {
    expect(contrastRatio(sem('foreground'), sem('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(sem('muted-foreground'), sem('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(sem('primary-foreground'), sem('primary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(sem('card-foreground'), sem('card'))).toBeGreaterThanOrEqual(4.5);
    for (const s of ['placed', 'paid', 'cooking', 'ready', 'served', 'cancelled']) expect(contrastRatio(sem(`status-${s}`), sem('background')), s).toBeGreaterThanOrEqual(3);
  });
  it('kitchen surface passes WCAG AA', () => {
    expect(contrastRatio(dark('foreground'), dark('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark('muted-foreground'), dark('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark('primary'), dark('background'))).toBeGreaterThanOrEqual(4.5);
    for (const s of ['placed', 'paid', 'cooking', 'ready', 'served', 'cancelled']) expect(contrastRatio(dark(`status-${s}`), dark('background')), s).toBeGreaterThanOrEqual(3);
    for (const t of ['ok', 'warn', 'late']) expect(contrastRatio(dark(`timer-${t}`), dark('background')), t).toBeGreaterThanOrEqual(3);
  });
  it('kitchen body size is at least 20px', () => {
    expect(parseFloat(sem('kitchen-body-size'))).toBeGreaterThanOrEqual(1.25); // rem
  });
});
```

- [x] **Step 4: Run to verify it fails, then complete `assets/design-tokens.json`**

Keep the synced primitive colour scales from Task 10 and add the rest. Shape (fill every value; hex from `docs/brand-guidelines.md`):
```json
{
  "brand": "TableTap / Little Furnace",
  "primitive": {
    "color": {
      "ember": { "50": {"$value": "#…"}, "…": {}, "900": {"$value": "#…"} },
      "olive": { "…": {} },
      "ink": { "…": {} },
      "oat": { "bg": {"$value": "#F6F1E8"}, "surface": {"$value": "#FFFDF9"}, "sunken": {"$value": "#EDE6DA"}, "line": {"$value": "#E0D8CB"}, "muted": {"$value": "#6F675F"} },
      "night": { "bg": {"$value": "#151311"}, "surface": {"$value": "#1C1917"}, "raised": {"$value": "#292420"}, "line": {"$value": "#3D3631"}, "fg": {"$value": "#F6F1E8"}, "muted": {"$value": "#B8AFA5"} },
      "status": { "placed": {"$value": "#3B6EA5"}, "placed-dark": {"$value": "#8AB4E8"}, "paid": {"$value": "#1F7A6D"}, "paid-dark": {"$value": "#6CC7B5"}, "cooking": {"$value": "#B7791F"}, "cooking-dark": {"$value": "#F0B84B"}, "ready": {"$value": "#2F8A3E"}, "ready-dark": {"$value": "#7BD389"}, "served": {"$value": "#6F675F"}, "served-dark": {"$value": "#B8AFA5"}, "cancelled": {"$value": "#B3261E"}, "cancelled-dark": {"$value": "#F28B82"} }
    },
    "space": { "1": {"$value": "0.25rem"}, "2": {"$value": "0.5rem"}, "3": {"$value": "0.75rem"}, "4": {"$value": "1rem"}, "6": {"$value": "1.5rem"}, "8": {"$value": "2rem"}, "12": {"$value": "3rem"} },
    "radius": { "sm": {"$value": "0.375rem"}, "md": {"$value": "0.625rem"}, "lg": {"$value": "1rem"}, "full": {"$value": "9999px"} },
    "font": { "display": {"$value": "'Bricolage Grotesque', 'Segoe UI', system-ui, sans-serif"}, "text": {"$value": "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif"}, "mono": {"$value": "'IBM Plex Mono', ui-monospace, Menlo, monospace"} },
    "size": { "14": {"$value": "0.875rem"}, "16": {"$value": "1rem"}, "18": {"$value": "1.125rem"}, "20": {"$value": "1.25rem"}, "24": {"$value": "1.5rem"}, "32": {"$value": "2rem"}, "40": {"$value": "2.5rem"} },
    "weight": { "regular": {"$value": "400"}, "medium": {"$value": "500"}, "semibold": {"$value": "600"}, "bold": {"$value": "700"} },
    "leading": { "tight": {"$value": "1.15"}, "ui": {"$value": "1.4"}, "text": {"$value": "1.6"} },
    "shadow": { "sm": {"$value": "0 1px 2px rgba(28, 25, 23, 0.08)"}, "md": {"$value": "0 6px 20px rgba(28, 25, 23, 0.12)"} },
    "duration": { "fast": {"$value": "120ms"}, "base": {"$value": "180ms"} }
  },
  "semantic": {
    "background": {"$value": "{primitive.color.oat.bg}"},
    "foreground": {"$value": "{primitive.color.ink.500}"},
    "card": {"$value": "{primitive.color.oat.surface}"},
    "card-foreground": {"$value": "{primitive.color.ink.500}"},
    "popover": {"$value": "{primitive.color.oat.surface}"},
    "popover-foreground": {"$value": "{primitive.color.ink.500}"},
    "primary": {"$value": "{primitive.color.ember.500}"},
    "primary-foreground": {"$value": "{primitive.color.oat.surface}"},
    "secondary": {"$value": "{primitive.color.oat.sunken}"},
    "secondary-foreground": {"$value": "{primitive.color.ink.500}"},
    "muted": {"$value": "{primitive.color.oat.sunken}"},
    "muted-foreground": {"$value": "{primitive.color.oat.muted}"},
    "accent": {"$value": "{primitive.color.olive.500}"},
    "accent-foreground": {"$value": "{primitive.color.oat.surface}"},
    "destructive": {"$value": "{primitive.color.status.cancelled}"},
    "border": {"$value": "{primitive.color.oat.line}"},
    "input": {"$value": "{primitive.color.oat.line}"},
    "ring": {"$value": "{primitive.color.ember.500}"},
    "radius": {"$value": "{primitive.radius.md}"},
    "radius-sm": {"$value": "{primitive.radius.sm}"},
    "radius-lg": {"$value": "{primitive.radius.lg}"},
    "status-placed": {"$value": "{primitive.color.status.placed}"},
    "status-paid": {"$value": "{primitive.color.status.paid}"},
    "status-cooking": {"$value": "{primitive.color.status.cooking}"},
    "status-ready": {"$value": "{primitive.color.status.ready}"},
    "status-served": {"$value": "{primitive.color.status.served}"},
    "status-cancelled": {"$value": "{primitive.color.status.cancelled}"},
    "timer-ok": {"$value": "{primitive.color.status.ready}"},
    "timer-warn": {"$value": "{primitive.color.status.cooking}"},
    "timer-late": {"$value": "{primitive.color.status.cancelled}"},
    "font-display": {"$value": "{primitive.font.display}"},
    "font-text": {"$value": "{primitive.font.text}"},
    "font-mono": {"$value": "{primitive.font.mono}"},
    "kitchen-body-size": {"$value": "{primitive.size.20}"},
    "shadow-sm": {"$value": "{primitive.shadow.sm}"},
    "shadow-md": {"$value": "{primitive.shadow.md}"}
  },
  "dark": {
    "semantic": {
      "background": {"$value": "{primitive.color.night.bg}"},
      "foreground": {"$value": "{primitive.color.night.fg}"},
      "card": {"$value": "{primitive.color.night.surface}"},
      "card-foreground": {"$value": "{primitive.color.night.fg}"},
      "popover": {"$value": "{primitive.color.night.raised}"},
      "popover-foreground": {"$value": "{primitive.color.night.fg}"},
      "primary": {"$value": "{primitive.color.ember.300}"},
      "primary-foreground": {"$value": "{primitive.color.night.bg}"},
      "secondary": {"$value": "{primitive.color.night.raised}"},
      "secondary-foreground": {"$value": "{primitive.color.night.fg}"},
      "muted": {"$value": "{primitive.color.night.raised}"},
      "muted-foreground": {"$value": "{primitive.color.night.muted}"},
      "accent": {"$value": "{primitive.color.olive.300}"},
      "accent-foreground": {"$value": "{primitive.color.night.bg}"},
      "destructive": {"$value": "{primitive.color.status.cancelled-dark}"},
      "border": {"$value": "{primitive.color.night.line}"},
      "input": {"$value": "{primitive.color.night.line}"},
      "ring": {"$value": "{primitive.color.ember.300}"},
      "status-placed": {"$value": "{primitive.color.status.placed-dark}"},
      "status-paid": {"$value": "{primitive.color.status.paid-dark}"},
      "status-cooking": {"$value": "{primitive.color.status.cooking-dark}"},
      "status-ready": {"$value": "{primitive.color.status.ready-dark}"},
      "status-served": {"$value": "{primitive.color.status.served-dark}"},
      "status-cancelled": {"$value": "{primitive.color.status.cancelled-dark}"},
      "timer-ok": {"$value": "{primitive.color.status.ready-dark}"},
      "timer-warn": {"$value": "{primitive.color.status.cooking-dark}"},
      "timer-late": {"$value": "{primitive.color.status.cancelled-dark}"}
    }
  },
  "component": {
    "button": { "height": {"$value": "2.75rem"}, "height-sm": {"$value": "2.25rem"}, "padding-x": {"$value": "{primitive.space.4}"}, "radius": {"$value": "{semantic.radius}"}, "font-weight": {"$value": "{primitive.weight.semibold}"} },
    "dish-card": { "radius": {"$value": "{semantic.radius-lg}"}, "padding": {"$value": "{primitive.space.3}"}, "gap": {"$value": "{primitive.space.3}"}, "image-ratio": {"$value": "4 / 3"}, "shadow": {"$value": "{semantic.shadow-sm}"} },
    "order-card": { "radius": {"$value": "{semantic.radius-lg}"}, "padding": {"$value": "{primitive.space.4}"}, "border-width": {"$value": "2px"}, "title-size": {"$value": "{primitive.size.24}"} },
    "status-badge": { "height": {"$value": "1.75rem"}, "padding-x": {"$value": "{primitive.space.3}"}, "radius": {"$value": "{primitive.radius.full}"}, "font-size": {"$value": "{primitive.size.14}"}, "font-weight": {"$value": "{primitive.weight.semibold}"} },
    "cart-counter": { "size": {"$value": "1.5rem"}, "radius": {"$value": "{primitive.radius.full}"}, "font-size": {"$value": "{primitive.size.14}"}, "bg": {"$value": "{semantic.primary}"}, "fg": {"$value": "{semantic.primary-foreground}"} }
  }
}
```
The `ember.500`, `ember.300`, `ink.500`, `olive.500`, `olive.300` keys must exist in the synced scales; if the sync produced different keys, point the references at the keys that hold the brand base (`#C23E18`), light (`#F0663D`) and dark values. Adjust any colour that fails the contrast test by moving lightness only, then update `docs/brand-guidelines.md` to the final value.

- [x] **Step 5: Generate CSS and write `theme.css`**

```bash
pnpm tokens
```
Expected: `packages/ui/tokens.css` with `:root` blocks and a `.dark, [data-surface="kitchen"]` block.

`packages/ui/theme.css`:
```css
/* Surface aliases and Tailwind theme. Values live in tokens.css (generated from assets/design-tokens.json). */
@custom-variant dark (&:where(.dark, .dark *, [data-surface="kitchen"], [data-surface="kitchen"] *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-status-placed: var(--status-placed);
  --color-status-paid: var(--status-paid);
  --color-status-cooking: var(--status-cooking);
  --color-status-ready: var(--status-ready);
  --color-status-served: var(--status-served);
  --color-status-cancelled: var(--status-cancelled);
  --color-timer-ok: var(--timer-ok);
  --color-timer-warn: var(--timer-warn);
  --color-timer-late: var(--timer-late);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius);
  --radius-lg: var(--radius-lg);
  --radius-xl: calc(var(--radius-lg) * 1.5);
  --font-display: var(--font-display);
  --font-sans: var(--font-text);
  --font-mono: var(--font-mono);
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
}

/* Kitchen: dark tokens come from tokens.css; here only type size. */
[data-surface="kitchen"] {
  font-size: var(--kitchen-body-size);
  color-scheme: dark;
}
/* Admin: denser spacing scale (Tailwind multiplies every spacing utility by --spacing). */
[data-surface="admin"] {
  --spacing: 0.2rem;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-text);
  font-variant-numeric: tabular-nums;
}
```

- [x] **Step 6: shadcn base components in `packages/ui`**

```bash
pnpm --filter @tabletap/ui add -E react@19.2.8 react-dom@19.2.8 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.6.0 lucide-react@1.39.0 @radix-ui/react-slot@1 @radix-ui/react-label@2
pnpm --filter @tabletap/ui add -DE @types/react@19.2.18 @types/react-dom@19.2.5 tailwindcss@4.3.3
```
`packages/ui/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```
`packages/ui/components.json`:
```json
{ "$schema": "https://ui.shadcn.com/schema.json", "style": "new-york", "rsc": true, "tsx": true,
  "tailwind": { "config": "", "css": "theme.css", "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components", "lib": "@/lib" } }
```
Add to `packages/ui/tsconfig.json` compilerOptions: `"paths": { "@/*": ["./src/*"] }`. Then:
```bash
cd packages/ui && pnpm dlx shadcn@latest add button input label card badge --yes && cd ../..
```
The CLI writes into `packages/ui/src/components/`. Then in every generated file replace `@/lib/utils` with the relative import `../lib/utils` (consumers must not need the alias) and remove any `data-slot`-irrelevant leftovers. If the CLI refuses the layout, fetch each component from the registry (`https://ui.shadcn.com/r/styles/new-york-v4/<name>.json`, field `files[0].content`) and save it under `src/components/<name>.tsx` with the same import fix. Generated components are TDD-exempt.

Restyle only through tokens: the button's default `rounded-md` already maps to `--radius`; set the default size class to `h-11` (44 px) and the small size to `h-9`. No hex, no px literals.

`packages/ui/src/index.ts`:
```ts
export { cn } from './lib/utils';
export { contrastRatio, relativeLuminance } from './lib/contrast';
export * from './components/button';
export * from './components/input';
export * from './components/label';
export * from './components/card';
export * from './components/badge';
```

- [x] **Step 7: Component state specs**

`docs/design/components.md`: for each of `button`, `dish-card`, `order-card`, `status-badge`, `cart-counter` a table with rows `default`, `hover`, `active`, `focus-visible`, `disabled`, `loading` and columns `background`, `foreground`, `border`, `elevation`, `motion` — every cell a token name (`--primary`, `--primary-foreground`, `--ring`, `--muted`, `--shadow-sm`, `--duration-fast`) or "none". Note that `dish-card`, `order-card` and `cart-counter` are specified here and implemented in M2/M3; `loading` for button = spinner icon + `aria-busy`, label stays; `status-badge` background = `--status-<status>` with white/ink foreground chosen by the contrast test; kitchen `order-card` border = `--timer-ok|warn|late` by age (5/10 min thresholds). Reference `docs/design/motion-spec.md` as "M6; no motion in M1".

- [x] **Step 8: Run, validate, commit**

Run: `pnpm --filter @tabletap/ui test && pnpm --filter @tabletap/ui typecheck && pnpm --filter @tabletap/ui lint && pnpm validate-tokens`
Expected: tests PASS (contrast + tokens contract); validate-tokens reports 0 issues (nothing in `apps/` yet).
```bash
git add assets packages/ui docs/design/components.md
git commit -m "feat(ui): three-layer design tokens, theme and shadcn base components

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: `apps/web` — Next.js shell, rewrite proxy, `/login`

**REQUIRED SUB-SKILLS:** ui-styling (or anthropic-skills:ui-styling), ui-ux-pro-max (audit: touch ≥ 44 px, labels, live region, keyboard), superpowers:test-driven-development (login form logic).

**Files:**
- Create: `apps/web/next.config.ts`, `postcss.config.mjs`, `eslint.config.js`, `vitest.setup.ts`, `app/layout.tsx`, `app/globals.css`, `app/login/page.tsx`, `components/login-form.tsx`, `components/login-form.test.tsx`, `lib/auth-client.ts`, `public/.gitkeep`
- Modify: `apps/web/package.json`, `apps/web/vitest.config.ts`

**Context:** `docs/brand-guidelines.md` (fonts, voice), `design-system/tabletap/MASTER.md`, `packages/ui/tokens.css`, `packages/ui/theme.css`, `docs/design/components.md`, `docs/design/ux-notes.md`. Motion: none in M1 (`docs/design/motion-spec.md` is M6).

**Interfaces:**
- Consumes `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`, `GET /api/auth/get-session` through the rewrite; better-auth React client.
- Produces `LoginForm({ client?: AuthClientLike })` where
```ts
export interface AuthClientLike {
  signIn: { email(input: { email: string; password: string }): Promise<{ error: { status?: number; message?: string } | null }> };
  signOut(): Promise<unknown>;
  useSession(): { data: { user: { name: string; role?: string } } | null; isPending: boolean; refetch?: () => void };
}
```

- [x] **Step 1: Dependencies and config**

```bash
pnpm --filter @tabletap/web add -E next@16.3.4 react@19.2.8 react-dom@19.2.8 better-auth@1.7.2 "@tabletap/ui@workspace:*" "@tabletap/shared@workspace:*"
pnpm --filter @tabletap/web add -DE @types/react@19.2.18 @types/react-dom@19.2.5 tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 postcss@8.5.26 eslint-config-next@16.3.4 @vitejs/plugin-react@6.1.1 jsdom@30.0.1 @testing-library/react@16.3.3 @testing-library/jest-dom@7.0.1 @testing-library/user-event@14.6.7
```

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from 'next';
import path from 'node:path';

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  transpilePackages: ['@tabletap/ui', '@tabletap/shared'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
  async redirects() {
    return [{ source: '/', destination: '/login', permanent: false }];
  },
};
export default nextConfig;
```
`apps/web/postcss.config.mjs`: `export default { plugins: { '@tailwindcss/postcss': {} } };`

`apps/web/eslint.config.js`:
```js
import nextVitals from 'eslint-config-next/core-web-vitals';
import base from '../../eslint.config.js';

export default [
  ...base,
  ...nextVitals,
  { ignores: ['.next/**', 'next-env.d.ts'] },
  { rules: { 'no-restricted-imports': ['error', { patterns: [{ group: ['@tabletap/shared/server'], message: 'Server-only: never import token signing into the web app.' }] }] } },
];
```
If `eslint-config-next/core-web-vitals` is not an export of the installed version, use the export path listed under `exports` in `node_modules/eslint-config-next/package.json`.

`apps/web/vitest.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
export default defineConfig({ plugins: [react()], test: { environment: 'jsdom', include: ['**/*.test.{ts,tsx}'], exclude: ['node_modules', '.next'], setupFiles: ['./vitest.setup.ts'] } });
```
`apps/web/vitest.setup.ts`: `import '@testing-library/jest-dom/vitest';`

- [x] **Step 2: Failing login form tests**

`apps/web/components/login-form.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginForm, type AuthClientLike } from './login-form';

function makeClient(over: Partial<AuthClientLike> = {}): AuthClientLike {
  return {
    signIn: { email: vi.fn(async () => ({ error: null })) },
    signOut: vi.fn(async () => undefined),
    useSession: () => ({ data: null, isPending: false }),
    ...over,
  };
}

describe('LoginForm', () => {
  it('submits email and password', async () => {
    const client = makeClient();
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'kitchen@littlefurnace.demo');
    await userEvent.type(screen.getByLabelText('Password'), 'tabletap-demo');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(client.signIn.email).toHaveBeenCalledWith({ email: 'kitchen@littlefurnace.demo', password: 'tabletap-demo' });
  });
  it('shows the brand-voice message on a 401', async () => {
    const client = makeClient({ signIn: { email: vi.fn(async () => ({ error: { status: 401, message: 'Invalid' } })) } });
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('status');
    expect(alert).toHaveTextContent("That email and password don't match.");
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', alert.id);
  });
  it('shows a network message on other failures', async () => {
    const client = makeClient({ signIn: { email: vi.fn(async () => { throw new Error('offline'); }) } });
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('status')).toHaveTextContent("Can't reach the server. Check the connection and try again.");
  });
  it('disables the button while submitting', async () => {
    let resolve!: (v: { error: null }) => void;
    const client = makeClient({ signIn: { email: vi.fn(() => new Promise((r) => { resolve = r; })) } });
    render(<LoginForm client={client} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    resolve({ error: null });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
  });
  it('renders the signed-in state with a sign out button', async () => {
    const client = makeClient({ useSession: () => ({ data: { user: { name: 'Theo Baptiste', role: 'kitchen' } }, isPending: false }) });
    render(<LoginForm client={client} />);
    expect(screen.getByText('Signed in as Theo Baptiste (kitchen)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(client.signOut).toHaveBeenCalled();
  });
});
```

- [x] **Step 3: Run to verify it fails, then implement**

`apps/web/lib/auth-client.ts`:
```ts
'use client';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { role: { type: 'string' } } })],
});
```

`apps/web/components/login-form.tsx`:
```tsx
'use client';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tabletap/ui';
import { useId, useState, type FormEvent } from 'react';
import { authClient } from '../lib/auth-client';

export interface AuthClientLike {
  signIn: { email(input: { email: string; password: string }): Promise<{ error: { status?: number; message?: string } | null }> };
  signOut(): Promise<unknown>;
  useSession(): { data: { user: { name: string; role?: string } } | null; isPending: boolean; refetch?: () => void };
}

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string };

export function LoginForm({ client = authClient as unknown as AuthClientLike }: { client?: AuthClientLike }) {
  const session = client.useSession();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const errorId = useId();

  if (session.data) {
    const { name, role } = session.data.user;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{`Signed in as ${name} (${role ?? 'staff'})`}</CardTitle>
          <CardDescription>Kitchen and admin screens arrive in the next milestones.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="secondary" onClick={() => void client.signOut().then(() => session.refetch?.())}>Sign out</Button>
        </CardContent>
      </Card>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setStatus({ kind: 'submitting' });
    try {
      const result = await client.signIn.email({ email: String(data.get('email') ?? ''), password: String(data.get('password') ?? '') });
      if (result.error) {
        setStatus({ kind: 'error', message: result.error.status === 401 ? "That email and password don't match." : "Can't reach the server. Check the connection and try again." });
        return;
      }
      setStatus({ kind: 'idle' });
      session.refetch?.();
    } catch {
      setStatus({ kind: 'error', message: "Can't reach the server. Check the connection and try again." });
    }
  }

  const submitting = status.kind === 'submitting';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff sign in</CardTitle>
        <CardDescription>Use the demo accounts from the README.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" required className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" aria-describedby={status.kind === 'error' ? errorId : undefined} aria-invalid={status.kind === 'error' || undefined} />
          </div>
          <p id={errorId} role="status" aria-live="polite" className="min-h-6 text-destructive">
            {status.kind === 'error' ? status.message : ''}
          </p>
          <Button type="submit" disabled={submitting} aria-busy={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
```
Note `aria-describedby` must equal the paragraph id only in the error state (the test checks it after the error appears).

`apps/web/app/globals.css`:
```css
@import 'tailwindcss';
@import '@tabletap/ui/tokens.css';
@import '@tabletap/ui/theme.css';
@source '../../../packages/ui/src';
```

`apps/web/app/layout.tsx` — load the two brand families with `next/font/google` and expose them on `<html>` as `--font-display` and `--font-text` overriding the token fallbacks:
```tsx
import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const text = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-text', display: 'swap' });

export const metadata: Metadata = { title: 'TableTap', description: 'Order from your table. Kitchen sees it in real time.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
```
If `docs/brand-guidelines.md` names a different pairing, import those families instead (same variable names).

`apps/web/app/login/page.tsx`:
```tsx
import { LoginForm } from '../../components/login-form';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">TableTap</h1>
      <LoginForm />
    </main>
  );
}
```

- [x] **Step 4: Run tests, lint, typecheck, build, validate tokens; manual check; commit**

Run: `pnpm --filter @tabletap/web test && pnpm --filter @tabletap/web lint && pnpm --filter @tabletap/web typecheck && pnpm --filter @tabletap/web build && pnpm validate-tokens`
Expected: all PASS; `apps/web/.next/standalone` exists; validate-tokens reports 0 issues.

Manual check (needs Postgres running: `docker compose up -d postgres` if Docker is present, otherwise skip and rely on Task 15): in one terminal `pnpm --filter @tabletap/api dev` (with `.env` copied from `.env.example`, after `pnpm db:migrate && pnpm db:seed -- --if-empty`), in another `pnpm --filter @tabletap/web dev`; open `http://localhost:3000/login`, sign in as `kitchen@littlefurnace.demo` / `tabletap-demo`, see "Signed in as Theo Baptiste (kitchen)", sign out.

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): Next.js shell with API rewrite and staff sign-in page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 14: Docker Compose and Dockerfiles

**REQUIRED SUB-SKILLS:** none beyond superpowers:executing discipline; TDD-exempt (infra). Verification is `docker compose up --wait` + `/health`.

**Files:**
- Create: `Dockerfile.api`, `Dockerfile.web`, `apps/api/docker-entrypoint.sh`, `docker-compose.yml`

**Interfaces:** the API container runs `migrate → seed --if-empty → main` and exposes 4000; the web container is built with build arg `API_URL=http://api:4000` and exposes 3000; Postgres 17 on 5432 with a named volume.

- [x] **Step 1: API image**

`apps/api/docker-entrypoint.sh` (LF line endings):
```sh
#!/bin/sh
set -e
node dist/migrate.js
node dist/seed.js --if-empty
exec node dist/main.js
```

`Dockerfile.api`:
```dockerfile
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @tabletap/api build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile --prod

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production MIGRATIONS_DIR=/app/migrations
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
COPY packages/db/migrations ./migrations
COPY apps/api/docker-entrypoint.sh ./docker-entrypoint.sh
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=20 CMD wget -qO- http://localhost:4000/health || exit 1
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
```
`nodeLinker: hoisted` (Task 1) makes `/app/node_modules` flat, so the bundled `dist/main.js` resolves `postgres`, `drizzle-orm`, `better-auth`, `fastify` from there. The `@tabletap/*` sources are inlined by tsup.

- [x] **Step 2: Web image**

`Dockerfile.web`:
```dockerfile
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG API_URL=http://api:4000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm tokens && pnpm --filter @tabletap/web build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```
Fonts from `next/font/google` are downloaded at build time; the build stage needs network access (default in Docker builds).

- [x] **Step 3: Compose**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-tabletap}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-tabletap}
      POSTGRES_DB: ${POSTGRES_DB:-tabletap}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-tabletap} -d ${POSTGRES_DB:-tabletap}"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    env_file: .env
    environment:
      DATABASE_URL: postgres://${POSTGRES_USER:-tabletap}:${POSTGRES_PASSWORD:-tabletap}@postgres:5432/${POSTGRES_DB:-tabletap}
      PORT: 4000
      NODE_ENV: production
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
      args:
        API_URL: http://api:4000
    environment:
      NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}
    ports:
      - "3000:3000"
    depends_on:
      api:
        condition: service_healthy

volumes:
  pgdata:
```
`env_file: .env` — the file must exist; `cp .env.example .env` first (CI does the same). The API container stays on `NODE_ENV: production`: the image ships production dependencies only, and `NODE_ENV=development` would ask for the `pino-pretty` transport, which is a devDependency absent from that image. Cookie security is therefore its own switch rather than a side effect of `NODE_ENV`: `COOKIE_SECURE: ${COOKIE_SECURE:-false}` keeps the plain-http local demo working, and a real HTTPS deployment sets `COOKIE_SECURE=true`. Left unset entirely, the flag follows `NODE_ENV`.

- [x] **Step 4: Verify (requires Docker Desktop)**

```bash
cp .env.example .env
docker compose up -d --build --wait
curl -fsS http://localhost:4000/health
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
docker compose logs api | grep -E "seed:|migrations applied"
```
Expected: health JSON with `"status":"ok"`; `200` for `/login`; the api log shows `migrations applied` and `seed: {"restaurants":1,"tables":12,...}` with twelve guest URLs. Then `docker compose down`. If Docker is still not installed on the host, say so in the task report; Task 15's CI job verifies Compose on GitHub.

- [x] **Step 5: Commit**

```bash
git add Dockerfile.api Dockerfile.web docker-compose.yml apps/api/docker-entrypoint.sh
git commit -m "build: docker compose with postgres, api and web images

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Playwright smoke and GitHub Actions CI

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development (the e2e test is written first and fails until the stack is up).

**Files:**
- Create: `playwright.config.ts`, `e2e/staff-login.spec.ts`, `.github/workflows/ci.yml`

- [x] **Step 1: Playwright**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

`e2e/staff-login.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('kitchen staff signs in through the same-origin API proxy', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@littlefurnace.demo');
  await page.getByLabel('Password').fill('tabletap-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Signed in as Theo Baptiste (kitchen)')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('wrong password shows the brand-voice message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@littlefurnace.demo');
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('status')).toHaveText("That email and password don't match.");
});
```
Run with the stack down: `pnpm exec playwright install chromium && pnpm e2e` → FAIL (connection refused). With `docker compose up -d --build --wait` → PASS. If Docker is absent locally, run against `pnpm dev` (api + web with a reachable Postgres) or leave verification to CI and report it.

- [x] **Step 2: CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm tokens && git diff --exit-code -- packages/ui/tokens.css
      - run: pnpm validate-tokens
      - run: pnpm test

  compose-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: cp .env.example .env
      - run: docker compose up -d --build --wait
      - run: curl -fsS http://localhost:4000/health
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
      - if: failure()
        run: docker compose logs
      - if: always()
        run: docker compose down -v
```
`pnpm/action-setup@v4` reads the `packageManager` field for the pnpm version.

- [x] **Step 3: Commit**

```bash
git add playwright.config.ts e2e .github
git commit -m "ci: github actions with unit checks and compose-backed e2e smoke

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: ADRs, README, final quality gate and merge

**REQUIRED SUB-SKILLS:** superpowers:requesting-code-review (whole branch), superpowers:receiving-code-review, superpowers:finishing-a-development-branch (owner pre-selected: merge into `main`, delete the branch).

**Files:**
- Create: `docs/adr/0001-staff-auth-and-guest-sessions.md`, `0002-signed-table-token-in-qr.md`, `0003-pglite-tests-compose-e2e.md`, `0004-api-behind-next-rewrite.md`, `0005-one-token-source-three-surfaces.md`, `README.md`
- Modify: `docs/superpowers/specs/2026-09-02-m1-foundation-design.md` (status line), this plan (check boxes)

- [x] **Step 1: ADRs** — each file has `# ADR NNNN: <title>`, `Date: 2026-09-02`, `Status: accepted`, then `## Context`, `## Decision`, `## Consequences`. Content:

- **0001** Context: staff need sessions with roles; guests never register and are bound to a table; the API (Fastify) owns the data. Decision: better-auth in `apps/api` (email + password, sign-up disabled, `role` field, Drizzle adapter, plural tables) for staff; guests get their own `guest_sessions` row and a signed `tt_guest` cookie; one `Principal` union resolved per request. Rejected: Auth.js (Next-centric, two truths, no guest concept), better-auth anonymous plugin (guests become users; hourly reset harder). Consequences: one auth truth; guest reset is a table wipe; staff creation only via seed until the admin surface (M5).
- **0002** Context: the QR must not be trusted for the table id. Decision: JWT HS256 (`jose`) with `sub` = table id, `rid`, `tn`, TTL 365 days by default, header `typ: tt-table`; API verifies signature and expiry then checks the table exists, is active, belongs to the restaurant. Consequences: reprinting QR after secret change; rotation (`kid`) in backlog.
- **0003** Context: no Docker on the dev host initially; tests must be fast and deterministic. Decision: PGlite in memory with the real migrations for unit and integration tests (`@tabletap/db/testing`); Compose Postgres for e2e and CI's compose job. Record the 2026-09-02 verification: better-auth 1.7.2 over PGlite passes sign-up/sign-in/session/sign-out; schema generated with `npx auth@latest generate` (the old CLI omits `issuer`). Consequences: `pnpm test` runs anywhere; a Postgres-only feature would need a compose-backed test.
- **0004** Context: web on Vercel, API on Railway/Fly; cookies must stay first-party; WebSockets do not proxy through Vercel. Decision: Next.js `rewrites` proxy `/api/*` to the API (build-time `API_URL`); Socket.io (M3) connects to the API origin directly with a short-lived token minted by the API. Consequences: build arg per environment; CSRF relies on better-auth `trustedOrigins`.
- **0005** Context: three surfaces with different character but one brand. Decision: one `assets/design-tokens.json` (primitive → semantic → component); kitchen = `dark.semantic` emitted under `.dark, [data-surface="kitchen"]`; admin density via Tailwind `--spacing` override; shadcn variable names as the semantic layer so components stay unmodified; `validate-tokens` in CI. Consequences: every colour change flows through the JSON and the contrast test.

- [x] **Step 2: README.md** (English) with sections: What is TableTap (two sentences + the six milestones, M1 done), Stack, Quick start with Docker (`cp .env.example .env`, `docker compose up --build`, URLs), Local development (corepack, `pnpm install`, `docker compose up -d postgres`, `pnpm db:migrate`, `pnpm db:seed -- --if-empty`, `pnpm dev`), Scripts table (every root script), Demo accounts (three emails + `tabletap-demo`), Project structure (the tree from this plan, trimmed), Design pipeline (brand → design-system → tokens, how to regenerate), Docs (links to spec, ADRs, brand guidelines), and a line "Case study, live demo and screenshots arrive in M6."

- [x] **Step 3: Quality gate**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm validate-tokens && pnpm build
cp .env.example .env && docker compose up -d --build --wait && pnpm e2e && docker compose down -v
```
All green (compose/e2e locally only if Docker is present; otherwise state it and rely on CI). Then `superpowers:requesting-code-review` on the whole branch; resolve Critical/Important findings.

- [x] **Step 4: Update docs and commit**

Set the spec status line to `Status: implemented (M1 merged <date>)` and tick every checkbox in this plan.
```bash
git add docs README.md
git commit -m "docs: ADRs 0001-0005, README and M1 status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [x] **Step 5: Finish the branch**

Follow `superpowers:finishing-a-development-branch` with the pre-selected option: merge `feat/m1-foundation` into `main` (fast-forward or merge commit), delete the branch and the worktree. Report: what merged, what was verified locally, what is only verified in CI, and the DoD checklist from spec section 16.

---

## Self-review notes (already applied)

- Spec coverage: §4 repo → T1; §5 schema → T4; §6 auth/guest → T7, T8; §7 RBAC → T2, T9; §8 API → T6–T9; §9 shared → T2, T3; §10 web → T13; §11 design pipeline → T10–T12; §12 seed → T5; §13 tests → every task + T15; §14 infra → T1 (env), T14, T15; §15 ADRs → T16; §16 DoD → T16.
- Names used across tasks: `createTestDb` (T4) ← T5, T6; `seed` (T5) ← T6 helpers; `buildApp`, `TEST_CONFIG`, `createTestApp` (T6) ← T7–T9; `signInAs` (T7) ← T9; `claimTable` (T8) ← T9; `GUEST_COOKIE`, `findActiveGuestSession`, `touchGuestSession`, `SLIDE_AFTER_MS` (T8) ← principal plugin; `can` (T2) ← T9; `signTableToken`/`verifyTableToken` (T3) ← T5, T8; `contrastRatio` (T12) ← tokens test; `LoginForm`/`AuthClientLike` (T13) ← e2e labels.
- `createTestApp({ ready?: boolean })`: T6 defines the option; T6 (error handler) and T9 (rbac) pass `ready: false` and call `app.ready()` after adding test routes.
