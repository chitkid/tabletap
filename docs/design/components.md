# Component state specs

> Source of truth for identity: `docs/brand-guidelines.md`. Token values: `assets/design-tokens.json`,
> generated into `packages/ui/tokens.css` and aliased for Tailwind in `packages/ui/theme.css`.
> Motion choreography: `docs/design/motion-spec.md` — M6; no motion ships in M1.

Every cell below is a token name, never a colour or a measurement. The same token name resolves to a
different value per surface: the guest and admin surfaces read the `:root` block, the kitchen surface
reads the `.dark, [data-surface="kitchen"]` block, so one spec covers all three.

## Scope

| Component      | Implemented                                         |
| -------------- | --------------------------------------------------- |
| `button`       | M1 — `packages/ui/src/components/button.tsx`        |
| `status-badge` | M2 (guest) and M3 (kitchen), on the M1 `badge` base |
| `dish-card`    | M2 (guest menu)                                     |
| `order-card`   | M3 (kitchen display)                                |
| `cart-counter` | M2 (guest cart)                                     |

`dish-card`, `order-card`, `cart-counter` and the status variants of `status-badge` are specified here
and built later; their component tokens (`--dish-card-*`, `--order-card-*`, `--status-badge-*`,
`--cart-counter-*`) already exist in `tokens.css`, so the later work is assembly, not new design.

## Reading the tables

- Columns: `background`, `foreground`, `border`, `elevation`, `motion`. Rows are the six interactive
  states in priority order: `disabled` and `loading` win over `active`, which wins over `focus-visible`,
  which wins over `hover`.
- `--token/NN` means that token at NN percent opacity over whatever sits behind it — the
  `bg-primary/90` form in the implementation. It is the same token, not a second colour.
- `focus-visible` is the only state that draws a ring: 2 px in `--ring` with a 2 px offset filled by
  `--background`, per `docs/brand-guidelines.md` section 1. The ring is listed in the `border` column.
- `motion` is a duration token only. In M1 the sole transition is a colour transition on state change;
  nothing translates, scales or animates. Anything richer belongs to `docs/design/motion-spec.md` (M6).
- `none` means the property is not set for that state, not that it is set to zero.

## button

Sizes come from `--button-height` (default, 44 px at the guest spacing scale) and `--button-height-sm`;
padding from `--button-padding-x`; corner from `--button-radius`; weight from `--button-font-weight`.

| State         | background     | foreground                | border   | elevation | motion            |
| ------------- | -------------- | ------------------------- | -------- | --------- | ----------------- |
| default       | `--primary`    | `--primary-foreground`    | none     | none      | none              |
| hover         | `--primary/90` | `--primary-foreground`    | none     | none      | `--duration-fast` |
| active        | `--primary/90` | `--primary-foreground`    | none     | none      | `--duration-fast` |
| focus-visible | `--primary`    | `--primary-foreground`    | `--ring` | none      | `--duration-fast` |
| disabled      | `--primary/50` | `--primary-foreground/50` | none     | none      | none              |
| loading       | `--primary`    | `--primary-foreground`    | none     | none      | none              |

Secondary variants keep the same rows against their own pair: `secondary` uses
`--secondary` / `--secondary-foreground`, `outline` uses `--background` / `--foreground` with a
`--input` border and `--shadow-sm` elevation, `ghost` and `link` carry no fill and hover into
`--secondary` / `--secondary-foreground`, `destructive` uses `--destructive` / `--primary-foreground`
and rings in `--destructive`.

`loading` keeps the label text and adds a spinner icon before it, plus `aria-busy="true"` and
`disabled`; the label never changes to "Loading" and the button never collapses to a spinner, so the
control does not change width. The spinner's rotation is a motion-spec (M6) concern; until then it
uses the icon default.

## dish-card

Guest menu item. Radius `--dish-card-radius`, padding `--dish-card-padding`, internal gap
`--dish-card-gap`, image box `--dish-card-image-ratio`, resting elevation `--dish-card-shadow`.

