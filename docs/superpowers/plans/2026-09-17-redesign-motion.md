# Redesign and Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make direction A «Тикет» the product on all four surfaces, and build the five motion
behaviours the Phase 3 gate selected.

**Architecture:** The token layer moves first and alone, so every later task applies a system rather
than negotiating with one. Then one surface per task — kitchen, guest, landing, admin — in the order
they carry the material. Motion last, one task per behaviour, because each has its own trigger,
reduced-motion carrier and prerequisite.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, TypeScript 5.9 strict,
`assets/design-tokens.json` → `packages/ui/tokens.css` via `scripts/generate-tokens.cjs`, `next/font`
for faces, Vitest 4, Playwright 1.62.

## Global Constraints

- Code, comments and commit messages in English; the interface in Russian.
- Conventional Commits; every commit carries `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, no `any`.
- **No raw hex, rgb/hsl, px or rem in `apps/` or `packages/ui/src`.** `pnpm validate-tokens` is the
  gate and it must stay green.
- **Touch targets ≥ 44×44 px on the guest and kitchen surfaces**, asserted in a test, never eyeballed.
- **No horizontal page scroll at 375 px** on any surface.
- **Reduced motion:** one collapse rule in `globals.css`; `globals.test.ts` fails the build on any
  component-level `motion-reduce:` branch. Never add one.
- **CLS stays 0** and Lighthouse accessibility stays 100 on the six audited pages.
- The copy contract `docs/design/02b-copy-ru.md` governs every string. No task changes copy.
- Design authority: `docs/design/02-system.md` (material) and `03-screens.md` (screens). Where an
  implementation detail is unstated, follow the drawing's measurements quoted in `03-screens.md`.

**The gate, before every commit:**

```
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force --concurrency=1 && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .
```

`--force` is a Turbo flag and is never valid on vitest. `--concurrency=1` is required: unbounded
runs starve the `userEvent` files of CPU and time them out without reaching an assertion.

---

### Task 1: The token layer, and the end of the second duration family

**Files:**

- Modify: `assets/design-tokens.json`
- Modify: `packages/ui/theme.css` (its 67 hand-written variables fold into the token file)
- Modify: `apps/web/app/layout.tsx` (register PT Mono)
- Modify: the five consumers of `--duration-fast` / `--duration-base`: `packages/ui/src/components/`
  `button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `sheet.tsx`
- Test: `packages/ui/src/tokens.test.ts` (new)

**Interfaces:**

- Produces: `--paper`, `--ink`, `--ink-muted`, `--rule`, `--rail`, `--rail-head`, `--ember`,
  `--ready`, `--late`; `--radius-chip|control|card|tear`; `--motion-instant|fast|base|ease`;
  `--font-mono` bound to PT Mono. Every later task consumes these and adds none.

