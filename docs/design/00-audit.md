# Phase 0 — Audit

Date: 2026-09-13. Subject: TableTap, all four surfaces, live at https://tabletap-web.vercel.app.
Status: complete. No code was changed.

This file is the index and the synthesis. The two detailed reports are:

- [`00-audit-ui.md`](00-audit-ui.md) — 55 findings across the ten `ui-ux-pro-max` priorities.
- [`00-audit-motion.md`](00-audit-motion.md) — 7 motion opportunities accepted, 14 rejected with reasons.

## Scope decision this audit was written against

The commissioning brief describes three subsystems. The owner split them into two milestones
(2026-09-13):

1. **Russian localization** — language, roubles, dictionaries, seed data, metadata, tests. First,
   because Russian strings run 15–30% longer and designing a layout on English strings to swap
   Russian in afterwards is the way to break it.
2. **Redesign and motion together** — visual tokens and motion tokens are one system, and splitting
   them means opening the same files twice.

How far the redesign reaches into the existing brand system is deferred until Phase 1 presents
directions. One part is not deferred, because it is forced: see the typography finding below.

## The screen and state map

Eighteen route files under `apps/web/app`. Two components hold a socket:
`components/kitchen/kitchen-board.tsx` and `components/order/order-live.tsx` — those are the only
places where "realtime" is a state rather than a word.

| Surface     | Route                         | idle                    | loading                | empty                       | error                                   | success             | realtime                       |
| ----------- | ----------------------------- | ----------------------- | ---------------------- | --------------------------- | --------------------------------------- | ------------------- | ------------------------------ |
| **Landing** | `/`                           | three role cards        | —                      | demo off → plain page (404) | 409 → notice, links hidden              | —                   | none                           |
| **Guest**   | `/t/[token]`                  | claiming                | —                      | —                           | expired/revoked QR → explanation        | → `/menu`           | none                           |
|             | `/menu`                       | categories + dishes     | `app/menu/loading.tsx` | —                           | —                                       | basket bar appears  | none                           |
|             | `/checkout`                   | lines + note            | submitting             | empty basket                | refusal message                         | → `/orders/[id]`    | none                           |
|             | `/pay/[id]`                   | demo terminal           | processing             | —                           | declined → retry offered                | → receipt           | none                           |
|             | `/orders/[id]`                | receipt + progress rail | —                      | cleared by reset → notice   | socket down → status region             | paid badge          | **status changes over socket** |
| **Kitchen** | `/login`                      | form                    | signing in             | —                           | wrong password → brand-voice message    | → `/kitchen`        | none                           |
|             | `/kitchen`                    | three columns           | —                      | "Nothing here." per column  | connection banner (box reserved)        | ticket advances     | **tickets arrive and move**    |
| **Admin**   | `/admin` → `/admin/dashboard` | four figures + bar week | —                      | "No orders yet."            | guarded lookup → boundary avoided       | —                   | none                           |
|             | `/admin/menu`                 | rows, edit in place     | saving                 | no dishes                   | `RowNotice` (box reserved at `min-h-5`) | check on the button | none                           |
|             | `/admin/tables`               | rows, QR actions        | reissuing              | no tables                   | refusal names the verb                  | new QR version      | none                           |

## What the two audits agree on, having arrived separately

Both reports land on the same structural problem with the landing, by different routes. The UI
audit reaches it from layout: `landing-content.tsx:133-206` gives the three role cards identical
structure, and because the guest card's QR sets the row height, roughly 350 px of the other two is
empty. The motion audit reaches it from meaning: the page asserts "the kitchen sees it the moment
you tap" in text and demonstrates it nowhere, while the one control that would demonstrate it —
"Simulate rush" — fires twelve orders at a board the visitor is not looking at.

They propose the same fix without having seen each other: put a live board on the landing and let
the visitor cause a ticket to appear on it. That convergence is the strongest single result in this
phase, and Phase 1 should treat the landing's structure as decided and spend its invention
elsewhere.

