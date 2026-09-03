# Component state specs

> Source of truth for identity: `docs/brand-guidelines.md`. Token values: `assets/design-tokens.json`,
> generated into `packages/ui/tokens.css` and aliased for Tailwind in `packages/ui/theme.css`.
> Motion choreography: `docs/design/motion-spec.md` — M6; no motion ships in M1.

Every cell in the state tables below is a token name, never a colour or a measurement. The same token
name resolves to a different value per surface: the guest and admin surfaces read the `:root` block,
the kitchen surface reads the `.dark, [data-surface="kitchen"]` block, so one spec covers all three.
The prose around a shipped component names the Tailwind utility that component actually carries,
because that is what the code says.

## Scope

| Component      | Implemented                                        |
| -------------- | -------------------------------------------------- |
| `button`       | M1 — `packages/ui/src/components/button.tsx`       |
| `status-badge` | M2 — `packages/ui/src/components/status-badge.tsx` |
| `dish-card`    | M2 — `apps/web/components/menu/dish-card.tsx`      |
| `order-card`   | M3 (kitchen display)                               |
| `cart-counter` | M2 (guest cart)                                    |

`order-card` and `cart-counter` are specified here and built later; their component tokens
(`--dish-card-*`, `--order-card-*`, `--status-badge-*`, `--cart-counter-*`) already exist in
`tokens.css`, so the later work is assembly, not new design. In M2 the guest surface has no cart
counter bubble: the sticky basket bar carries the count as text ("2 items · $26.00"), which is the
same information in a place a thumb can reach.

No component consumes a `--<component>-*` token yet. The two that ship in M1, `button` and `badge`,
take their shape from Tailwind utilities written into the variant definition. The component layer of
the token source is therefore a specification the components have still to be wired to; that wiring
is in `docs/backlog.md`, not in this milestone.

## Reading the tables

- Columns: `background`, `foreground`, `border`, `elevation`, `motion`. Rows are the interactive
  states in priority order: `disabled` and `loading` win over `active`, which wins over `focus-visible`,
  which wins over `hover`. Only the components with a skeleton or placeholder state carry a `loading`
  row — `dish-card`, `order-card` and `cart-counter`, all of them M2 or M3. Neither M1 component has
  one; see the note under `button`.
- `--token/NN` means that token at NN percent opacity over whatever sits behind it — the
  `bg-primary/90` form in the implementation. It is the same token, not a second colour.
- `focus-visible` is the only state that draws a ring: 2 px in `--ring` with a 2 px offset filled by
  `--background`, per `docs/brand-guidelines.md` section 1. The ring is listed in the `border` column.
- `motion` is a duration token only. In M1 the sole transition is a colour transition on state change;
  nothing translates, scales or animates. Anything richer belongs to `docs/design/motion-spec.md` (M6).
- `none` means the property is not set for that state, not that it is set to zero.

## button

`packages/ui/src/components/button.tsx`. Its shape comes from Tailwind utilities written into the
variant definition, not from the `--button-*` tokens: `h-11` at the default size and `h-9` at `sm`,
`px-4`, `rounded-md`, `font-semibold`. `--button-height`, `--button-height-sm`, `--button-padding-x`,
`--button-radius` and `--button-font-weight` exist in the token source and in `tokens.css`, and
nothing reads them yet.

| State         | background     | foreground                | border   | elevation | motion            |
| ------------- | -------------- | ------------------------- | -------- | --------- | ----------------- |
| default       | `--primary`    | `--primary-foreground`    | none     | none      | none              |
| hover         | `--primary/90` | `--primary-foreground`    | none     | none      | `--duration-fast` |
| active        | `--primary/90` | `--primary-foreground`    | none     | none      | `--duration-fast` |
| focus-visible | `--primary`    | `--primary-foreground`    | `--ring` | none      | `--duration-fast` |
| disabled      | `--primary/50` | `--primary-foreground/50` | none     | none      | none              |

The variants keep the same rows against their own pair: `secondary` uses
`--secondary` / `--secondary-foreground` and hovers to `--secondary/80`; `outline` uses
`--background` / `--foreground` with an `--input` border and `--shadow-sm` elevation; `ghost` carries
no fill and hovers into `--secondary` / `--secondary-foreground`; `destructive` uses
`--destructive` / `--primary-foreground` and rings in `--destructive`. `link` is the exception: it
carries no fill and changes no colour on hover. Its only hover treatment is an underline.

There is no `:active` rule. Where a pointer supports hover, a press looks like the hover row because
the pointer is still over the control; on touch the button goes from default straight to the result.
`disabled` is one `opacity-50` over the whole control rather than two separate token opacities, which
is the same result and the reason contrast note 2 below applies to it.

