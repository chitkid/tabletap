# Phase 2 — The system

Date: 2026-09-17. Status: palette, type and the kitchen's ground approved by the owner on
2026-09-17; the scales below follow from those and are open to correction in Phase 3, where they
first meet real screens.

This phase sets the material. It decides nothing about any individual screen — that is Phase 3 —
and it exists because a direction that is not reduced to values is a mood board.

## What it takes as decided, and does not reopen

- **Direction A «Тикет»**, applied to all four surfaces, the owner's risk accepted in full
  (`01-direction.md`).
- **Display face PT Sans Narrow.** Paratype drew it from Cyrillic and it is the face of Russian
  printed forms, which is the vernacular a ticket from a printer belongs to.
- **Rounded corners nearly everywhere**, the owner's standing constraint, with its recorded
  resolution: radius belongs to everything a hand touches; the square edge is reserved for where
  the paper is literally torn.
- **The copy contract** (`02b-copy-ru.md`) governs every string, including the one owner-approved
  exception it now carries.

## 1. The third face, and the zero

**PT Mono**, and only where the product is imitating a printed document: the kitchen ticket, the
guest's receipt, the printed QR sheet. Nowhere else.

The reasoning is worth keeping, because it inverts what the direction originally asked for.
Direction A promoted a mono to primary — "on the kitchen board the mono _is_ the typography". The
owner had already rejected IBM Plex Mono's dotted zero during the localisation milestone, and
numerals moved to IBM Plex Sans with `tabular-nums`. The obvious move was to swap the mono.

**Rendered and looked at, every monospace face marks its zero.** IBM Plex Mono dots it; PT Mono,
Roboto Mono and Noto Sans Mono slash it. A marked zero is not a quirk of one family, it is the
defining feature of the genre — telling `0` from `O` is what a monospace face is for. So "pick a
different mono" was never a solution, and the real question was where a marked zero is right.

It is right on a printed document, where a slashed zero reads as the vernacular of a receipt, and
wrong in a price, where it reads as fussiness. Hence the split:

| Role                      | Face                                                         | Where                                                    |
| ------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Display                   | PT Sans Narrow 400 / 700                                     | Headings, the hero, column heads, the wordmark           |
| Text and **every amount** | IBM Plex Sans 400 / 500 / 600, `tabular-nums` on all figures | Everything else, and all money without exception         |
| Printed document          | PT Mono 400                                                  | Kitchen tickets, the guest receipt, the printed QR sheet |

Verified rather than assumed: nine of the ten candidate monospace faces on Google Fonts carry
Cyrillic (only Space Mono does not), so the constraint that decided the display face — most
condensed faces have no Cyrillic at all — does not bind here. The first query said the opposite and
was wrong: Google Fonts serves different subsets to different user agents, and the probe had not
sent a browser's.

## 2. Palette

Thermal paper, not cream. Cooler and slightly grey, because that is what the stock is.

| Token       | Value     | Role                                                                    |
| ----------- | --------- | ----------------------------------------------------------------------- |
| `paper`     | `#EDEAE3` | The document itself: tickets, cards, sheets, the guest and admin ground |
| `ink`       | `#23201D` | Printed ink. Never pure black                                           |
| `ink-muted` | `#6B6459` | Secondary text, column heads, quantities                                |
| `rule`      | `#CFC8BB` | The line inside a document. Not a section divider — that is the tear    |
| `rail`      | `#2A2724` | The kitchen's ground, and only there. See §3                            |
| `rail-head` | `#211F1C` | The kitchen's header band                                               |
| `ember`     | `#C23E18` | **The one warm thing.** It means "act" and it belongs to the guest      |
| `ready`     | `#3F7D4E` | Status only, never decoration                                           |
| `late`      | `#B3271A` | Status only                                                             |

**The ember rule is the one most likely to erode, so it is stated as a rule rather than a
convention: ember marks the action a guest takes, and appears nowhere on the kitchen board.** The
direction said ember would be "used far less"; three orange buttons on one screen is not less, and
the first draft of the board had exactly that.

## 3. The kitchen's ground: a rail, not a theme

The tickets are paper. **What they hang on is dark metal**, because that is what a ticket rail is.
This was arrived at by drawing the board both ways and looking, and it is the direction's own logic
rather than an exception to it.