## Findings that change the first milestone, not the second

**`lang="en"`** at `apps/web/app/layout.tsx:44`, with four more hardcoded locales behind it:
`lib/money.ts:10` (`'en-US'`), `week-bars.tsx:11,17`, and binary plurals at `basket-bar.tsx:36`
(`count === 1 ? 'item' : 'items'`) and `week-bars.tsx:27`. All verified in the source.

The accessibility part of this is invisible to the gate that is supposed to catch it: Lighthouse's
`html-has-lang` checks that the attribute exists and is well-formed, never that it matches the
content. The page will keep scoring accessibility 100 while a screen reader pronounces Russian with
English phonetics. It is the cheapest change in either report and the only one whose cost multiplies
after the strings swap.

**The display face has no Cyrillic.** Queried from Google Fonts directly: Bricolage Grotesque serves
`vietnamese, latin-ext, latin`; IBM Plex Sans serves `cyrillic-ext, cyrillic, greek, vietnamese,
latin-ext, latin`. So the body and mono faces survive the translation and the display face cannot.
This reopens the typography decision `docs/brand-guidelines.md` §2 records — a decision reached by
rejecting five alternatives — and it reopens it in the _first_ milestone rather than the second.

**Sixteen latent layout breaks**, plus one already broken in English (the landing CTAs between
640 and 768 px). The class is worth naming once rather than sixteen times: `packages/ui/src/components/button.tsx:8`
sets `shrink-0` and `whitespace-nowrap` on every button in the product, and four call sites put
buttons in a row with no `flex-wrap` — `kitchen/ticket-card.tsx:119-149`, `admin/tables-table.tsx:267-271`,
`basket/basket-bar.tsx:32-41`, `pay/demo-terminal.tsx:123-135`. The kitchen confirm group already
fills its column at 1280 px in English. These must be found while the English strings are still on
screen to compare against; after the swap there is nothing to compare to.

**The timer badge shifts the board, minutes after load.** `kitchen/timer-badge.tsx:11-19,35`:
`Mark` renders `null` below the warning threshold and an `svg.size-5` above it, and `SUFFIX` adds
` · 5 min` and then ` · late`. The span is `whitespace-nowrap`, so it widens rather than wraps, which
on a three-column board can wrap the ticket header, grow the card, and move every card below it.

This qualifies a claim this repository ships. `README.md` and `docs/case-study.md` say CLS is 0 on
all six audited pages. That is true and measured. What is now also known is the boundary: the
measurement window is seconds long and this shift happens minutes in, so "CLS 0" describes what
Lighthouse can see rather than what the board does during a shift. Localization makes it worse —
` · 5 min` becomes ` · 5 мин` and ` · late` becomes a word roughly twice as long.

## What was clean, recorded as a result

Accessibility, the reduced-motion architecture and the token layer were audited and found genuinely
clean, with figures rather than assurances — see `00-audit-ui.md` §1 and `00-audit-motion.md` §1.3
and §1.4. Three of the ten priorities returning little is the honest outcome of work already done in
milestones 1 through 6, and padding them would have hidden where the product is actually weak.

One exception inside that clean layer, already on the backlog and confirmed again here: there are
two duration families with colliding names and different values — `--duration-fast: 120ms` generated
into `packages/ui/tokens.css`, `--motion-fast: 180ms` hand-written into `packages/ui/theme.css` —
and `validate-tokens` cannot see the second because it scans `apps/` and `packages/ui/src` only. The
commissioning brief proposes a third family. Phase 2 resolves this to one; a motion system built on
two disagreeing vocabularies is built on sand.

## What this phase did not do

The brief's Phase 1 calls for the 21st MCP server — inspiration, component search, themes, and
recorded accept/reject feedback. **That server is not authorized in this session**, so none of it
ran. Phase 1 can proceed on `ui-ux-pro-max` and `frontend-design` alone; the 21st steps stay
unexecuted and are named here rather than quietly skipped.
