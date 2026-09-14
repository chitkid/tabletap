# Russian Localisation — Design Spec

Date: 2026-09-14. Status: approved by the owner on 2026-09-14 (glossary and landing copy approved
from `docs/design/02b-copy-ru.md`); implementation plan pending.
Project: TableTap — QR table ordering with a live kitchen display (portfolio full-stack project).
Milestone: the first of two agreed on 2026-09-13. The second is the redesign and its motion system.

## 1. Goal and scope

Russian becomes the product's language on all four surfaces. Not a pass through a translator: a
localisation with editorial work, a single glossary, correct plurals, roubles, and a demo whose menu
reads like a real café's rather than a translated one.

In scope:

- **An i18n layer**: every user-visible string in a dictionary, none left in JSX.
- **`messages/ru.json`** as the product's language and **`messages/en.json`** kept as a fallback and
  as the seed of a future switcher.
- **Money in roubles**, one helper, `Intl`-formatted, no `$` and no hand-concatenated symbol.
- **Demo data** rewritten: dishes, categories, descriptions, notes, staff names.
- **Metadata and the link preview** regenerated in Russian, `<html lang="ru">`.
- **Plurals and formats** through ICU and `Intl`, never through `if`.
- **The display face replaced**, because the current one has no Cyrillic. Forced into this milestone.
- **Tests rewritten** against Russian names, plus a test that no orphan English UI string remains.

Out of scope, with the reason:

- **The redesign and the motion system.** They are the second milestone; this one changes words,
  money and one font, and leaves the layout where it is.
- **A language switcher in the interface.** Russian is the product's language. `en.json` is kept so
  a switcher is a later feature rather than a rewrite, but shipping one now buys nothing and costs
  routing.
- **An `accepted` order status.** The brief's glossary names one; the product has no such state and
  inventing it would be a domain change. Recorded in `02b-copy-ru.md`.

## 2. Decisions

| Question | Decision |
|---|---|
| Which i18n library | **`next-intl`**, no routing segment. It gives ICU message syntax, server and client support under the App Router, and typed message keys. The alternative — a hand-rolled dictionary over `Intl.PluralRules` — reinvents ICU parsing for the sake of a few kilobytes. |
| Locale routing | **None.** One locale is served; `en.json` exists as a fallback file, not as a route. A `/ru` prefix would change every public URL, which the master brief forbids without a decision of its own. |
| Currency | **RUB everywhere**, `maximumFractionDigits: 0` in the menu. The `currency` column stays per-restaurant and its default changes; amounts stay integer kopecks, exactly as they are cents today. |
| Demo prices | **Rewritten, not converted.** Coffee 250–350 ₽, salads 450–650 ₽, mains 700–1 200 ₽. A converted dollar price reads as a converted dollar price. |
| The restaurant's name | **Little Furnace stays.** A Russian café with an English sign is ordinary, and renaming it would invalidate the wordmark, the brand guidelines' §3 and the seeded QR tokens for no gain the guest can see. |
| Display face | **PT Sans Narrow** replaces Bricolage Grotesque, which serves no Cyrillic. Body IBM Plex Sans and mono IBM Plex Mono are kept — both carry drawn Cyrillic. |
| Numerals | **IBM Plex Sans with `tabular-nums`**, not IBM Plex Mono, whose default zero carries a dot the owner rejected. Prices, timers, table numbers and money columns all move. |

## 3. The glossary is the contract

`docs/design/02b-copy-ru.md` holds the approved status glossary, the terminology table, the
editorial rules and the full landing copy. It is the single source for wording, and a string that
contradicts it is a defect rather than a preference.

Two rules from it govern every screen. **The guest is told what happens to them; staff are told what
the order is** — which is why `ready` is «Готов — сейчас принесут» on a phone and «Готов» on the
board. And **the verb on a button is the verb in its result**: «Оформить заказ» → «Заказ оформлен».

## 4. What the landing becomes

The owner's instruction on 2026-09-14: the site must read as a real restaurant's, not as a
demonstration of a project. Everything naming the demo or the stack goes — the demo-mode notice, the
rush button, the technology list, the repository link, the three role cards.

Two of those notices described real behaviour, and removing the words does not remove the behaviour.
They are replaced by explanations at the moment they apply:

- **The hourly reset.** No banner. When an order is gone, its own screen says so: «Этот заказ больше
  не активен. Отсканируйте код на столе, чтобы начать заново.»
- **The cold start.** No warning. A loading state that reserves its space and does not pretend to be
  instant.

Staff entrances stay **visible**, by the owner's decision: a link in the header and a dark band at
the foot of the page — the front of house and the back of house, separated the way they are in the
building.

## 5. Where the work actually is

Measured on 2026-09-14, not estimated: **29 non-test `.tsx` files** carry user-visible English,
roughly **670 quoted phrases**, and **29 test files** assert on English text.

The test rewrite is therefore comparable in size to the translation itself, and it is where this
milestone will be won or lost: a Playwright spec that looks up `getByRole('button', { name: 'Place
order' })` fails silently useful information when it is changed carelessly to a Russian string that
does not match the dictionary. Tests are rewritten from the dictionary, not from the screen.

One more, and it is the cheapest defect in the audit to fix and the most expensive to leave:
`apps/web/app/layout.tsx:44` says `lang="en"`, and Lighthouse's `html-has-lang` will keep scoring
100 because it checks the attribute exists, never that it matches the content.

## 6. Layout under longer strings

Russian runs 15–30% longer. The audit found **16 latent breaks and one already broken in English**,
and named the class: `packages/ui/src/components/button.tsx:8` sets `shrink-0` and
`whitespace-nowrap` on every button, and four call sites place buttons in a row with no `flex-wrap`
— `kitchen/ticket-card.tsx`, `admin/tables-table.tsx`, `basket/basket-bar.tsx`,
`pay/demo-terminal.tsx`.

These are fixed in this milestone rather than deferred to the redesign, because the English strings
are still on screen to compare against and after the swap they are not.

The kitchen timer badge is the other one: `timer-badge.tsx` inserts a glyph and a suffix at the
five-minute threshold, widening a `whitespace-nowrap` span. In Russian the suffix grows further.
Its box is reserved in this milestone.

## 7. Verification

- **No orphan strings.** A test that greps the built output and the component sources for Latin UI
  text, allowing only the brand name and technology names.
- **Plurals.** Unit tests over 1, 2, 5, 11, 21, 101 for every counted noun — the numbers where
  Russian's three forms differ and a binary rule passes by accident.
- **Money.** `formatPrice` tested for the space, the symbol's position and the absence of kopecks.
- **Playwright** rewritten against Russian accessible names, and every existing spec green.
- **Layout.** The four flex rows checked at 375 px and 1280 px with the longest Russian strings.
- **Lighthouse** accessibility stays at 100 on six pages, and CLS stays 0.
