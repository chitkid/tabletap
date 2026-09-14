# Russian Localisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Russian the product's language on all four surfaces — words, money, plurals, seed data, metadata and tests — with no user-visible string left in JSX.

**Architecture:** `next-intl` with no locale route segment: one locale is served, `messages/ru.json` is the product and `messages/en.json` is kept as a fallback file so a switcher is a later feature rather than a rewrite. Money stays integer kopecks in the database and is formatted once, at the edge, by the existing `formatCents`. The display face changes because the current one has no Cyrillic.

**Tech Stack:** next-intl 4, Next.js 16 App Router, `Intl.NumberFormat` / `Intl.PluralRules`, Drizzle seed, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-russian-localisation-design.md`. The approved wording lives in `docs/design/02b-copy-ru.md` — **that file is the contract**, and a string that contradicts its glossary is a defect, not a preference.

## Global Constraints

- Language: code, comments, commits and docs in English; the product's interface in Russian. Conventional Commits; every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Every commit is a working state.
- Work in a git worktree on branch `feat/ru-localisation` created from `main` (`superpowers:using-git-worktrees`; worktree root under `.claude/worktrees/`). Run `corepack pnpm install --frozen-lockfile` there and copy `.env.example` to `.env` before anything touches Compose.
- **Run every gate with `--force`**: `corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force && corepack pnpm validate-tokens && corepack pnpm exec prettier --check .`. Turbo has served stale green cache hits in these worktrees. `--force` is a Turbo flag and is **not** valid on vitest; for a focused loop use `corepack pnpm --filter @tabletap/web exec vitest run <path>`.
- pnpm through corepack; `--save-exact`; commit `pnpm-lock.yaml` with the code; never `pnpm approve-builds`.
- TypeScript strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (`import type`); no `any`.
- TDD (red → verify → green → commit) for every behaviour change. Exempt: dictionary files, seed content, metadata strings, font configuration.
- **No user-visible string in a component.** Every one comes from the dictionary. Technology names and the brand name «TableTap» are the only Latin text allowed in the interface.
- Amounts are integer kopecks in the database and are formatted exactly once, by `formatCents`. No `$`, no hand-built `+ ' ₽'`.
- Plurals through ICU in the message, never through a ternary in a component.
- Public URLs added: none. No locale segment.

## Context files for every task

| Path | What it is |
|---|---|
| `docs/design/02b-copy-ru.md` | The approved glossary, terminology, editorial rules and landing copy — the contract |
| `docs/superpowers/specs/2026-09-14-russian-localisation-design.md` | The spec |
| `docs/design/00-audit-ui.md` | The 16 latent layout breaks, with files and lines |
| `packages/shared/src/orders.ts` | The seven real order statuses and their transitions |
| `apps/web/lib/money.ts` | The single formatting point |
| `apps/web/app/layout.tsx` | Fonts, `lang`, metadata |

## File structure

```
apps/web/messages/ru.json                    the product's language
apps/web/messages/en.json                    fallback, kept in step with ru.json
apps/web/i18n/request.ts                     next-intl server config
apps/web/i18n/messages.ts                    typed key helper + the no-orphan test's allow-list
apps/web/lib/money.ts                        formatCents → ru-RU / RUB
apps/web/lib/plural.test.ts                  the 1 / 2 / 5 / 11 / 21 / 101 cases
packages/db/src/seed/data.ts                 Russian menu, rouble prices, Russian staff names
apps/web/app/layout.tsx                      lang="ru", PT Sans Narrow, cyrillic subsets, metadata
apps/web/app/opengraph-image.tsx             Russian link preview
e2e/*.spec.ts                                rewritten against Russian accessible names
apps/web/i18n/no-orphan-strings.test.ts      the gate that keeps English out
```

---

### Task 1: The i18n foundation, the language attribute and the fonts

**REQUIRED SUB-SKILLS:** none beyond the global constraints.

**Files:**

- Create: `apps/web/messages/ru.json`, `apps/web/messages/en.json`, `apps/web/i18n/request.ts`
- Modify: `apps/web/app/layout.tsx`, `apps/web/next.config.ts`, `apps/web/package.json`

**Interfaces (produced):**

```ts
// apps/web/i18n/request.ts — next-intl's server config, no routing
export default getRequestConfig(async () => ({ locale: 'ru', messages: … }));
```

**Two facts established by measurement, which this task exists to act on.**

`apps/web/app/layout.tsx:44` sets `lang="en"`. Lighthouse's `html-has-lang` audit checks that the attribute is present and well-formed — never that it matches the content — so the page will keep scoring accessibility 100 while a screen reader pronounces Russian with English phonetics. This is the cheapest fix in the audit.

And both fonts are loaded with `subsets: ['latin']`. **IBM Plex Sans has Cyrillic and is not currently being given it**, so Russian body text would fall back to a system face even though the right glyphs exist. Bricolage Grotesque has no Cyrillic at all (`vietnamese, latin-ext, latin`, queried from Google Fonts) and is replaced by **PT Sans Narrow**.

- [ ] **Step 1: Install and wire next-intl**

```bash
corepack pnpm --filter @tabletap/web add --save-exact next-intl
```

`apps/web/i18n/request.ts`:

```ts
import { getRequestConfig } from 'next-intl/server';

/**
 * One locale, no routing segment. A `/ru` prefix would change every public URL, and the master
 * brief forbids inventing URLs without a decision of its own. `en.json` exists as a fallback file
 * and as the seed of a future switcher, not as a route.
 */
