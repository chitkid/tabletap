# M6 Polish + Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put TableTap on a public address a stranger can open, give it a face, add motion where motion earns its keep, and write down what was built.

**Architecture:** Three free tiers — the web on Vercel, the API on Render from the `Dockerfile.api` this repository already builds, Postgres on Neon — and no object storage at all, because the demo refuses uploads and the seed sets no image. Ordinary browser HTTP keeps going through the existing `/api/:path*` rewrite so it stays same-origin and cookies are untouched; only the WebSocket talks to the API's public address, and it authenticates with the short-lived socket token rather than a cookie. Because the web and the API now sit on different platforms, the web signs the visitor address it forwards and the API honours it only on a valid signature. Identity and motion both live in the design system as tokens and components, so the existing `validate-tokens` gate keeps them honest.

**Tech Stack:** Vercel, Render, Neon, GitHub Actions, Next.js 16 App Router (`ImageResponse` for generated images), Tailwind 4 tokens, Drizzle migrations, Vitest, Playwright, Lighthouse.

**Spec:** `docs/superpowers/specs/2026-09-05-m6-polish-portfolio-design.md`. Read the section a task names before starting it.

## Global Constraints

- Language: code, comments, commits, docs in English. Conventional Commits; every commit ends with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Every commit is a working state.
- Work in a git worktree on branch `feat/m6-polish` created from `main` (`superpowers:using-git-worktrees`; worktree root under `.claude/worktrees/`). Paths below are relative to the worktree root. Run `corepack pnpm install --frozen-lockfile` there and copy `.env.example` to `.env` before anything touches Compose.
- **Run every gate with `--force`**: `corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .`. Turbo has served stale cache hits in these worktrees and hidden real errors, including a React "cannot access refs during render" bug behind a cached green run. `--force` is a Turbo flag and is **not** valid on vitest; for a focused loop use `corepack pnpm --filter @tabletap/web exec vitest run <path>`.
- pnpm through corepack; `--save-exact`; commit `pnpm-lock.yaml` with the code; never `pnpm approve-builds`.
- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`import type`); no `any`.
- TDD (red → verify → green → commit) for every behaviour change. Exempt: migrations, config schema lines, presentational markup, Dockerfiles, Fly and CI configuration, ADRs and other documents.
- **Only `opacity` and `transform` may be animated**, and every animation must collapse to an instant substitution under `prefers-reduced-motion: reduce`. Cumulative layout shift stays at 0 and the existing Lighthouse gate (accessibility ≥ 95 on six pages, currently 100) stays green.
- **Nothing animates on a path where a person is waiting.** The payment-to-kitchen route measured 34 ms against a 500 ms budget; it gains no animation, and neither does the interval between a press and the answer to it.
- Tokens only in `apps/` and `packages/ui/src`; 44 px targets (`h-11`); every control labelled; notices in `role="status"`; brand voice — plain verbs, no exclamation marks.
- No secret value from `.env.example` may reach a public host. Deployment secrets are generated fresh and set with `fly secrets set`.
- Public URLs added in M6: none. The deployment moves existing URLs to a public origin; it does not invent new paths.

## Context files for every task

| Path | What it is |
|---|---|
| `docs/superpowers/specs/2026-09-05-m6-polish-portfolio-design.md` | The approved M6 spec |
| `docs/brand-guidelines.md` | Voice, palette, §3 Logo Usage — the wordmark rules this milestone must obey and update |
| `packages/ui/theme.css`, `packages/ui/tokens.css`, `scripts/validate-tokens.cjs` | The token layer and the gate that keeps values out of components |
| `packages/ui/src/components/plate.tsx` | The nearest existing SVG component; follow its shape |
| `apps/api/src/server.ts`, `src/lib/staff-key.ts`, `src/plugins/demo-reset.ts`, `src/lib/demo-reset.ts` | Rate limiting and the demo reset, both of which M6 changes |
| `apps/web/next.config.ts`, `apps/web/lib/socket.ts`, `apps/web/app/layout.tsx` | The rewrite, the socket origin, and the metadata root |
| `Dockerfile.api`, `Dockerfile.web`, `docker-compose.yml`, `.github/workflows/ci.yml` | What Fly will build, and the CI the deploy workflow waits for |
| `docs/backlog.md` | Where the M6-tagged debts are recorded, several of which this plan closes |

## File structure (M6 additions)

```
packages/ui/src/components/mark.tsx (+ test)     the TableTap mark, tokens only
packages/ui/src/components/motion.ts             duration and easing token names
packages/ui/theme.css                            + motion tokens
scripts/validate-tokens.cjs                      + a rule for bare durations and easings
assets/little-furnace-wordmark.svg               the M1 debt, wordmark only
apps/web/app/icon.svg                            favicon, static
apps/web/app/apple-icon.tsx                      180x180, ImageResponse, no text
apps/web/app/opengraph-image.tsx                 1200x630, ImageResponse, needs the display face
apps/web/app/globals.css                         + the reduced-motion collapse
apps/api/src/plugins/demo-reset.ts               + reset on boot
apps/api/src/lib/client-key.ts (+ test)          one rate-limit bucket per visitor
apps/api/src/config.ts                            + DEMO_UPLOADS_ENABLED
apps/web/components/admin/photo-field.tsx        + the disabled state and its reason
packages/db/migrations/0006_orders-restaurant-idx.sql
Dockerfile.api, Dockerfile.web                   + USER node
render.yaml                                      the API service, declared in the repo
apps/web/lib/forward-signature.ts (+ test)       the signed visitor address
.github/workflows/deploy.yml
docs/adr/0014-the-demo-is-public.md
docs/case-study.md;  README.md;  docs/backlog.md
```