There is no `loading` prop, no spinner and no busy variant. The only loading treatment in M1 is on the
sign-in form (spec section 10): the label swaps `Sign in` to `Signing in…` while the button carries
`disabled` and `aria-busy="true"`. A spinner icon and a width-stable busy state are a motion-spec (M6)
concern; nothing of either ships now.

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

The base that ships in M1 is `packages/ui/src/components/badge.tsx`. Like the button it takes its
shape from Tailwind utilities rather than from its component tokens: `h-7`, `px-3`, `rounded-full`,
`text-sm`, `font-semibold`, and a transparent border so an outline variant does not change the box.
`--status-badge-height`, `--status-badge-padding-x`, `--status-badge-radius`,
`--status-badge-font-size` and `--status-badge-font-weight` exist in the token source and in
`tokens.css`, and nothing reads them yet.

The base ships six variants — `default`, `secondary`, `destructive`, `outline`, `ghost`, `link` —
and none of them is a status. The status variants below ship in M2 as their own component,
`packages/ui/src/components/status-badge.tsx`: it repeats the base's shape utilities rather than
extending the variant list, because a status is not one of six looks a caller chooses between but a
value of the order, so it takes an `OrderStatus` and nothing else. The badge is not interactive by
default; the `hover` and `active` rows apply only where it is rendered as a link or button, which in
the base is the `[a&]:hover:` treatment.

| State         | background          | foreground            | border   | elevation | motion            |
| ------------- | ------------------- | --------------------- | -------- | --------- | ----------------- |
| default       | `--status-<status>` | see the pairing table | none     | none      | none              |
| hover         | `--status-<status>` | see the pairing table | none     | none      | `--duration-fast` |
| active        | `--status-<status>` | see the pairing table | none     | none      | `--duration-fast` |
| focus-visible | `--status-<status>` | see the pairing table | `--ring` | none      | `--duration-fast` |
| disabled      | `--muted`           | `--muted-foreground`  | none     | none      | none              |

`<status>` is one of `placed`, `paid`, `cooking`, `ready`, `served`, `cancelled`. The foreground is
chosen per status by measured contrast against the fill, not by taste:

| Status               | Guest and admin foreground | Measured | Kitchen foreground     | Measured |
| -------------------- | -------------------------- | -------- | ---------------------- | -------- |
| `--status-placed`    | `--primary-foreground`     | 5.22:1   | `--primary-foreground` | 8.63:1   |
| `--status-paid`      | `--primary-foreground`     | 5.09:1   | `--primary-foreground` | 9.24:1   |
| `--status-cooking`   | `--foreground`             | 4.80:1   | `--primary-foreground` | 10.29:1  |
| `--status-ready`     | `--primary-foreground`     | 4.56:1   | `--primary-foreground` | 10.17:1  |
| `--status-served`    | `--primary-foreground`     | 5.47:1   | `--primary-foreground` | 8.57:1   |
| `--status-cancelled` | `--primary-foreground`     | 6.43:1   | `--primary-foreground` | 7.76:1   |

Every status is filled on every surface — there is no outline treatment and no per-status exception.
`--primary-foreground` carries the label on five of the six; `--status-cooking` is the one that takes
`--foreground`, because its amber is too light for the pale label. `packages/ui/src/tokens.test.ts`
gates both of those pairs at 4.5:1, so a status colour cannot drift back under AA unnoticed.

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
surface, and 4.5:1 for the two badge labels on their own fill). Two notes that the test does not cover:

1. Disabled controls fade the whole control (50 percent opacity), which lowers the label-to-fill ratio.
   WCAG 1.4.3 exempts inactive controls, and the disabled state is never the only signal. Where a
   disabled control must stay legible — anything on the kitchen surface — use `--muted` with
   `--muted-foreground` instead of fading.
2. `--muted-foreground` must not sit on `--muted` (4.48:1, just under AA). Text inside inputs, striped
   rows and inset panels uses `--foreground`. This is the brand's rule 2, and it is why the M1 input
   keeps a transparent fill over `--background` rather than a sunken one.

## Motion

`docs/design/motion-spec.md` is an M6 deliverable and no motion ships in M1. The only movement any M1
component makes is a colour transition at `--duration-fast` on hover, active and focus-visible. No
transforms, no entrance animations, no shimmer, no spring easing. Under `prefers-reduced-motion` even
that colour transition is dropped; the rule that does it belongs to the app shell's global stylesheet,
which is where every surface imports `theme.css`.
