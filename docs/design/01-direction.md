# Phase 1 — Design direction

Date: 2026-09-13. Three directions, one to be chosen. No code written.

## What this phase was allowed to take as decided

Phase 0 produced one structural verdict from two independent audits that had not seen each other:
the landing must **demonstrate** the product's claim rather than assert it, with a live board the
visitor causes a ticket to appear on. That is treated as settled. These directions differ in
everything else and agree on that.

## The subject, pinned

A restaurant room and its kitchen on an evening shift. Not "hospitality" and not "food SaaS" — one
room with tables, a pass, a board, a printer that cuts paper, a timer that goes from green to
something worse, and a QR sticker on table 7 that somebody's thumb has already smudged.

Every distinctive decision below comes from that room's materials. Where a decision could have come
from any SaaS brief, it has been replaced.

## The uncomfortable calibration note

`frontend-design` warns that machine-made design clusters around three looks, the first being _warm
cream background, high-contrast display, terracotta accent._ TableTap today is that cluster almost
exactly: oat background, ember CTA, dark serif-adjacent display. It is executed carefully — the
contrast figures hold, the tokens are clean — but as a _direction_ it is the default rather than a
choice. That is the honest starting point, and it is why none of the three directions below keeps
the oat-and-ember landing as it stands.

## What the recommendation engine returned, and why it is not used

`ui-ux-pro-max --design-system` for this product returns **Playfair Display SC + Karla**. Two
independent reasons to decline it, both checkable:

1. `docs/brand-guidelines.md` §2 already rejected this exact pairing in M1, naming it "the
   display-serif restaurant cliché the spec rules out".
2. **Karla has no Cyrillic.** Queried from Google Fonts: `latin-ext, latin`. For a product being
   translated to Russian this is disqualifying on its own.

The engine's _structural_ recommendation — pattern "Product Demo + Features", an interactive mockup
in the hero — is adopted, because it corroborates the two audits from a third direction.

## Type candidates, verified rather than assumed

Subsets queried directly from Google Fonts on 2026-09-13. Cyrillic present unless noted.

| Face                    | Subsets served                                                      |
| ----------------------- | ------------------------------------------------------------------- |
| Unbounded               | cyrillic-ext, cyrillic, vietnamese, latin-ext, latin                |
| Golos Text              | cyrillic-ext, cyrillic, latin-ext, latin                            |
| Oswald                  | cyrillic-ext, cyrillic, vietnamese, latin-ext, latin                |
| Geologica               | cyrillic-ext, cyrillic, greek, vietnamese, latin-ext, latin         |
| Onest                   | cyrillic-ext, cyrillic, math, symbols, vietnamese, latin-ext, latin |
| Bitter                  | cyrillic-ext, cyrillic, vietnamese, latin-ext, latin                |
| PT Sans Narrow          | cyrillic-ext, cyrillic, latin-ext, latin                            |
| IBM Plex Sans           | cyrillic-ext, cyrillic, greek, vietnamese, latin-ext, latin         |
| **Bricolage Grotesque** | vietnamese, latin-ext, latin — **no Cyrillic, cannot stay**         |
| **Karla**               | latin-ext, latin — **no Cyrillic**                                  |

IBM Plex Sans and IBM Plex Mono survive the translation and are kept in all three directions: Plex
has real tabular numerals, which prices, timers and table numbers depend on, and its Cyrillic is
drawn rather than adapted. Only the display face is in play.

---

## Direction A — «Тикет»

**Thesis.** The product's real artifact is a piece of paper that comes out of a printer in a hot
room. Build the entire interface as that document: the kitchen sees tickets, the guest gets a
receipt, the admin reads a day's roll. One material, applied honestly, top to bottom.

**Palette.** Thermal paper, not cream — cooler and slightly grey, because that is what the paper is.

| Role          | Hex       | From                                   |
| ------------- | --------- | -------------------------------------- |
| Paper         | `#EDEAE3` | thermal stock, cooler than today's oat |
| Thermal black | `#23201D` | printed ink, never pure black          |
| Ember (kept)  | `#C23E18` | the one warm thing, now used far less  |
| Ready         | `#3F7D4E` | status only, never decoration          |
| Late          | `#B3271A` | status only                            |

**Type.** Display **Oswald** — condensed, signage, the face on a kitchen sign or a printed header.
Body **IBM Plex Sans**. Ticket and data **IBM Plex Mono**, promoted from utility to a primary role:
on the kitchen board the mono _is_ the typography.

**Hero, in Russian.**

> ## Заказ со стола.
>
> ## Через секунду он на кухне.

Under it, one frame: a phone on the left, a printer on the right. Press the button on the phone and
paper advances out of the printer with the ticket on it. The visitor causes it.