---

### Task 1: The mark, the icons, and a debt from M1

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; anthropic-skills:frontend-design (read spec §3 before drawing anything)

**Files:**

- Create: `packages/ui/src/components/mark.tsx`, `packages/ui/src/components/mark.test.tsx`, `assets/little-furnace-wordmark.svg`, `apps/web/app/icon.svg`, `apps/web/app/apple-icon.tsx`
- Modify: `packages/ui/src/index.ts`, `apps/web/components/admin/shell.tsx`, `apps/web/components/kitchen/kitchen-board.tsx` (top bar only), `docs/brand-guidelines.md` §3

**Interfaces (produced):**

```ts
export function Mark(props: SVGProps<SVGSVGElement> & { title?: string }): JSX.Element
```

**The geometry, exactly.** A 64-unit viewBox. An open ring — `cx=32 cy=32 r=22`, `stroke-width=7`, `stroke-linecap="round"`, `stroke-dasharray="110 28"`, `transform="rotate(28 32 32)"` — and a solid dot, `cx=32 cy=32 r=8.5`. The ring takes `currentColor` so it inherits whatever chrome it sits in; the dot takes `var(--primary)`, which is ember. **No hex anywhere in the file** — `validate-tokens` scans `packages/ui/src` and will fail the gate on one.

The 28-degree rotation puts the ring's gap at the lower right. That is deliberate and it is the only thing distinguishing this from a bullseye, so do not "tidy" it to 0.

- [ ] **Step 1: Failing tests**

`mark.test.tsx`: renders an `<svg>` with `role="img"` and the accessible name from `title` when one is given, and `aria-hidden="true"` with no name when none is; the dot's fill is `var(--primary)` and the ring's stroke is `currentColor`; the file contains no `#` colour (assert by reading the rendered markup, which is what a consumer sees).

- [ ] **Step 2: Run, expect failures, then implement**

Follow `packages/ui/src/components/plate.tsx` for the component's shape — plain SVG, `SVGProps` spread, `cn` for the class. Export it from `packages/ui/src/index.ts` beside `plate`.

- [ ] **Step 3: The three places it appears**

`apps/web/app/icon.svg` — the same geometry as a standalone file, with the two colours resolved to their literal values, because a favicon has no CSS context to inherit from. This is the one file where the hex is correct; it lives in `apps/web/app`, not `packages/ui/src`, so the validator does not scan it. Add a comment in `mark.tsx` pointing at it, so the next person changing the geometry knows there are two copies and why.

`apps/web/app/apple-icon.tsx` — 180×180 via `ImageResponse`, the mark centred on an ember field. No text, so no font is needed here.

The admin and kitchen top bars get the mark beside the existing product name. **Not the guest surface** — spec §3 is explicit that the guest room wears Little Furnace and nothing else.

- [ ] **Step 4: The M1 debt**

`assets/little-furnace-wordmark.svg` — the words "Little Furnace" in Bricolage Grotesque 700, tracking `-0.02em`, as outlined paths so the file does not depend on a font being installed. Per `docs/brand-guidelines.md` §3 this is a **wordmark and nothing else**: no flame, no furnace, no mark beside it. Then update §3: the sentence "There is no SVG logo, no icon mark and no favicon artwork yet; the SVG logo arrives in M6" is now false — replace it with what exists, and add the TableTap mark with its own usage rules (where it appears, where it must not, and that it never shares a lockup with the wordmark).

- [ ] **Step 5: Full gate and commit**

```bash
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .
git add packages/ui assets apps/web docs/brand-guidelines.md
git commit -m "feat(ui): a mark for the product, and the wordmark file M1 promised"
```

---

### Task 2: The link preview

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**

- Create: `apps/web/app/opengraph-image.tsx`
- Modify: `apps/web/app/layout.tsx` (metadata), `docs/backlog.md` if the fallback is taken

**Interfaces (consumed):** the geometry from Task 1. Redraw it inline here rather than importing `Mark` — `ImageResponse` renders through Satori, which supports a subset of CSS and no `currentColor` inheritance, so a React component written for the browser is not guaranteed to survive it.

- [ ] **Step 1: The image**

1200×630. Ink background `#1C1917`, the mark at around 96 px, the word `TableTap` in the display face, and one line beneath: `Order from your table. The kitchen sees it in real time.` No screenshot, no gradient, no third colour.

- [ ] **Step 2: The font, and the rule when it will not embed**

Satori needs a real font file — `ttf`, `otf` or `woff`, **not `woff2`** — and `next/font/google` does not hand one over. Try, in order: a `ttf` or `woff` from the `@fontsource/bricolage-grotesque` package if it ships one; then the upstream Google Fonts repository file committed under `apps/web/app/`.

If neither yields an embeddable file, **ship a pre-rendered PNG committed to the repository and record it in `docs/backlog.md`**. Do not substitute a different typeface. This is the same rule the QR sheet followed in M5 when it fell back to Helvetica, and the reason is the same: a wrong face is a worse lie than a missing one.

Whatever you do here, say plainly in the report which of the three paths you took.

- [ ] **Step 3: Wire the metadata**