export default getRequestConfig(async () => ({
  locale: 'ru',
  messages: (await import('../messages/ru.json')).default,
}));
```

`apps/web/next.config.ts` — wrap the existing export:

```ts
import createNextIntlPlugin from 'next-intl/plugin';
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');
export default withNextIntl(nextConfig);
```

- [ ] **Step 2: Failing test for the language attribute and the font subsets**

`apps/web/app/layout.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');

describe('the document shell', () => {
  it('declares Russian, because html-has-lang cannot tell a wrong language from a right one', () => {
    expect(source).toMatch(/<html\s+lang="ru"/);
    expect(source).not.toMatch(/lang="en"/);
  });

  it('asks for the Cyrillic subset of every face it loads', () => {
    // Two `subsets:` arrays, one per face. Neither may ship without cyrillic: the display face was
    // chosen for having it, and the body face has had it all along and was never given it.
    const subsetArrays = [...source.matchAll(/subsets:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(subsetArrays).toHaveLength(2);
    for (const arr of subsetArrays) expect(arr).toContain("'cyrillic'");
  });
});
```

- [ ] **Step 3: Run it, expect two failures**

```bash
corepack pnpm --filter @tabletap/web exec vitest run app/layout.test.tsx
```

Expected: FAIL on both — `lang="en"` is present and neither subset array contains `'cyrillic'`.

- [ ] **Step 4: Change the shell**

In `apps/web/app/layout.tsx`, replace the display import and both font calls:

```ts
import { IBM_Plex_Sans, PT_Sans_Narrow } from 'next/font/google';

// Bricolage Grotesque serves vietnamese, latin-ext and latin only — no Cyrillic — so it cannot
// carry a Russian interface. PT Sans Narrow is drawn from Cyrillic by Paratype and is the face of
// Russian printed forms and timetables, which is the vernacular a printed ticket belongs to.
const display = PT_Sans_Narrow({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '700'],
  variable: '--font-display',
  display: 'swap',
});
const text = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-text',
  display: 'swap',
});
```

and `<html lang="ru" …>`.

- [ ] **Step 5: Wrap the tree in the provider**

In the same file, inside `<body>`:

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
// …
const messages = await getMessages();
// <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
```

- [ ] **Step 6: Seed both dictionaries with the landing's approved copy**

`apps/web/messages/ru.json` — take every string from `docs/design/02b-copy-ru.md` §«Главная страница» verbatim, including the non-breaking spaces. `en.json` carries the English original for the same keys. Namespaces follow the surfaces: `landing`, `guest`, `kitchen`, `admin`, `common`, `status`.

- [ ] **Step 7: Green, then commit**

```bash
corepack pnpm --filter @tabletap/web exec vitest run app/layout.test.tsx
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force
git add apps/web package.json pnpm-lock.yaml
git commit -m "feat(web): serve Russian, with fonts that can actually draw it"
```

---

### Task 2: Money in roubles, through the one place that formats it

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**

- Modify: `apps/web/lib/money.ts`, `apps/web/lib/money.test.ts`, `packages/db/src/schema/restaurant.ts`, `packages/db/src/schema/orders.ts`

**Interfaces (kept, deliberately):**

```ts
export function formatCents(cents: number, currency: string): string
```

**Why the name does not change.** The commissioning brief asks for `formatPrice()`. This project already has exactly one formatting point, and its signature — `currency` required, no default — is a documented M5 decision: a `'USD'` default made a missing currency compile and showed the wrong symbol in front of a guest. Renaming it churns every call site to satisfy a name. The brief's intent is one helper and no hand-built symbols; `formatCents` is that helper.

