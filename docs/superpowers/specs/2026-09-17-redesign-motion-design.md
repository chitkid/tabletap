# Redesign and Motion — Design Spec

Date: 2026-09-17. Status: approved by the owner on 2026-09-17 (direction, system and screens
approved in `docs/design/01-direction.md`, `02-system.md`, `03-screens.md`; the motion selection
approved at the Phase 3 gate).
Project: TableTap — QR table ordering with a live kitchen display (portfolio full-stack project).
Milestone: the second of two agreed on 2026-09-13. The first, Russian localisation, is merged and
live.

## 1. Goal and scope

Direction A «Тикет» becomes the product, on all four surfaces. The paper organises everything: the
kitchen sees tickets, the guest gets a receipt, the admin reads a day's roll.

In scope:

- **The token layer.** Thermal palette, the radius scale, one duration family instead of two, and
  the third face. This is where most of the work lives and it is deliberately first.
- **PT Mono loaded and used** on the printed-document surfaces only. Today nine `font-mono` call
  sites fall back to the system monospace because no mono face has ever been registered.
- **The four surfaces** re-laid to `03-screens.md`: landing, guest (menu, basket, checkout,
  receipt), kitchen board, admin (dashboard, menu, tables).
- **Five motion behaviours** of the seven the audit accepted, with the audit's own values.
- **The printed QR sheet and the link preview** follow the palette and the face.

Out of scope, with the reason:

- **Motion opportunities #5 and #7** (the basket bar arriving from its edge, the basket sheet as a
  bottom sheet). Accepted by the audit, deferred at the Phase 3 gate because neither serves the
  ranking criterion. They go to the backlog with their analysis intact.
- **New product behaviour.** No screen gains a capability. If a redesign task finds itself adding
  one, that is a signal the design was under-specified, not a licence.
- **The brand wordmark.** `docs/brand-guidelines.md` §3 was corrected to PT Sans Narrow during the
  localisation milestone and is not reopened here.

## 2. What the tree says about the size of this

Measured on 2026-09-17, not estimated:

| | |
| --- | --- |
| Surface components (`apps/web/components`) | 31 |
| Shared components (`packages/ui/src/components`) | 10 |
| Tokens in `assets/design-tokens.json` | 174, of which 53 are colour primitives |
| Hand-written variables in `packages/ui/theme.css` | 67 |
| Files referencing a colour token class directly | **1** |

The last row is the one that shapes the plan. Colour reaches components through the semantic and
component layers, not through raw classes — `validate-tokens` has kept that true — so **a palette
change is an operation on the token file, not a sweep through forty components.** The 67
hand-written variables in `theme.css` are the exception, and they are where the second duration
family lives.

## 3. Decisions

| Question | Decision |
| --- | --- |
| Palette | Thermal paper `#EDEAE3`, ink `#23201D`, rule `#CFC8BB`, muted `#6B6459`; rail `#2A2724` for the kitchen only; ember `#C23E18`, ready `#3F7D4E`, late `#B3271A` |
| What ember means | **The act that commits.** One per screen at most. It appears nowhere on the kitchen board and nowhere in a chart |
| The third face | **PT Mono**, on the kitchen ticket, the guest receipt and the printed QR sheet. Nowhere else, and never on money |
| Money | IBM Plex Sans with `tabular-nums`, everywhere, without exception |
| The kitchen's ground | A dark rail. Paper tickets hang on it, which is what a ticket rail is. Not a dark theme |
| Radius | `chip 999px`, `control 10px`, `card 14px`, and a named `tear 0` so a future square corner must declare itself a tear |
| The tear | Only where the product tears a document **and** something sits behind it. Both conditions |
| Duration family | One: `motion-instant 0.01ms`, `motion-fast 120ms`, `motion-base 280ms`, `motion-ease cubic-bezier(0.2, 0, 0, 1)`. The `--duration-*` pair is removed and its five consumers repointed |
| Reduced motion | The existing architecture is kept whole: one collapse rule, and a test that fails the build on any component-level branch |

## 4. Architecture of the change

**The token layer moves first, and alone.** Palette, radius, motion and the font registration land
before any surface is touched, so every later task is applying a system rather than negotiating with
one. `packages/ui/theme.css`'s hand-written block is folded into `assets/design-tokens.json` in the
same task; leaving it outside the pipeline is what let two duration families disagree unnoticed.

**Then one surface per task**, in the order they carry the direction: kitchen, guest, landing,
admin. The kitchen is first because the rail and the ticket are where the material is proved, and
because every other surface borrows their vocabulary.

**Motion last, and as one task per behaviour**, because each has its own trigger, its own
reduced-motion carrier and — for two of them — its own prerequisite.

## 5. The traps this milestone already knows about

These are not general advice; each cost something in the two milestones behind this one and each
applies here.

- **A measurement of one renderer is not a threshold for all of them.** Russian labels are ~3.5%
  wider on Linux than on Windows in IBM Plex Sans, which wrapped the admin row on CI after it fitted
  with 7.82 px to spare locally. Any width tuned by measuring needs slack, and the gate machine is
  the one that decides.
- **A check whose expected value, reach or resolution derives from the thing it checks moves with
  the defect.** Twelve instances in the localisation milestone. Prove every guard by making the edit
  it forbids.
- **An edit with no assertion that it applied is not an edit.** This happened during Phase 3's own
  drawing: a silent no-op replace, followed by rendering and inspecting a page believed to be
  changed.
- **"It looks wrong" is a symptom.** Measure before touching. On the guest menu the horizontal
  alignment was already exact and the fault was vertical — and the same measurement found every
  control 8 px under the 44 px minimum, which no eye catches.

## 6. Verification

- **Every surface is rendered and looked at**, not described. The Phase 3 drawings are the reference
  and the numbers in `03-screens.md` are measurements of them.
- **Touch targets** ≥ 44 px on guest and kitchen, asserted rather than eyeballed.
- **`validate-tokens`** stays green, and now governs the variables that were hand-written.
- **Lighthouse** accessibility stays 100 on six pages and **CLS stays 0** — including with the
  motion in place, which is why every accepted behaviour reserves its box.
- **Reduced motion**: `globals.test.ts` keeps failing the build on a component-level branch, and
  each motion task adds the static carrier its audit entry names.
- **The e2e suite** runs on Linux before merge, because that is where the last milestone's only red
  build came from.