- [ ] **Step 1: Write the failing test.** `packages/ui/src/tokens.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8');

describe('the token layer', () => {
  it('serves one duration family', () => {
    expect(css).not.toMatch(/--duration-(fast|base)\s*:/);
    for (const [name, value] of [
      ['motion-instant', '0.01ms'],
      ['motion-fast', '120ms'],
      ['motion-base', '280ms'],
    ] as const) {
      expect(css).toContain(`--${name}: ${value}`);
    }
  });

  it('names the tear radius rather than leaving a bare zero', () => {
    expect(css).toMatch(/--radius-tear:\s*0/);
  });

  it('carries the thermal palette', () => {
    for (const [name, value] of [
      ['paper', '#EDEAE3'],
      ['ink', '#23201D'],
      ['rail', '#2A2724'],
      ['ember', '#C23E18'],
    ] as const) {
      expect(css.toLowerCase()).toContain(`--${name}: ${value.toLowerCase()}`);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail.** `corepack pnpm --filter @tabletap/ui test` — expect three
      failures, and read them: the first must fail on `--duration-fast` still existing, not on the
      file being absent.

- [ ] **Step 3: Rewrite the primitives** in `assets/design-tokens.json` with §2 of
      `docs/design/02-system.md`, and regenerate with `corepack pnpm tokens`.

- [ ] **Step 4: Fold `theme.css` in.** Move every hand-written variable into the token file. This is
      the step that ends the disagreement: `--motion-*` was invisible to `validate-tokens` precisely
      because it lived outside the pipeline.

- [ ] **Step 5: Repoint the five consumers** from `--duration-fast` to `--motion-fast`.

- [ ] **Step 6: Register PT Mono** in `layout.tsx` beside the two existing faces, `subsets:
      ['latin', 'cyrillic']`, bound to `--font-mono`.

- [ ] **Step 7: Full gate, then commit.**

---

### Task 2: The kitchen — tickets on a rail

**Files:** `apps/web/components/kitchen/` (7 components), `apps/web/app/globals.css` (the
`[data-surface='kitchen']` canvas rule), tests beside each.

- [ ] **Step 1** Write the failing test: the board's ground resolves to `--rail`, a ticket's ground
      to `--paper`, and **no element on the board uses `--ember`** — that last one is the rule from
      `02-system.md` §2 and it is the assertion most likely to be missed.
- [ ] **Step 2** Run it, expect failure.
- [ ] **Step 3** Apply the drawing: paper tickets, dark rail, the timer as the loudest element, the
      primary control outlined rather than filled, the tear on each ticket's bottom edge.
- [ ] **Step 4** Assert every control ≥ 44 px.
- [ ] **Step 5** Full gate, then commit.

---

### Task 3: The guest — ember marks the act that commits

**Files:** `apps/web/components/menu/` (6), `basket/` (2), `pay/` (2), `order/` (4).

- [ ] **Step 1** Failing test: exactly **one** element on the menu screen carries `--ember`, and it
      is the checkout control; the dish's add control is outlined. Then: the receipt's line items
      resolve to `--font-mono` and its total resolves to `--font-text` — the type split stated in
      `03-screens.md` §3.
- [ ] **Step 2** Run it, expect failure — the current tree has ember on every dish.
- [ ] **Step 3** Apply the drawing, including the row geometry the measurement settled: the price
      shares the dish name's baseline (`align-items: start`, not `end`).
- [ ] **Step 4** Assert every control ≥ 44 px. The drawing found all of them at 36 px.
- [ ] **Step 5** Full gate, then commit.

---

### Task 4: The landing — one tear, and it is on the ticket

**Files:** `apps/web/components/landing/landing-content.tsx`, `apps/web/app/page.tsx`.

- [ ] **Step 1** Failing test: the page contains exactly one torn edge, and it is inside the hero's
      stage. Sections are separated by a rule, not by a tear.
- [ ] **Step 2** Run it, expect failure.
- [ ] **Step 3** Apply the drawing: hero, the rail-and-ticket stage, «Как это работает», «Часы
      работы», the dark footer band carrying the staff entrance.
- [ ] **Step 4** Measure horizontal overflow at 375 px and assert it is 0.
- [ ] **Step 5** Full gate, then commit.

---

### Task 5: The admin — a chart is reference, not a headline

**Files:** `apps/web/components/admin/` (9), `apps/web/app/admin/`.

- [ ] **Step 1** Failing test: the week bars resolve to the muted ink, **not** to `--ember`, and
      carry no radius — the boundary of the radius rule recorded in `03-screens.md` §4.
- [ ] **Step 2** Run it, expect failure.
- [ ] **Step 3** Apply the drawing. **Give the controls column slack a second renderer survives:**
      the three row controls need 430 px on Linux against 416 px on Windows, so the column minimum is
      `min-w-lg` (512 px), already corrected in the localisation milestone — do not reduce it.
- [ ] **Step 4** Full gate, then commit.

---

### Task 6: The printed sheet and the link preview follow the material

**Files:** `apps/api/src/lib/qr-pdf.ts`, `apps/web/app/opengraph-image.tsx`.

- [ ] **Step 1** Failing test: the PDF's ground and ink match the palette, and the sheet sets its
      body in PT Mono — it is a printed document, which is exactly where the mono belongs.
- [ ] **Step 2** Run it, expect failure.
- [ ] **Step 3** Apply. Note that satori takes ttf/otf/woff but **not woff2**, and keys fonts by
      family name — two files under one name silently drops the second.
- [ ] **Step 4** Render a sheet and **look at it**. Byte assertions prove the encoding; they do not
      prove the page reads.
- [ ] **Step 5** Full gate, then commit.

---

### Tasks 7–11: The five motion behaviours

One task each, in this order: **#1 the landing demonstration**, **#3 the ticket's arrival**, **#4 the
timer threshold**, **#2 the receipt's status change**, **#6 controls answer the thumb**.

`docs/design/00-audit-motion.md` §2 is the specification for each: it fixes the states, the trigger,
the exact values, the CLS handling and the reduced-motion carrier. **Do not re-derive them.**

Every one of these tasks has the same five steps:

- [ ] **Step 1** Write the failing test for the **static carrier first** — the word, colour, position
      or live region that must exist before any movement. A reduced-motion user gets the instant end
      state and never an alternative, so a behaviour whose meaning lives only in the movement is not
      shippable.
- [ ] **Step 2** Run it, expect failure.
- [ ] **Step 3** Build the behaviour with the audit's values and `--motion-*` only.
- [ ] **Step 4** Assert **CLS is unaffected**: the moving element occupies its final box from first
      paint. For #4 the box reservation is already done — the localisation milestone reserved the
      timer in `ch` and pinned it with a test. Confirm it rather than redoing it.
- [ ] **Step 5** Full gate, then commit.

---

## After the last task (controller)

1. Full gate with `--force`, then Compose + `pnpm e2e` + Lighthouse. **Run the e2e suite on Linux**
   (`docker run --rm --network container:tabletap-web-1 -v <repo>:/work -w /work
   mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test`) — the last milestone's only red
   build was a Linux-only layout failure, and `E2E_BASE_URL` pointed at `host.docker.internal`
   breaks better-auth's origin check and produces seven false failures.
2. Accessibility 100 and **CLS 0 with the motion in place**, on all six pages.
3. Final whole-branch review on the most capable model, one fix wave, one scoped re-review.
4. `superpowers:finishing-a-development-branch`, pre-selected: merge into `main` fast-forward,
   delete the branch, the worktree and the SDD workspace.
5. Retake the four screenshots and rewrite their alt text — they describe the current design and
   every one of them becomes false with this milestone.
6. Update `docs/case-study.md` and the design-system pages; check `docs/adr/` for decisions this
   milestone supersedes, and add superseded-by notes rather than rewriting the originals.
