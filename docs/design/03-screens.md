# Phase 3 — The screens, and what moves

Date: 2026-09-17. Status: the four surfaces below were drawn, measured and approved by the owner on
2026-09-17. **The motion selection in §5 is the open item and the gate.**

Phase 2 set the material. This phase applies it, and every decision here was made by drawing the
thing and looking at it — twice, where the first drawing was wrong.

## 1. The landing: the tear is not a section divider

Three versions were drawn. The first put a torn edge between every section; the second made the page
a stack of sheets on a ground so the tear had something to bite against; the third removed them all
and kept one.

**The third ships.** The reason is the direction's own stated failure mode — "it fails if it becomes
texture and shadow cosplay" — and the rule that comes out of it is worth more than the page:

> **A tear goes only where the product actually tears a document, and only where something sits
> behind it.** Both conditions, or it is an ornament imitating paper.

On the landing nothing is torn, so the section rhythm is carried by proportion and a hairline rule,
exactly as the direction asks ("proportions, rules, mono, tear edges"). The one tear on the page is
on the ticket in the hero, where a ticket is genuinely torn off, against the dark rail behind it.
Being the only one, it reads as a device rather than as wallpaper.

## 2. The kitchen: tickets on a rail

Settled in Phase 2 §3 and unchanged by the screen work. Paper tickets, dark metal rail. The timer is
the loudest thing on the board because the board's job is "which ticket is oldest"; the control is
outlined and quiet; ember appears nowhere.

## 3. The guest: ember marks the act that commits

The menu was drawn first with an ember «Добавить» on every dish and an ember «Оформить заказ» in the
bar — four ember elements on one screen, which is precisely what Phase 2's rule forbids, written one
hour earlier. The rule caught its own author's draft.

**«Добавить» is outlined; ember belongs to «Оформить заказ».** Adding a dish is reversible and
repeated; placing the order is the act, and there is one of those on the screen.

The receipt is the payoff screen and the only guest surface where the mono and the tear are both
true at once. It also demonstrates the type split in one glance: **the document is monospace, the
money is not** — «Итого» sits in PT Mono, «1 700 ₽» in IBM Plex Sans with tabular figures.

### What measuring caught that looking did not

The owner said the menu looked crooked. It did, but not where either of us would have pointed:

- **Horizontally it was already exact** — content left edge 48 px on every element, right edge 555 px
  on every element. A fix by eye would have broken it.
- **The fault was vertical.** `align-items: end` pinned the price column to the bottom of each row,
  and each row's bottom is its own, so the price floated between the description and the allergen
  line instead of sitting on the dish name's baseline. Now 246/246, 358.5/358.5, 461.5/461.5.
- **And a binding constraint was being violated invisibly:** every control was 36 px against the
  guest surface's 44 px minimum — buttons and category chips alike. No eye catches 8 px; the
  measurement caught all of them at once.

**"It looks crooked" is a symptom, not a diagnosis.** The eye was right that something was wrong and
wrong about where.

## 4. The admin: a chart is reference, not a headline

Paper ground — the rail is the kitchen's and only the kitchen's. Figures in PT Sans Narrow with
tabular figures; every control 44 px; all blocks share one left and one right edge, measured.

Two applications of Phase 2's rules, both of which changed the drawing:

- **The week bars are ink, not ember.** A chart asks for nothing, and ember means "act". They were
  also lightened: at full ink the bars outweighed the four figures they exist to explain.
- **The bars are square-topped, and that is a boundary of the radius rule rather than an exception
  to it.** Radius belongs to what a hand touches. A bar is a mark, not an object, so the rule does
  not reach it and it takes none.

## 5. Motion: what is built — THE OPEN ITEM

`00-audit-motion.md` accepted seven and ranked them by how much each serves _the kitchen sees the
order the moment you tap_. That ranking is the right criterion and this phase keeps it. The audit
already fixes each one's trigger, values, CLS handling and reduced-motion behaviour, so what is left
is **how many**, and over-building motion is the failure mode the whole direction is trying to
avoid.

**Recommended: five of seven.**

| #   | What                                       | Why it is in                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The landing demonstrates the claim         | The only one a stranger ever sees, and it now has a home: the rail and ticket already drawn in the hero. The ticket arrives on the rail the same way it arrives on the real board — which is the point                                                                                                                                                   |
| 3   | A ticket's arrival says where it came from | The board is the product's heart, and the arrival is the claim being kept                                                                                                                                                                                                                                                                                |
| 4   | The timer crossing a threshold             | Says _this_ ticket went late **just now**, which a static board cannot distinguish from "has been late for six minutes". **Its prerequisite is already paid** — the localisation milestone reserved the timer's box in `ch` and pinned it with a test, so the layout shift the audit demanded be fixed "whether or not the motion ships" is already gone |
| 2   | The order's status change on the receipt   | The guest's half of the same event as #3. Building one without the other tells half the story                                                                                                                                                                                                                                                            |
| 6   | Controls answer the thumb                  | Systemic and cheap; it is the difference between a prototype and a product under a finger                                                                                                                                                                                                                                                                |

**Deferred: #5 the basket bar arriving from its edge, and #7 the basket sheet as a bottom sheet.**
Both are good and neither serves the ranking criterion — they polish transitions the guest passes
through once. They go to the backlog with their audit entries intact, so picking them up later costs
no re-analysis.

### The constraint that shapes all five

One rule in `globals.css` collapses every animation and transition to `--motion-instant` under
`prefers-reduced-motion`, and a test fails the build if any component writes its own branch. So:
**a reduced-motion user gets the instant end state, never an alternative.** Every one of the five
above passes the test the audit set — the meaning is already carried by a word, a colour, a position
or a live region, and the motion only makes it noticeable. Where a static carrier is missing, the
proposal adds one; #1 adds a live region announcing that the ticket is on the board, so the
demonstration is not bought with a picture.

## 6. What Phase 4 inherits

The token changes from Phase 2 (palette, the third face, the radius scale, one duration family), the
four surfaces above, and five motion behaviours whose values are already written down. Nothing in
this document is a sketch: every screen was rendered, and the numbers quoted in §3 and §4 are
measurements of the rendering, not intentions.