| State         | background    | foreground           | border     | elevation     | motion            |
| ------------- | ------------- | -------------------- | ---------- | ------------- | ----------------- |
| default       | `--card`      | `--card-foreground`  | `--border` | `--shadow-sm` | none              |
| hover         | `--card`      | `--card-foreground`  | `--border` | `--shadow-md` | `--duration-fast` |
| active        | `--secondary` | `--card-foreground`  | `--border` | `--shadow-sm` | `--duration-fast` |
| focus-visible | `--card`      | `--card-foreground`  | `--ring`   | `--shadow-sm` | `--duration-fast` |
| disabled      | `--muted`     | `--muted-foreground` | `--border` | none          | none              |
| loading       | `--muted`     | none                 | `--border` | none          | none              |

`disabled` is the sold-out card: the price and description drop to `--muted-foreground`, the card keeps
its "Sold out" label, and the add control is removed rather than greyed. `loading` is the skeleton
placeholder — `--muted` blocks in the image and text boxes, no text, no shimmer in M1.
Elevation carries the hover, not a transform: a card that lifts by translating shifts the grid.

## order-card

Kitchen ticket. Radius `--order-card-radius`, padding `--order-card-padding`, border width
`--order-card-border-width`, table number at `--order-card-title-size`. Reads the kitchen block, so
`--card` is the ticket surface and `--secondary` the raised header.

| State         | background    | foreground               | border       | elevation | motion            |
| ------------- | ------------- | ------------------------ | ------------ | --------- | ----------------- |
| default       | `--card`      | `--card-foreground`      | `--timer-ok` | none      | none              |
| hover         | `--secondary` | `--secondary-foreground` | `--timer-ok` | none      | `--duration-fast` |
| active        | `--secondary` | `--secondary-foreground` | `--primary`  | none      | `--duration-fast` |
| focus-visible | `--card`      | `--card-foreground`      | `--ring`     | none      | `--duration-fast` |
| disabled      | `--muted`     | `--muted-foreground`     | `--border`   | none      | none              |
| loading       | `--muted`     | none                     | `--border`   | none      | none              |

The border colour is the ticket age, not a hover state: `--timer-ok` under 5 minutes elapsed,
`--timer-warn` from 5 minutes, `--timer-late` from 10 minutes. The thresholds are the brand's
(`docs/brand-guidelines.md` section 1, timer table). Colour is never the only carrier: the ticket also
shows the elapsed time in `--font-mono` and its status badge label, and the newest ticket takes the
`--primary` edge. Kitchen body text is `--kitchen-body-size` or larger.

## status-badge

Height `--status-badge-height`, padding `--status-badge-padding-x`, corner `--status-badge-radius`,
type `--status-badge-font-size` at `--status-badge-font-weight`. The badge is not interactive by
default; the `hover` and `active` rows apply only where it is rendered as a link or button.

| State         | background          | foreground            | border   | elevation | motion            |
| ------------- | ------------------- | --------------------- | -------- | --------- | ----------------- |
| default       | `--status-<status>` | see the pairing table | none     | none      | none              |
| hover         | `--status-<status>` | see the pairing table | none     | none      | `--duration-fast` |
| active        | `--status-<status>` | see the pairing table | none     | none      | `--duration-fast` |
| focus-visible | `--status-<status>` | see the pairing table | `--ring` | none      | `--duration-fast` |
| disabled      | `--muted`           | `--muted-foreground`  | none     | none      | none              |
| loading       | `--muted`           | none                  | none     | none      | none              |

`<status>` is one of `placed`, `paid`, `cooking`, `ready`, `served`, `cancelled`. The foreground is
chosen per status by measured contrast against the fill, not by taste:

| Status               | Guest and admin foreground | Measured          | Kitchen foreground     | Measured |
| -------------------- | -------------------------- | ----------------- | ---------------------- | -------- |
| `--status-placed`    | `--primary-foreground`     | 5.22:1            | `--primary-foreground` | 8.63:1   |
| `--status-paid`      | `--primary-foreground`     | 5.09:1            | `--primary-foreground` | 9.24:1   |
| `--status-cooking`   | `--foreground`             | 4.80:1            | `--primary-foreground` | 10.29:1  |
| `--status-ready`     | `--primary-foreground`     | 4.28:1 (see note) | `--primary-foreground` | 10.17:1  |
| `--status-served`    | `--primary-foreground`     | 5.47:1            | `--primary-foreground` | 8.57:1   |
| `--status-cancelled` | `--primary-foreground`     | 6.43:1            | `--primary-foreground` | 7.76:1   |

On the kitchen surface `--primary-foreground` resolves to the night background, so every kitchen badge
is dark text on a light status fill.

Every badge carries its status label as text and, on the kitchen surface, an icon; colour alone never
carries the state. The label is sentence case and one word ("Cooking", "Ready", "Sold out").

## cart-counter

The count bubble on the guest cart control. Size `--cart-counter-size`, corner `--cart-counter-radius`,
type `--cart-counter-font-size`, fill `--cart-counter-bg`, label `--cart-counter-fg` — the bubble is
not focusable itself, so its interactive rows follow the control it sits on.

| State         | background          | foreground           | border   | elevation | motion |
| ------------- | ------------------- | -------------------- | -------- | --------- | ------ |
| default       | `--cart-counter-bg` | `--cart-counter-fg`  | none     | none      | none   |
| hover         | `--cart-counter-bg` | `--cart-counter-fg`  | none     | none      | none   |
| active        | `--cart-counter-bg` | `--cart-counter-fg`  | none     | none      | none   |
| focus-visible | `--cart-counter-bg` | `--cart-counter-fg`  | `--ring` | none      | none   |
| disabled      | `--muted`           | `--muted-foreground` | none     | none      | none   |
| loading       | `--muted`           | none                 | none     | none      | none   |

At zero items the bubble is not rendered at all rather than shown as a zero. The count sets
`font-variant-numeric: tabular-nums` so it does not jitter between one and two digits, and the parent
control carries the accessible name ("Basket, 3 items"), not the bubble.

## Contrast notes

The pairs the token contract test gates are in `packages/ui/src/tokens.test.ts`; it fails the build if
any of them drops below its bar (4.5:1 for text pairs, 3:1 for status and timer colours against their
surface). Three notes that the test does not cover:

1. `--status-ready` on the guest and admin surfaces reaches 4.28:1 with `--primary-foreground` and
   4.02:1 with `--foreground`, so a filled Ready badge is below AA for its label on light surfaces. It
   clears the 3:1 non-text bar, so the badge fill and the timer-ok border are fine as they are; until
   the brand value is darkened, a Ready badge that must carry small text on a light surface uses the
   outline treatment instead — background `--card`, foreground `--foreground`, border `--status-ready`.
2. Disabled controls fade the whole control (50 percent opacity), which lowers the label-to-fill ratio.
   WCAG 1.4.3 exempts inactive controls, and the disabled state is never the only signal. Where a
   disabled control must stay legible — anything on the kitchen surface — use `--muted` with
   `--muted-foreground` instead of fading.
3. `--muted-foreground` must not sit on `--muted` (4.48:1, just under AA). Text inside inputs, striped
   rows and inset panels uses `--foreground`. This is the brand's rule 2, and it is why the M1 input
   keeps a transparent fill over `--background` rather than a sunken one.

## Motion

`docs/design/motion-spec.md` is an M6 deliverable and no motion ships in M1. The only movement any M1
component makes is a colour transition at `--duration-fast` on hover, active and focus-visible. No
transforms, no entrance animations, no shimmer, no spring easing. Under `prefers-reduced-motion` even
that colour transition is dropped; the rule that does it belongs to the app shell's global stylesheet,
which is where every surface imports `theme.css`.