- [ ] **Step 1: Failing tests**

`apps/web/lib/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatCents } from './money';

describe('formatCents', () => {
  it('puts the symbol after the number, in Russian order', () => {
    //   is the non-breaking space Intl uses for both the group separator and the symbol gap.
    expect(formatCents(125_000, 'RUB')).toBe('1 250 ₽');
  });

  it('drops kopecks, because a menu price is never 1 250,00 ₽', () => {
    expect(formatCents(125_050, 'RUB')).toBe('1 251 ₽');
    expect(formatCents(25_000, 'RUB')).toBe('250 ₽');
  });

  it('still honours a currency that is not the default one', () => {
    expect(formatCents(125_000, 'USD')).toContain('$');
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
corepack pnpm --filter @tabletap/web exec vitest run lib/money.test.ts
```

Expected: FAIL — the current implementation formats `en-US` and keeps two decimals.

- [ ] **Step 3: Implement**

```ts
export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
```

- [ ] **Step 4: Change the column defaults**

`packages/db/src/schema/restaurant.ts` and `orders.ts`: `.default('RUB')`. The column stays — it is per-restaurant and that is right — and a migration is generated with `corepack pnpm --filter @tabletap/db generate`.

- [ ] **Step 5: Green, gate, commit**

```bash
corepack pnpm lint --force && corepack pnpm typecheck --force && corepack pnpm test --force
git add apps/web packages/db
git commit -m "feat(web): format money in roubles at the one point that formats money"
```

---

### Task 3: Plurals that survive Russian

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**

- Create: `apps/web/lib/plural.test.ts`
- Modify: `apps/web/components/basket/basket-bar.tsx:36`, `apps/web/components/admin/week-bars.tsx:27`, `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**The two places Russian breaks, both found in the audit.** `basket-bar.tsx:36` reads `count === 1 ? 'item' : 'items'` and `week-bars.tsx:27` does the same for orders. English needs two forms and Russian needs three, and the numbers where a binary rule passes by accident are 1 and everything ending in 1 — so a test that only checks 1 and 2 proves nothing.

- [ ] **Step 1: Failing test**

`apps/web/lib/plural.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import { IntlMessageFormat } from 'intl-messageformat';

const format = (n: number) => new IntlMessageFormat(ru.guest.basketItems, 'ru-RU').format({ n });