Two things the drawing settled that the description could not:

- **Figure and ground.** Paper tickets on a paper ground blur together at the distance a board is
  actually read from. On the rail the separation is absolute.
- **The tear only reads as a tear when there is something behind it.** On paper the perforated edge
  was a faint texture on more of the same; on the rail it is a silhouette, and the paper genuinely
  looks torn. The structural device the whole direction rests on needs the dark to exist.

A consequence worth stating: this is **not** the dark theme the board wears today. Today's board is
dark because a screen at eye level for a whole shift should not glare. That reason survives; what
changes is that the darkness now means something — it is the rail — and the tickets on it stop
being cards and become paper.

## 4. Radius

The rule, from Phase 1: **radius belongs to everything a hand touches; the square edge is reserved
for where the paper is literally torn.** A single value applied everywhere is as thoughtless as
none, so there is a scale, and it is short.

| Token            | Value             | Applies to                                                         |
| ---------------- | ----------------- | ------------------------------------------------------------------ |
| `radius-chip`    | `999px`           | Status chips, counters — objects with no content edge of their own |
| `radius-control` | `0.625rem` (10px) | Buttons, inputs, selects, the things pressed and typed into        |
| `radius-card`    | `0.875rem` (14px) | Tickets, dish cards, panels, sheets                                |
| `radius-tear`    | `0`               | The torn edge, and nothing else in the product                     |

`radius-tear` exists as a named token precisely so that a future square corner has to say it is a
tear. An unnamed `0` is how the exception spreads.

## 5. Spacing

The existing 4 px base stands; this phase does not change it. It is recorded here only so that
Phase 3 has one place to look.

## 6. Motion

### 6.1 There are two duration families and they disagree. This phase ends that.

`00-audit-motion.md` §1.2 found it and `docs/backlog.md` recorded it with no task owning it:

| Where                                                  | Tokens                                                                              | Governed by `validate-tokens`? |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------ |
| `assets/design-tokens.json` → `packages/ui/tokens.css` | `--duration-fast: 120ms`, `--duration-base: 180ms`                                  | yes                            |
| `packages/ui/theme.css`, hand-written                  | `--motion-fast: 180ms`, `--motion-base: 280ms`, `--motion-ease`, `--motion-instant` | **no**                         |

"Fast" in one family is "base" in the other, and the second family is not in the token pipeline at
all — which is why nothing caught the disagreement. Two elements in one event moving at 120 ms and
280 ms is the ordinary cause of "something feels off", and three of the seven accepted motion
opportunities put exactly such a pair on screen together.

**One family, in the pipeline.** The names below are the ones that survive; the `--duration-*` pair
is removed and its five consumers repointed.

| Token            | Value                        | What it is for                                                                  |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `motion-instant` | `0.01ms`                     | The reduced-motion collapse. Not a speed — a substitution                       |
| `motion-fast`    | `120ms`                      | A control answering a press or a hover. Nothing travels                         |
| `motion-base`    | `280ms`                      | An element arriving, leaving, or changing state where the change is the message |
| `motion-ease`    | `cubic-bezier(0.2, 0, 0, 1)` | Everything. A second curve needs a reason this document does not have           |

`motion-fast` keeps 120 ms rather than 180 ms deliberately: the value that was already reaching a
finger on every button in the product is the one with evidence behind it.

### 6.2 Reduced motion is architecture, and it is not touched

One rule in `globals.css` collapses every animation and transition — durations **and** delays — to
`motion-instant`, and `globals.test.ts` fails the build if any component writes its own
`motion-reduce:` branch. That is the right shape and this phase keeps it whole.

Its consequence binds every proposal in Phase 3, so it is restated here: **a reduced-motion user
always gets the instant end state, never a bespoke alternative.** Any motion whose message exists
only in the movement becomes nothing for that user. So motion may make a change _noticeable_; it
may never be the only thing that carries it. Where a Phase 3 proposal needs a static carrier that
does not exist yet, it adds one rather than asking for a branch the test forbids.

## 7. What this phase does not decide

Screens. Which of the seven accepted motion opportunities is built, and how, is Phase 3, and the
gate is there rather than here. This document is the material; Phase 3 is what is made from it.