**Structural device.** Perforation and the tear line. Sections are separated the way paper is, not
by a hairline rule. Numbering appears only in "Как это работает", because that is the one place the
content really is a sequence.

**The risk.** A paper metaphor carried into the admin surface, in 2026, next to a decade of flat
design. It fails if it becomes texture and shadow cosplay; it works if it stays structural —
proportions, rules, mono, tear edges — with no drop shadows pretending to be paper.

**Cost.** Oswald is a common face; the distinctiveness has to come from the mono-led board and the
paper structure, not the display.

---

## Direction B — «Смена»

**Thesis.** The room is dark and the screens are the light. A restaurant at eight in the evening is
lit in pools; the kitchen display is the brightest rectangle in the building. Invert the product:
dark is the default surface, light is the exception the admin works in by daylight.

This is less of a leap than it reads — the kitchen board is **already** dark (`#151311`). The
direction extends what the product's most-used surface already is, instead of keeping it as the odd
one out.

**Palette.**

| Role         | Hex       | From                                     |
| ------------ | --------- | ---------------------------------------- |
| Room         | `#141210` | the dining room after dark               |
| Pass         | `#1F1B18` | the lit counter between room and kitchen |
| Lamp         | `#E8DCC8` | warm light on a table, the text colour   |
| Ember (kept) | `#F0663D` | the existing kitchen-surface ember       |
| Ready        | `#5FBF7A` | status only                              |

**Type.** Display **Unbounded** — geometric, slightly strange, unmistakably not a default; it has
real Cyrillic and enough weight range to carry a hero. Body **Onest**, drawn for Cyrillic first.
Data **IBM Plex Mono**.

**Hero, in Russian.**

> ## Вечер. Зал заказывает —
>
> ## кухня уже готовит.

Two screens glowing in one dark frame: a phone at a table, a board at the pass. Everything else on
the page is nearly black; the only bright things are the two screens and one ember control.

**Structural device.** Light, not lines. Sections are separated by how lit they are. No dividers at
all on the landing.

**The risk.** Dark-first for a product sold to restaurant owners, where the category is
overwhelmingly light. It fails if the guest's menu — read at a table, often one-handed, sometimes in
sunlight — becomes hard to use. Mitigation is part of the direction, not an afterthought: the guest
surface stays light, and the inversion applies to the landing, kitchen and demo chrome.

**Cost.** Two full palettes designed and contrast-checked rather than one, and the guest/kitchen
split becomes a real seam that has to be made deliberate rather than accidental.

---

## Direction C — «Раздача»

**Thesis.** The product is a handover. Everything is two-sided: table and kitchen, guest and cook,
before and after. Make the seam the organizing device of every layout — the page is split, and the
split is where the meaning is.

**Palette.** Two sides that differ in temperature, meeting at a hard edge.

| Role         | Hex       | From                                |
| ------------ | --------- | ----------------------------------- |
| Room side    | `#F2EDE4` | warm, the guest's half              |
| Kitchen side | `#191B1C` | cool, the cook's half               |
| Steel        | `#8A9296` | the pass counter, rules and borders |
| Ember (kept) | `#C23E18` | the event that crosses the seam     |
| Ready        | `#4C8B5B` | status only                         |

**Type.** Display **Geologica** — a variable technical grotesque with width axes, so the same family
carries a wide hero and a condensed ticket header; instrument-like rather than hospitality-like.
Body **IBM Plex Sans**, data **IBM Plex Mono**.

**Hero, in Russian.**

> ## Одна секунда
>
> ## между столом и кухней.

The frame is split down the middle: guest left on warm paper, board right on cool steel. The ticket
is the only object that crosses the line, and it crosses when the visitor presses.

**Structural device.** The seam itself — a single vertical rule that persists down the landing,
moving as the content's sides change weight.

**The risk.** A hard split is a strong, rigid device that has to survive mobile, where there is no
"beside". The direction's answer is that on narrow screens the seam becomes horizontal and the
handover reads top-to-bottom, which is a different composition rather than a collapsed one — that
has to be designed, not assumed.

**Cost.** The most layout work of the three, and the split must not turn every screen into two
columns of unrelated content.

---

## Recommendation

**B, «Смена».** It is the only one whose central idea is the product's central claim: two places,
one moment, and light travelling between them. It extends a surface the product already has rather
than inventing one. Its display face is the least likely of the three to be mistaken for a template,
and its risk is real but bounded — the guest surface stays light, which is where the risk would
actually cost something.

A is the safest and the most likely to charm; its weakness is that Oswald and paper are a
combination a viewer has seen. C is the most intellectually tidy and the most expensive, and its
device is the one most likely to fight mobile.

## Not executed

The brief's 21st MCP steps for this phase — `get_inspiration`, `search`, `get_theme`,
`record_inspiration_feedback` — did not run. That server is not authorized in this session. Named
here rather than skipped quietly.