describe('the basket count', () => {
  // 11 and 21 are the pair that catches a naive rule: 21 takes the same form as 1, and 11 does not.
  it.each([
    [1, '1 позиция'],
    [2, '2 позиции'],
    [5, '5 позиций'],
    [11, '11 позиций'],
    [21, '21 позиция'],
    [101, '101 позиция'],
  ])('formats %i', (n, expected) => {
    expect(format(n)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run, expect failure** — the key does not exist yet.

- [ ] **Step 3: Add the ICU message and use it**

`ru.json`: `"basketItems": "{n, plural, one {# позиция} few {# позиции} many {# позиций} other {# позиции}}"`.
`en.json`: `"basketItems": "{n, plural, one {# item} other {# items}}"`.

In `basket-bar.tsx`, replace the ternary with `t('basketItems', { n: count })`.

- [ ] **Step 4: Green, gate, commit**

---

### Task 4: The landing becomes a restaurant's page

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:**

- Modify: `apps/web/components/landing/landing-content.tsx`, `apps/web/components/landing/landing-content.test.tsx`, `apps/web/messages/*.json`

**Read `docs/design/02b-copy-ru.md` §«Главная страница» first.** It is the approved copy and this task types it in, it does not write it.

**What is removed, by the owner's instruction on 2026-09-14: the site must read as a real restaurant's, not as a demonstration.** Out go the demo-mode notice, the reset notice, the cold-start notice, the "Simulate rush" control and its caption, the technology list, the repository link and the three role cards.

**Two of those described real behaviour, and removing the words does not remove the behaviour.** They are not simply deleted:

- The hourly reset is explained where it lands, on the order screen, in Task 5.
- The cold start becomes a loading state that reserves its space, in Task 5.

**What replaces the three cards.** One guest action, a link in the header, and a dark band at the foot of the page — front of house and back of house, separated the way they are in the building. The band carries «Доска кухни» and «Панель администратора».

- [ ] **Step 1: Failing tests** — assert the new structure and, as a negative, that the removed strings are gone:

```tsx
it('does not advertise itself as a demonstration', () => {
  render(<LandingContent {...props} />);
  for (const gone of [/демо-режим/i, /час пик/i, /Next\.js/, /репозитор/i]) {
    expect(screen.queryByText(gone)).toBeNull();
  }
});

it('offers the guest one action and the staff a visible door', () => {
  render(<LandingContent {...props} />);
  expect(screen.getByRole('link', { name: 'Открыть меню стола 7' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Вход для сотрудников' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Доска кухни' })).toBeVisible();
});
```

- [ ] **Step 2: Run, expect failure. Step 3: Implement from the dictionary. Step 4: Green, gate, commit.**

---

### Task 5: The guest surface

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:** `apps/web/components/{menu,basket,checkout,pay,order}/**`, their tests, `apps/web/app/{menu,checkout,orders,pay,session-ended}/**`, `apps/web/messages/*.json`

Every string from the dictionary. The status words come from the glossary's **guest** column: `placed` → «Ожидает оплаты», `paid` → «Отправлен на кухню», `ready` → «Готов — сейчас принесут».

Two behaviours move here from the landing:

- [ ] **The cleared-order explanation.** `components/order/order-live.tsx` already renders a notice when an order is gone; its text becomes «Этот заказ больше не активен. Отсканируйте код на столе, чтобы начать заново.»
- [ ] **The cold start.** `app/menu/loading.tsx` reserves the space it will occupy and says «Открываем меню…» rather than nothing.

---

### Task 6: The kitchen surface, and the badge that moves the board

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development; superpowers:systematic-debugging if a measurement disagrees with what you expected

**Files:** `apps/web/components/kitchen/**`, their tests, `apps/web/messages/*.json`

Status words from the glossary's **kitchen** column: `paid` → «Новый», `cooking` → «Готовится», `ready` → «Готов».

- [ ] **Reserve the timer badge's box.** `components/kitchen/timer-badge.tsx` renders `null` below the warning threshold and an `svg.size-5` above it, and appends ` · 5 min` then ` · late` to a `whitespace-nowrap` span. It therefore widens minutes after load, which can wrap the ticket header and move every card below it. Lighthouse never sees it because its window is seconds long. In Russian the suffix grows further. Give the mark a fixed box that is present from first paint and set the suffix in a fixed-width slot; add a test that the badge's width does not change across the three thresholds.

---

### Task 7: The admin surface

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:** `apps/web/components/admin/**`, their tests, `apps/web/messages/*.json`

Includes the second binary plural (`week-bars.tsx:27`), the day's figures, the in-place row editors and every refusal message. Labels are visible, never placeholder-only.

---

### Task 8: The demo data reads like a Russian café

**REQUIRED SUB-SKILLS:** none beyond the global constraints.

**Files:** `packages/db/src/seed/data.ts`, `packages/db/src/seed/run.test.ts`

Dishes, categories, descriptions, the order notes in the rush, and the staff names. **Rewritten, not translated line by line** — «Caesar Salad → Салат Цезарь» is the failure mode. Prices are plausible Russian ones rather than converted dollars: coffee 250–350 ₽, salads 450–650 ₽, mains 700–1 200 ₽, stored as integer kopecks.

---

### Task 9: Metadata and the link preview

**Files:** `apps/web/app/layout.tsx`, `apps/web/app/opengraph-image.tsx`, `apps/web/app/not-found.tsx`

Title and description from the copy document. The Open Graph image is regenerated in Russian — and its font must be one that can draw Cyrillic, which is the same constraint Task 1 solved for the page. Satori takes ttf/otf/**woff**, not woff2; if PT Sans Narrow cannot be embedded, ship a pre-rendered PNG and record it in the backlog, exactly as the M6 rule required. **Substituting a different typeface is not an option.**

---

### Task 10: The layout breaks, found while English is still on screen

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:** `packages/ui/src/components/button.tsx:8`, `apps/web/components/kitchen/ticket-card.tsx:119-149`, `apps/web/components/admin/tables-table.tsx:267-271`, `apps/web/components/basket/basket-bar.tsx:32-41`, `apps/web/components/pay/demo-terminal.tsx:123-135`

The audit found 16 latent breaks and one already broken in English — the landing CTAs between 640 and 768 px. The class is one thing: `button.tsx:8` sets `shrink-0` and `whitespace-nowrap` on every button in the product, and four call sites put buttons in a row with no `flex-wrap`. The kitchen confirm group already fills its column at 1280 px in English.

Fix the rows rather than the base class: `flex-wrap` where buttons sit side by side, and let long labels wrap where a row cannot.

---

### Task 11: The tests, rewritten from the dictionary

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:** all 29 files that assert on English text, `apps/web/i18n/no-orphan-strings.test.ts`

**This gate scans source and therefore cannot see English that arrives over the wire.** Task 12 owns those; do not widen this gate to try, and say so in a comment so the next reader does not assume the gate covers more than it does.

**Rewrite selectors from `messages/ru.json`, never from the screen.** A spec that looks up a Russian string typed by hand will drift from the dictionary by a character and stop asserting anything while still passing.

- [ ] **The orphan-string gate.** A test that scans component sources for Latin text in user-visible positions — JSX text nodes, `aria-label`, `alt`, `title`, `placeholder` — and fails on anything outside an allow-list holding «TableTap», «Little Furnace» and the technology names. Assert the gate itself works by feeding it a fixture containing a stray English string and checking it fails.

---

### Task 12: The refusals the server sends, which no source scan can catch

**REQUIRED SUB-SKILLS:** superpowers:test-driven-development

**Files:** `apps/api/src/lib/errors.ts` and every `AppError` call site, `packages/shared/src/api.ts` (the error envelope), `apps/web/lib/api.ts`, `apps/web/components/admin/row-editor.tsx`, `apps/web/messages/*.json`

**Why this task exists, and why it was not in the plan.** Task 4's implementer found the landing printing an English sentence that arrives over the wire rather than living in a component. Measured: **53 `AppError` call sites** in `apps/api/src`, about 21 distinct English sentences, and the web renders them directly — `apps/web/lib/api.ts:32` reads `error.message`, and `components/admin/row-editor.tsx:45` interpolates it into «Couldn't …». A Russian interface would print English on every refusal, and **Task 11's gate cannot catch it**, because it scans source and these strings are never in the web's source.

**Why mapping the existing code is not enough.** The codes are too coarse: `NOT_FOUND` carries nine distinct messages — category, item, order, table and more — so a code-to-message map flattens nine useful refusals into one «Не найдено» and takes away the part the person needed.

**The shape.** The API keeps its English sentence, which is for logs and for developers, and gains a stable message key beside it. The web renders from the key through the dictionary and never from the sentence. A key the dictionary does not know falls back to a generic refusal rather than printing English.

- [ ] **Step 1: Failing test** — `apps/web/lib/api.test.ts`: an error envelope carrying a known key renders the Russian string; one carrying an unknown key renders the generic fallback and never the server's sentence; the server's English sentence never reaches the rendered output in either case.
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Widen the envelope.** Add the key to the error shape in `packages/shared/src/api.ts` and to `AppError`, then give every one of the 53 call sites its key. Keep the English sentence — it is what a developer reads in a log.
- [ ] **Step 4: Render from the key** in `apps/web/lib/api.ts` and `row-editor.tsx`, with the generic fallback.
- [ ] **Step 5: Sweep for other wire-borne English.** `apps/web/components/login-form.tsx:159` renders a message from better-auth, which is a second source and not an `AppError`. Report what you find; fix what is user-visible.
- [ ] **Step 6: Full gate and commit.**

## After the last task (controller)

1. Full gate with `--force`, then Compose + `pnpm e2e` + Lighthouse against the local stack — accessibility must stay 100 and CLS 0.
2. Check the four flex rows at 375 px and 1280 px with the longest Russian strings on screen.
3. Final whole-branch review (`superpowers:requesting-code-review`, most capable model) over `merge-base(main, HEAD)..HEAD`.
4. One fix wave, one scoped re-review, adjudicate residuals.
5. `superpowers:finishing-a-development-branch` with the pre-selected option: merge into `main` (fast-forward), delete the branch, the worktree and the plan's SDD workspace.
6. **Correct every document that describes the old landing.** `README.md` names it in six places and two of them now assert the opposite of what ships (`:50`, `:183`: the sign-in buttons no longer disappear under `DEMO_MODE=false`, because the staff band is deliberately ungated). The README legitimately describes the project, the demo and the stack — that is what a README is for, and it is not the page a guest reads — so this is a correction of false statements, not a rewrite. Check `docs/case-study.md` and `docs/adr/` for the same staleness.
7. Update the spec status, push, watch CI and the deploy workflow, confirm the live site answers in Russian, retake the screenshots, update memory.