`apps/web/app/layout.tsx` already sets `metadataBase` from `NEXT_PUBLIC_APP_URL`, so a file-based `opengraph-image` is picked up without further wiring. Add `openGraph` and `twitter` blocks with the title and description, and confirm `metadataBase` resolves — a relative OG URL in a link preview is the classic silent failure.

- [ ] **Step 4: Prove it renders**

A unit test cannot see a PNG. Run the dev server, request `/opengraph-image`, and assert three things by hand: the response is `image/png`, it is 1200×630, and the text is not tofu boxes. Put the byte size and the dimensions in the report.

- [ ] **Step 5: Full gate and commit**

```bash
git add apps/web docs/backlog.md
git commit -m "feat(web): a link preview built from the mark"
```

---

### Task 3: Motion tokens, and a gate that keeps them honest

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**

- Create: `packages/ui/src/components/motion.ts`, `packages/ui/src/components/motion.test.ts`
- Modify: `packages/ui/theme.css`, `apps/web/app/globals.css`, `scripts/validate-tokens.cjs`

**Interfaces (produced):**

```ts
export const MOTION = {
  fast: 'var(--motion-fast)',      // 180ms — a control answering a press
  base: 'var(--motion-base)',      // 280ms — something arriving or leaving
  stagger: 'var(--motion-stagger)',// 60ms  — the gap between two entering cards
  ease: 'var(--motion-ease)',      // cubic-bezier(0.2, 0, 0, 1)
} as const;
```

- [ ] **Step 1: The tokens**

In `packages/ui/theme.css`:

```css
--motion-fast: 180ms;
--motion-base: 280ms;
--motion-stagger: 60ms;
--motion-ease: cubic-bezier(0.2, 0, 0, 1);
```

The easing is asymmetric on purpose: it leaves fast and settles slow, which is what makes an arrival read as arriving rather than sliding.

- [ ] **Step 2: The collapse, once, globally**

In `apps/web/app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

One rule for the whole product beats remembering it in five components. Note in a comment that this is why no component needs its own reduced-motion branch.

- [ ] **Step 3: Extend the validator — failing test first**

`scripts/validate-tokens.cjs` currently catches hex, `rgb()`/`hsl()`, `px` and `rem`. Add a rule for **bare durations** (a number immediately followed by `ms` or `s` in a CSS or class context) and **bare `cubic-bezier(`**, both outside `packages/ui/theme.css` and `packages/ui/tokens.css`.

Prove the rule works before relying on it: add a fixture line containing `duration-[300ms]` to a scratch file under a scanned directory, run the validator, watch it fail, remove the fixture. Report that you did this and what the failure said. A validator rule nobody has seen fail is a rule nobody knows is wired.

`motion.test.ts`: every value in `MOTION` is a `var(--motion-…)` reference and none is a literal.

- [ ] **Step 4: Full gate and commit**

```bash
git add packages/ui apps/web/app/globals.css scripts/validate-tokens.cjs
git commit -m "feat(ui): motion as tokens, with a gate that catches a stray duration"
```

---

### Task 4: The five places that move

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; anthropic-skills:ui-ux-pro-max (its searchable database **is** present in this installation — an earlier milestone reported otherwise and was wrong; run the audit properly)

**Files:**

- Modify: `apps/web/components/kitchen/kitchen-board.tsx`, `apps/web/components/kitchen/ticket-card.tsx`, `apps/web/components/order/order-live.tsx`, `apps/web/components/admin/menu-row.tsx`, `apps/web/components/landing/landing-content.tsx`, `apps/web/app/menu/page.tsx` and their tests

**Interfaces (consumed):** `MOTION` from Task 3, and the global reduced-motion collapse — so **no component in this task writes a `prefers-reduced-motion` branch of its own**.

The five, and nothing else:

1. A ticket arriving on the kitchen board — `opacity` 0→1 with `translateY(8px)→0` over `--motion-base`.
2. A ticket moving between columns — the same entrance in its new column. Do not animate the departure; a ticket that lingers where it no longer is confuses a cook.
3. The guest order timeline advancing — the connecting line grows with `transform: scaleX()` from `transform-origin: left`, then the next dot scales up. `scaleX` on a line does not move the dots, which is what keeps layout shift at zero.
4. The admin edit panel opening — the panel, not the row. **The row keeps its fixed height in both modes**; that is M5's decision, `ROW_LINE` enforces it, and this task must not touch it.
5. A staggered entrance on the landing and the menu, `--motion-stagger` apart, **on first paint only** — not on every re-render, and not on a route the user has already seen.

- [ ] **Step 1: Failing tests**

For each of 1, 3 and 5, assert the element carries the animation class and that the class resolves to a token-based duration rather than a literal. jsdom does no layout, so these are class-level assertions and you should say so in the test name rather than implying they prove anything visual.

For 4, assert the row's height class is unchanged between modes — the M5 test already does this; make sure it still passes rather than writing a second one.

For 5, assert the stagger is applied once: render twice and assert the animation class is absent on the second render.

- [ ] **Step 2: Run, expect failures, then implement**

- [ ] **Step 3: Compose walk-through and audit**

Bring the stack up. Watch a ticket arrive on the board while an order is paid in another tab; watch the timeline advance on the guest screen; load the landing and the menu cold. Then turn on the operating system's reduce-motion setting and do all of it again — everything must appear instantly and nothing may break. Run the `ui-ux-pro-max` audit over the landing, the menu, the board and `/admin/menu`, and fix what it finds. `docker compose down` when done.

- [ ] **Step 4: Prove the gate still holds**

```bash
CHROME_PATH="$LOCALAPPDATA/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe" corepack pnpm lighthouse --base http://localhost:3000 --min-a11y 95
```

Report accessibility and **cumulative layout shift for all six pages**. CLS on the landing and the menu is the number this task can break; if either moved off 0, the entrance is animating something other than `opacity` and `transform`, and the fix is the animation, not the gate.

- [ ] **Step 5: Full gate and commit**

```bash
git add apps/web
git commit -m "feat(web): motion where something changed, and nowhere else"
```

---

### Task 5: The demo resets when the machine wakes

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**

- Modify: `apps/api/src/plugins/demo-reset.ts`, `apps/api/src/plugins/demo-reset.test.ts`

**Why:** the reset runs on `setInterval` inside the API process. Fly stops an idle machine, and a stopped machine runs no timer — so a demo somebody left in a mess stays in a mess, and the next visitor is the one who wakes it and sees it. Spec §4.4.

- [ ] **Step 1: Failing test**

Assert that registering the plugin with `demoMode` on runs the seed **once, immediately**, before any interval could have elapsed — and that with `demoMode` off, or `NODE_ENV === 'test'`, or the interval at 0, it still runs nothing. The existing early-return covers the last three; the test must pin that the new boot path did not accidentally bypass them.

- [ ] **Step 2: Implement**

Lift the current `run` closure out of the `scheduleDemoReset` call into a named `runReset()`, then call it once on boot before scheduling:

```ts
const runReset = async () => {
  await app.rush.stop();
  const result = await seed(app.db, {
    mode: 'reset',
    demoPassword: config.DEMO_PASSWORD,
    tableTokenSecret: config.TABLE_TOKEN_SECRET,
    tableTokenTtlDays: config.TABLE_TOKEN_TTL_DAYS,
    webOrigin: config.WEB_ORIGIN,
  });
  app.log.info({ counts: result.counts }, 'demo data reset');
  app.orderEvents.emit('demo:reset');
};
app.addHook('onReady', async () => {
  await runReset().catch((err: unknown) => app.log.error({ err }, 'demo reset on boot failed'));
});
const stop = scheduleDemoReset({ intervalMs: …, run: runReset, log: … });
```

Use `onReady` rather than calling it inline: the plugin registers before the routes, and a seed that runs while the server is still assembling is a seed racing the thing that will read it. A boot reset that fails must not stop the server from starting — a demo with stale data is better than no demo.

- [ ] **Step 3: Full gate and commit**

```bash
git add apps/api
git commit -m "fix(api): reset the demo on boot, because a sleeping machine runs no timer"
```

---

### Task 6: One rate-limit bucket per visitor, proved rather than assumed

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; superpowers:systematic-debugging if the measurement disagrees with the hypothesis

**Files:**

- Create: `apps/api/src/lib/client-key.ts`, `apps/api/src/lib/client-key.test.ts`
- Modify: `apps/api/src/server.ts`, `apps/api/src/routes/guest.ts`, `apps/web/next.config.ts` or a new `apps/web/middleware.ts` — **only if the measurement says so**
- Read first: spec §4.5, and the two `docs/backlog.md` lines about shared buckets and `TRUST_PROXY`

**The problem, stated exactly.** `@fastify/rate-limit` keys on `request.ip`. A browser sends no `x-forwarded-for` of its own, and every browser request reaches the API through the `/api/:path*` rewrite in the web container. If the rewrite does not carry the visitor's address, the API sees one address for everybody and **one person exploring the demo exhausts the limit for everyone else**. On a link the owner sends to strangers, that is a defect, not a note.

- [ ] **Step 1: Measure before changing anything**

Bring the Compose stack up. Pick a route with a low limit — `POST /api/guest/claim` is 20/min — and drive it through the web rewrite twice, as two different clients:

```bash
for i in $(seq 1 25); do curl -s -o /dev/null -w '%{http_code} ' -H 'x-forwarded-for: 203.0.113.10' -X POST http://localhost:3000/api/guest/claim -H 'content-type: application/json' -d '{"token":"nope"}'; done; echo
for i in $(seq 1 25); do curl -s -o /dev/null -w '%{http_code} ' -H 'x-forwarded-for: 198.51.100.20' -X POST http://localhost:3000/api/guest/claim -H 'content-type: application/json' -d '{"token":"nope"}'; done; echo
```

**Write the two lines of status codes into your report.** If the second client starts at 429, the buckets are shared and the rewrite is dropping the address. If it starts fresh, the rewrite carries it and this task is mostly configuration. Do not guess which — the whole point of this task is that the answer was measured.

- [ ] **Step 2: The key, and the spoofing question**

Create `clientKey(request)` in `apps/api/src/lib/client-key.ts` as the single place that decides who a caller is, with unit tests over the shapes it must handle: a forwarded chain with several hops, a single address, an empty header, and a header present but blank.

Then answer this in the code's comment and in your report, because it is the part that matters: **the API is publicly reachable** — it must be, because the browser opens the WebSocket straight to it — so a caller can reach it directly and send whatever `x-forwarded-for` it likes. If the key trusts that header unconditionally, anyone can mint themselves an unlimited number of buckets and the limiter protects nothing.

The address the platform sets on the way in cannot be forged by the client; a header the client supplies can. Prefer the former for traffic arriving from outside, and treat the forwarded chain as trustworthy only for the hop you actually control. `TRUST_PROXY` is configured to match whatever you conclude, not the other way round.

- [ ] **Step 3: Carry the address through the rewrite, if Step 1 says it is dropped**

Next's `rewrites()` cannot add headers. `apps/web/middleware.ts` can, with `NextResponse.rewrite(url, { request: { headers } })`. Add it only if you measured that you need it, and keep it to the one header — a middleware that runs on every request is not a place to put anything else.

- [ ] **Step 4: Measure again, the same way**

Re-run Step 1's two loops. **The task is not complete until the second client starts fresh while the first is being refused**, and both lines of status codes are in the report. A configuration change with no measurement behind it is exactly the failure this task exists to prevent.

- [ ] **Step 5: Full gate and commit**

```bash
git add apps/api apps/web
git commit -m "fix(api): one rate-limit bucket per visitor, not one for the whole demo"
```

---

### Task 7: An index that was always missing, and containers that stop being root

**REQUIRED SUB-SKILLS:** none beyond the global constraints

**Files:**

- Create: `packages/db/migrations/0006_orders-restaurant-idx.sql` (generated, not hand-written)
- Modify: `packages/db/src/schema/orders.ts`, `Dockerfile.api`, `Dockerfile.web`

- [ ] **Step 1: The index**

`orders` carries indexes on `table_id`, `status`, `number` and `paid_at`, and **none on `restaurant_id`** — while every restaurant-scoped query in the API filters on it. Add to the table's index list in `packages/db/src/schema/orders.ts`:

```ts
index('orders_restaurant_id_idx').on(t.restaurantId),
```

Then generate the migration with the project's existing drizzle-kit script rather than writing SQL by hand, and read the generated file before committing it: it must contain one `CREATE INDEX` and nothing else. A generated migration that also drops something is a schema drift you have just discovered, and it is a stop-and-report, not a thing to commit.

- [ ] **Step 2: Containers stop running as root**

Both runner stages end without a `USER` line, so both containers run as root — recorded on the backlog since M1 as "not acceptable on a deployed host", and M6 is the milestone that gives it a host. `node:24-alpine` already provides a `node` user.

In `Dockerfile.api`, before `ENTRYPOINT`, and in `Dockerfile.web`, before `CMD`:

```dockerfile
USER node
```

The API's entrypoint runs migrations at start-up, and the web's standalone server writes nothing, so neither needs write access to its own files — but **verify rather than assume**: bring the stack up, confirm both containers reach healthy, and confirm the API actually applied migrations from its log rather than merely starting. A container that runs as `node` and silently skips its migrations is worse than one that runs as root.

- [ ] **Step 3: Prove it**

```bash
docker compose up -d --build --wait
docker compose exec api whoami   # node
docker compose exec web whoami   # node
docker compose logs api | grep -i migrat
corepack pnpm e2e
```

Report all four results. Then `docker compose down -v`.

- [ ] **Step 4: Full gate and commit**

```bash
git add packages/db Dockerfile.api Dockerfile.web
git commit -m "feat(db): index orders by restaurant; run both containers as node"
```

---

### Task 8: The deployed demo does not take uploads

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**

- Modify: `apps/api/src/config.ts`, `apps/api/src/routes/menu.ts`, `apps/api/src/routes/menu.test.ts`, `apps/web/components/admin/photo-field.tsx`, `apps/web/components/admin/photo-field.test.tsx`, `.env.example`, `docs/deploy.md`

**Why this exists.** The owner decided (spec §2) that a visitor to the live demo may do everything an admin can except put a file in storage. Everything else the hourly reset undoes; an uploaded object it does not, and the object is world-readable on storage the owner pays for and answers for. This task is what makes the rest of that decision safe.

**The division of responsibility, and it matters:** **the API enforces, the web only explains.** A disabled button is a courtesy to an honest visitor; it is not a control. Anyone can call the route directly.

- [ ] **Step 1: Failing tests**

`routes/menu.test.ts`: with uploads off, `POST /api/menu/items/:id/photo-url` and `POST /api/menu/items/:id/photo` both answer 403 in the `{ error: { code, message } }` envelope, for a principal that would otherwise be allowed — an `admin`. Assert the refusal happens **before** any storage call, by giving the route a storage fake whose methods throw if called. With uploads on, both routes behave exactly as they do today, so the existing suite must still pass untouched.

`photo-field.test.tsx`: when uploads are off the control is present, disabled, and carries the sentence below; the file input cannot be reached; and no request is made. When on, nothing changes from today.

- [ ] **Step 2: The switch**

Add to `apps/api/src/config.ts`:

```ts
DEMO_UPLOADS_ENABLED: z.coerce.boolean().default(true),
```

It defaults to **on**, so the local Compose demo keeps working exactly as M5 built and verified it, and `.env.example` stays a working local configuration. The deployment turns it off; `docs/deploy.md` gains `DEMO_UPLOADS_ENABLED=false` in its secrets list with one line saying why.

The web reads `NEXT_PUBLIC_UPLOADS_ENABLED` to decide what to render. Two variables for one idea is a drift risk, so write the comment that names which is authoritative: the API's value is the control, the web's is the explanation, and if they disagree the visitor sees a button that fails politely rather than a hole.

- [ ] **Step 3: The copy**

Exact strings. The control keeps its existing label and gains a hint below it:

`Photo upload is off in this demo. Everything else here is real, and it resets every hour.`

Plain verbs, no exclamation mark, and it says what is true rather than apologising. If a caller reaches the route anyway, the API answers:

`Photo upload is disabled in this deployment.`

- [ ] **Step 4: Run, expect failures, then implement**

- [ ] **Step 5: Full gate and commit**

```bash
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .
git add apps/api apps/web .env.example docs/deploy.md
git commit -m "feat: the deployed demo explains why it takes no uploads, and refuses them"
```

---

### Task 9: The web signs the address it forwards

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; superpowers:systematic-debugging if a measurement disagrees with what you expected

**Files:**

- Create: `apps/web/lib/forward-signature.ts` and its test
- Modify: `apps/api/src/lib/client-key.ts` and its test, `apps/api/src/config.ts`, `apps/web/middleware.ts` and its test, `.env.example`

**Interfaces (produced):**

```ts
// apps/web/lib/forward-signature.ts — Web Crypto, so it runs in the edge runtime
export async function signVisitor(address: string, secret: string): Promise<string>
export const VISITOR_HEADER = 'x-tt-visitor';
export const VISITOR_SIG_HEADER = 'x-tt-visitor-signature';
```

**Why this exists.** An earlier task gave three public routes a rate-limit bucket per visitor, and its security argument rested on every hop between the visitor and the API sitting inside a private range the API could trust. The deployment now spans two providers (spec §4.1), so the web's call to the API leaves one network and arrives as ordinary internet traffic from an ordinary public address. Trusting a forwarded address from an untrusted peer lets anyone forge one; refusing to trust it collapses every visitor onto a single bucket. Neither is acceptable, so the web proves the address came from it.

Read spec §4.4 before starting. It is short and it states the property.

- [ ] **Step 1: Establish how the secret reaches the middleware, before designing around it**

Next middleware is bundled at build time, and this milestone has already been bitten twice by a value that is inlined at build being supplied only at runtime. **Do not assume either way.** Determine whether a plain (non-`NEXT_PUBLIC_`) environment variable read inside `middleware.ts` is inlined at build or read at runtime, by building the web image and observing what a changed value does — the same method the link-preview task used, and the only one that distinguishes them, because `next dev` behaves like a runtime read regardless.

Write what you established in your report. If it is build-time, the secret is a build argument and the runbook must say so; if runtime, it is an ordinary environment variable. Getting this wrong ships a demo whose forwarding silently never verifies.

- [ ] **Step 2: Failing tests**

`forward-signature.test.ts`: the same address and secret give the same signature; a different address gives a different one; a different secret gives a different one; the function uses Web Crypto rather than `node:crypto`, so it can run in the edge runtime.

`client-key.test.ts`, extending the existing file: a request carrying a valid address and signature keys on that address; a request carrying an address with a **wrong** signature keys on the connection's own address, not the claimed one; a request carrying an address and **no** signature likewise; a request with neither behaves exactly as it does today. Assert the wrong-signature case explicitly — it is the whole property, and a test that only checks the happy path would pass against a version that never verifies at all.

`middleware.test.ts`: with a secret configured the middleware sets both headers; with no secret configured it sets neither and does not throw, so a misconfigured deployment degrades to one shared bucket rather than to a crash.

- [ ] **Step 3: Run, expect failures, then implement**

Sign with HMAC-SHA256 over the address, hex-encoded, using Web Crypto's `crypto.subtle` in the web and `node:crypto`'s `createHmac` in the API. Compare with a timing-safe comparison in the API. Do not invent a scheme with a timestamp or a nonce: replaying another visitor's address only shares their bucket, which gains an attacker nothing, and every extra moving part is one more thing to get wrong.

Add `FORWARD_SECRET` to the API's config as an optional value — the local Compose demo does not need it, and an unset secret must mean "verify nothing, key on the connection address", never "accept anything".

**`clientKey` keeps `normalizeIP`.** An earlier round established that dropping the plugin's own normalisation reopens bucket-minting through IPv6 /64s; the signature check goes in front of it, not instead of it.

- [ ] **Step 4: Prove it against the Compose stack**

Bring the stack up with a secret configured. Confirm two clients with different addresses get their own buckets through the rewrite, and that a request sent **directly** to the API with a forged `x-tt-visitor` header and no valid signature is keyed on its own connection address rather than the claimed one. Report both.

This also closes something the earlier task had to leave open: the local demo was spoofable from the host because the API's port is published. With signature verification it is not.

- [ ] **Step 5: Full gate and commit**

```bash
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .
git add apps/api apps/web .env.example
git commit -m "feat(api): honour a forwarded address only when the web signed it"
```

---

### Task 10: Three free tiers, and a runbook precise enough to follow

**REQUIRED SUB-SKILLS:** none beyond the global constraints. **This task writes configuration and documentation only — it deploys nothing.** No step requires an account, and no step may attempt to create one.

**Files:**

- Create: `render.yaml`, `docs/deploy.md`
- Modify: `.github/workflows/deploy.yml`, `Dockerfile.web`, `docker-compose.yml` if the build arguments need it
- Delete: `fly.api.toml`, `fly.web.toml` — the previous platform's configuration, now dead

**Read spec §4 first.** It decides the topology, the address layout, and why there is no object storage.

- [ ] **Step 1: Retire the Fly configuration**

Delete `fly.api.toml` and `fly.web.toml`, and remove every reference to Fly, flycast and Tigris from the workflow and any document that names them. A dead configuration file for a platform the project does not use is a trap for the next reader, who cannot tell it from a live one.

- [ ] **Step 2: The three services**

**Web on Vercel.** No file is required — Vercel reads `apps/web` from the repository. What the runbook must pin down is the root directory, the build command for a pnpm workspace, and that **every `NEXT_PUBLIC_*` value is a build-time environment variable**, because Next inlines them. There are three: `NEXT_PUBLIC_API_ORIGIN`, `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_UPLOADS_ENABLED`. The forwarding secret is **not** among them — Task 9 measured it and a plain non-`NEXT_PUBLIC_` variable read in `middleware.ts` is read at runtime, so `FORWARD_SECRET` is an ordinary environment variable that must be set to the **same value on both Vercel and Render**. A mismatch between the two sides fails silently, with every visitor sharing one bucket and nothing to see; give it its own line in the runbook. Getting one of them supplied only at runtime produces a browser bundle still pointing at localhost — a socket that never connects and a link preview nobody outside can load.

**API on Render**, as a Docker web service built from `Dockerfile.api`. Write `render.yaml` so the service is declared in the repository rather than clicked together, with the free plan, the health check path `/health`, and every environment variable listed — secrets marked as such rather than given values.

**Postgres on Neon.** The runbook captures the connection string into `DATABASE_URL` and notes that the API runs its own migrations and seed at boot, so there is no separate migration step.

- [ ] **Step 3: The deploy workflow**

Keep the existing `workflow_run` gate on `ci` succeeding for `main`, the `concurrency` group, and `ref: ${{ github.event.workflow_run.head_sha }}` so the deployed commit is the one CI validated. Replace the Fly deploy steps.

**The order is API first, then web, and it is not a preference** — `OrderDtoSchema` requires fields older API builds do not send, so a newer web against an older API fails to parse every order response: the menu renders and nothing past it works. Keep that reason as a comment.

Each stage ends with a smoke check carrying `--retry 10 --retry-delay 3 --retry-all-errors`, because the API's entrypoint runs migrations and the seed before it listens, and because a free instance may be waking.

- [ ] **Step 4: The runbook**

`docs/deploy.md`, written for the owner to follow without improvising. Every step needing a login is marked as theirs.

**The rule that governs every check you write, because three separate instances of its violation were found in the previous version of this document: for each check, state what a _correct_ deployment returns, and make sure the instruction would not call that a failure.** A check that reports a healthy deployment as broken is worse than no check, because the reader cannot tell it from a real failure and will go looking for a fault that is not there. Two specific traps already found and not to be repeated: `GET /api/menu` requires `menu.read`, so an anonymous curl correctly answers 401 — use `/api/demo/links`, which is public and touches the database; and the landing page opens **no** Socket.io connection at all, since `createSocket` is imported only by the kitchen board and the order screen, so an instruction to watch for one there finds nothing.

Cover, in order: confirming each service's current free-tier terms before relying on them, because they change and this document cannot verify them; creating the Neon database; creating the Render service from `render.yaml`; generating the six secrets fresh — `BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `TABLE_TOKEN_SECRET`, `SOCKET_TOKEN_SECRET`, `DEMO_PASSWORD` and the forwarding secret — with **`DEMO_PASSWORD` called out separately, because its default equals the published `.env.example` value, so forgetting it does not fail the boot: it ships a working public demo whose staff password is in this repository**; setting `DEMO_UPLOADS_ENABLED=false` and leaving both Stripe variables unset; creating the Vercel project with the four build-time variables; adding the deploy tokens to the repository; and a verification gate before the first deploy that lists the configured variables and checks them against the set with no default in `apps/api/src/config.ts`.

State once, in bold, that **no value from `.env.example` may be used** — those are local demo values and they are published.

- [ ] **Step 5: The post-deploy checks**

Six, each stating what a correct deployment returns:

1. The landing loads on the Vercel address.
2. `curl -fsS <web>/api/demo/links` returns seeded data — this proves the rewrite reaches the API, which `/login` rendering does not, because that page only calls the API when `?demo=` names a staff role.
3. A guest claims table 7 from the landing and reaches the menu.
4. The kitchen board opens and its Socket.io connection is against the public API origin — **this** is where a socket exists to observe.
5. **Two genuinely different clients, on two different networks, through the deployed site's own `/api/*` rewrite**, do not share a rate-limit bucket. State the positive control: confirm the first client is actually refused before touching the second, and that a refusal renders as `Can't reach the server. Check the connection and try again.`, because `claim-table.tsx` has no case for the rate-limited code. The limit is twenty per minute, so the refusal lands on the twenty-first request counting the page's own first attempt, and the loop must finish inside a minute.
6. A forged `x-tt-visitor` header sent **directly** to the public API is ignored — the caller is keyed on its own address. This is the check that proves Task 9's property on the real deployment.
7. A forged `x-forwarded-for` sent to the **web** address is not honoured either. The signature covers the web-to-API hop only; this hop rests on Vercel overwriting or appending that header rather than relaying it, which nothing off the platform can test. If this check fails, the limiter is keyed on a value a visitor chose, and that is a merge blocker rather than a note.

Then: the first request after the API has slept takes tens of seconds, and the demo data comes back reset. Both are expected; say so.

- [ ] **Step 6: Full gate and commit**

```bash
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .
git add render.yaml docs/deploy.md .github/workflows/deploy.yml Dockerfile.web docker-compose.yml
git rm fly.api.toml fly.web.toml
git commit -m "feat(deploy): three free tiers, a gated workflow, and a runbook"
```

---

### Task 11: The deploy itself — the owner's task, not a subagent's

**This task is run by the controller together with the owner. Do not dispatch it to a subagent.** Every step needing a login, a card or a secret belongs to the owner; the agent's part is the runbook, the commands and the measurements.

- [ ] **Step 1: The owner's steps**

The owner follows `docs/deploy.md`: confirms each service's current free-tier terms, creates the Neon database, the Render service and the Vercel project, generates and sets the six secrets, and adds the deploy tokens to the repository. The controller answers questions and reads output, and does not ask for a credential.

- [ ] **Step 2: The first deploy, in order**

API first, then web. Then the smoke checks by hand: `/health` on the API, the landing on the web, and a guest claim through the QR link the landing hands out.

- [ ] **Step 3: The four measurements that decide whether this is done**

1. **Two visitors, two buckets** — repeat Task 9's measurement against the live host. Task 6 proved it in Compose; Fly's proxy is a different hop chain, and the deployed answer is the one that matters. Record both lines of status codes.
2. **The reset survives a sleep** — leave the demo altered, wait for the machines to stop, open the site, and confirm the data came back. Record how long the first request took.
3. **The WebSocket connects** — open the kitchen board and a guest order in two browsers and watch a status change cross. Record the latency and compare it with the 34 ms measured locally.
4. **Lighthouse against the live host** — one run, six pages. Record every number; these are the figures the case study will quote, and a shared CI runner's numbers are not the same claim.

- [ ] **Step 4: Record the outcome**

Put the live URL, the four measurements and anything that surprised you into the ledger, and hand them to Task 12. If a measurement fails, that is a defect to fix before Task 12, not a number to soften.

---

### Task 12: The case study, and the documents

**REQUIRED SUB-SKILLS:** none beyond the global constraints

**Files:**

- Create: `docs/case-study.md`, `docs/adr/0014-the-demo-is-public.md`
- Modify: `README.md`, `docs/backlog.md`, `docs/brand-guidelines.md` if Task 1 left anything, `docs/superpowers/specs/2026-09-05-m6-polish-portfolio-design.md` (status line)

- [ ] **Step 1: The case study**

`docs/case-study.md`, for a reader deciding whether the engineer is any good. Not a feature list — four problems, each with what was hard, what was decided and what it cost:

1. **From payment to the kitchen.** The measured path, the 500 ms budget, the 34 ms result, and why the ordering guarantee is the interesting part rather than the speed.
2. **Revoking a printed QR code without breaking sessions in progress.** The version claim, and the deliberate asymmetry: printed codes die at once, live sessions continue because they rest on a signed cookie rather than the token.
3. **The boundary around presigned uploads.** One anchored pattern enforced at signing, at confirmation and again on any key recovered from a stored URL, and the `menu/<id>/../<other>/x.jpg` escape it closes.
4. **A bug that only existed on the real database.** The optimistic-concurrency guard compared a JavaScript `Date` against Postgres microseconds and would have answered a permanent false conflict in production — invisible in tests because the test engine's clock is coarser and rounded the difference away. The fix was the column, not the call sites.

Then a short, honest section on process: milestones, reviews per task, and a few things reviews caught that tests could not — including the two the browser found only when somebody looked at the screen.

Quote the numbers from Task 11's live run, not the local ones, and say which host they came from.

- [ ] **Step 2: The README opening**

`README.md` keeps its job as operating instructions. Add above the existing content: one sentence on what this is, the live link, a strip of screenshots, and a link to the case study. Do not restructure the rest — it works.

- [ ] **Step 3: ADR 0014**

"The demo is public, and what that changed." Context: a live address turned three backlog notes into defects. Decision: reset on boot, a bucket per visitor, upload disabled in the deployed demo. Consequences: a deploy resets the demo; the first request after idle is slow; the shared-store item now has a precise trigger, namely a second instance; and the deployed demo's admin surface is deliberately not the full product, which the interface says out loud.

- [ ] **Step 4: The backlog**

Remove what M6 closed: the root containers, the missing index, the shared rate-limit bucket, the M1 logo debt. Add what M6 deferred, at minimum: the shared store for rate limits and Socket.io with its trigger; the orphan sweep; the pre-rendered link preview if Task 2 took the fallback; the apple-touch icon if it was not generated; and cold start on the first request after idle. Read the ledger's deferred lines and fold them in, merging duplicates rather than transcribing.

- [ ] **Step 5: Full gate and commit**

```bash
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .
git add docs README.md
git commit -m "docs: the case study, ADR 0014, and a README that opens with the link"
```

---

## After the last task (controller)

1. Final whole-branch review (`superpowers:requesting-code-review`, most capable model) over `merge-base(main, HEAD)..HEAD`, pointed at the ledger's deferred and parked lines. Ask it for the two things a task reviewer cannot give: triage of every deferred Minor into fix-before-merge or backlog, and a plain challenge to any controller ruling it thinks was wrong.
2. One fix wave, one scoped re-review, adjudicate residuals.
3. Full gate on the final tree **with `--force`**, then Compose + `pnpm e2e` + Lighthouse once more.
4. `superpowers:finishing-a-development-branch` with the pre-selected option: merge into `main` (fast-forward), delete the branch, the worktree and the plan's SDD workspace.
5. Update the spec status to merged, push `main`, watch both CI jobs **and the new deploy workflow**, confirm the live site still answers, then update the memory files.
