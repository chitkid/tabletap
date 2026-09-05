# Design System Master File

> Reconciled against packages/ui/tokens.css on 2026-09-03.

> Source of truth for identity: docs/brand-guidelines.md; token values: assets/design-tokens.json,
> generated into packages/ui/tokens.css and aliased for Tailwind in packages/ui/theme.css.
> Where this file and the generated stylesheet disagree, the stylesheet is right.

> **LOGIC:** When building a specific page, first check `design-system/tabletap/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

> **Reconciliation note:** `ui-ux-pro-max --design-system` generated this file from the query keywords alone and had no knowledge of Little Furnace. Its raw output picked an "App Store Style Landing" / SaaS-fintech pattern with an unrelated red/gold palette and Playfair Display SC + Karla — all wrong for this brand. The tables and CSS below have been corrected to `docs/brand-guidelines.md` (colors, fonts, component specs, style and page pattern); the generated structure and dials are kept as produced. The spacing tables, the shadow depths and the motion snippet have since been reconciled against `packages/ui/tokens.css` as well, because they named tokens this project does not have.

---

**Project:** TableTap
**Generated:** 2026-09-03 01:52:38
**Category:** Restaurant/Food Service
**Design Dials:** Variance 6/10 (Balanced / Modern) | Motion 5/10 (Standard) | Density 4/10 (Standard)

---

## Global Rules

### Color Palette

Every row below is the value `packages/ui/tokens.css` emits for the `:root` (guest and admin) block,
under the Tailwind alias `packages/ui/theme.css` gives it.

| Role                 | Hex       | CSS Variable                   |
| -------------------- | --------- | ------------------------------ |
| Primary              | `#C23E18` | `--color-primary`              |
| Primary foreground   | `#FFFDF9` | `--color-primary-foreground`   |
| Secondary            | `#EDE6DA` | `--color-secondary`            |
| Secondary foreground | `#1C1917` | `--color-secondary-foreground` |
| Accent               | `#6B7A3C` | `--color-accent`               |
| Accent foreground    | `#FFFDF9` | `--color-accent-foreground`    |
| Background           | `#F6F1E8` | `--color-background`           |
| Foreground           | `#1C1917` | `--color-foreground`           |
| Card                 | `#FFFDF9` | `--color-card`                 |
| Muted                | `#EDE6DA` | `--color-muted`                |
| Muted foreground     | `#6F675F` | `--color-muted-foreground`     |
| Border               | `#918269` | `--color-border`               |
| Input                | `#918269` | `--color-input`                |
| Destructive          | `#B3261E` | `--color-destructive`          |
| Ring                 | `#C23E18` | `--color-ring`                 |

**Color Notes (reconciled to `packages/ui/tokens.css`).** This is the guest and admin `:root` block; the kitchen surface reads the `.dark, [data-surface="kitchen"]` block instead, listed in `design-system/tabletap/pages/kitchen.md`.

Three names do not mean what the generator's template assumed, and getting them wrong is the easiest way to build a screen that does not match the code:

- **There is no `--color-on-primary`.** The token is `--color-primary-foreground`, following shadcn's naming, and it resolves to the oat Surface `#FFFDF9` — the same white-ish that text on an ember fill uses.
- **`--secondary` is not the olive.** It is the oat Sunken fill `#EDE6DA`, the quiet neutral a secondary button or a striped row sits on, with `--secondary-foreground` as Ink `#1C1917`. Its hover is `--secondary/80`.
- **`--accent` is the olive `#6B7A3C`**, the brand's Secondary hue. The brand document's "Accent Color" (`#1C1917`) is not this token: that entry names Ink, the text and kitchen-ground colour, and it is called an accent only because the token pipeline's role map needs a third slot to generate the `ink` scale from. Ink reaches components as `--foreground`, `--card-foreground` and `--secondary-foreground`, never as `--accent`.

Ember stays the single call-to-action hue: `--primary` for the fill, `--ring` for the focus ring, and Ember Dark `#9E3112` as its hover, which components express as `--primary/90` rather than as a separate token. Olive body text on oat must use Olive Dark `#4F5B2C` (6.51:1), not Olive `#6B7A3C` (4.17:1, below AA for text). Border and Input are the same value and clear the WCAG 1.4.11 3:1 non-text bar on both the background and the card (3.33:1 and 3.69:1); see `docs/brand-guidelines.md` §1. Raw token scales are in `assets/design-tokens.json` (use shades 100-600 only — 700+ collapse to near-black for `ink`/`olive`, a known generator limitation).

### Typography

**Reconciled to `docs/brand-guidelines.md` §2.** The generator's own typography search for this query returned Playfair Display SC + Karla — the display-serif restaurant cliché the brand spec explicitly rules out (see brand-guidelines.md §2 for why: it also rejected the rounded/playful runners-up and explains the Bricolage Grotesque choice in detail). Replaced below.

- **Heading/Display Font:** Bricolage Grotesque (700 for Display/H1, 600 for H2/H3)
- **Body Font:** IBM Plex Sans (400 body, 500-700 for UI weight, real tabular numerals)
- **Mono Font:** IBM Plex Mono (kitchen timers only, from the same superfamily as IBM Plex Sans)
- **Mood:** neighbourhood wood-fired warmth, printed-signage character — not cute, not corporate
- **Google Fonts:** [Bricolage Grotesque + IBM Plex Sans + IBM Plex Mono](https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap)

**Font Loading:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

```css
--font-display: 'Bricolage Grotesque', 'Trebuchet MS', system-ui, sans-serif;
--font-body: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace;
```

Every price, quantity, table number, elapsed time and money column sets `font-variant-numeric: tabular-nums`. `display=swap` is deliberate — the fallback stack renders immediately and the kitchen display in particular must be readable on a cold start over a slow venue network.

### Spacing

_Density: 4/10 — Standard_

**The generator's `--space-xs … --space-3xl` scale does not exist in this project and has been replaced here rather than translated.** Spacing comes from two mechanisms, and a screen built against the invented names would compile to nothing.

**1. The primitive scale in `packages/ui/tokens.css`.** Component tokens reference it; `--button-padding-x` is `--primitive-space-4`, `--order-card-padding` likewise.

| Token                  | Value     |
| ---------------------- | --------- |
| `--primitive-space-1`  | `0.25rem` |
| `--primitive-space-2`  | `0.5rem`  |
| `--primitive-space-3`  | `0.75rem` |
| `--primitive-space-4`  | `1rem`    |
| `--primitive-space-6`  | `1.5rem`  |
| `--primitive-space-8`  | `2rem`    |
| `--primitive-space-12` | `3rem`    |

**2. Tailwind's spacing utilities** (`p-4`, `gap-6`, `px-3`), which multiply the step number by `--spacing`. Every surface takes Tailwind's default: **no surface overrides `--spacing`, and none should.** An earlier admin build set `--spacing: 0.2rem` under `[data-surface="admin"]` as a density dial, and M5 removed it — the multiplier also scales the size utilities, so an `h-11` button came out around 35px, under the 44px target, on the surface with the densest controls. Density on the admin surface comes from the grid and the type scale instead. The `[data-surface='admin']` block in `packages/ui/theme.css` is deliberately left empty with a comment saying so, and `packages/ui/tokens.test.ts` anchors on the selector. See `design-system/tabletap/pages/admin.md`.

### Radii

| Token                     | Value      | Usage                                            |
| ------------------------- | ---------- | ------------------------------------------------ |
| `--radius-sm`             | `0.375rem` | Small controls                                   |
| `--radius`                | `0.625rem` | Buttons, inputs, the Tailwind `rounded-md` alias |
| `--radius-lg`             | `1rem`     | Cards, sheets                                    |
| `--primitive-radius-full` | `9999px`   | Badges, the cart counter                         |

### Shadow Depths

Two only. There is no `--shadow-lg` and no `--shadow-xl`; anything that reached for one uses `--shadow-md`.

| Level         | Value                               | Usage                             |
| ------------- | ----------------------------------- | --------------------------------- |
| `--shadow-sm` | `0 1px 2px rgba(28, 25, 23, 0.08)`  | Cards, inputs, the outline button |
| `--shadow-md` | `0 6px 20px rgba(28, 25, 23, 0.12)` | Hovered card, sheet, dialog       |

### Durations

| Token             | Value   | Usage                                                 |
| ----------------- | ------- | ----------------------------------------------------- |
| `--duration-fast` | `120ms` | Colour transitions on hover, active and focus-visible |
| `--duration-base` | `180ms` | Anything larger, once M6 defines it                   |

---

## Component Specs

### Buttons

The shipped control is `packages/ui/src/components/button.tsx`; its state table is `docs/design/components.md`. The equivalent CSS is below, in tokens rather than in hexes and in the values the code actually carries: height `2.75rem` (`h-11`, `h-9` for the small size), horizontal padding `--primitive-space-4`, corner `--radius`, weight 600.

```css
/* Primary button — the shipped `default` variant */
.btn-primary {
  height: 2.75rem;
  background: var(--primary);
  color: var(--primary-foreground);
  padding-inline: var(--primitive-space-4);
  border-radius: var(--radius);
  font-weight: 600;
  transition: background-color var(--duration-fast) ease;
  cursor: pointer;
}

.btn-primary:hover {
  /* The implementation writes this as bg-primary/90, not as a second token. */
  background: color-mix(in srgb, var(--primary) 90%, transparent);
}

/* Secondary button — the shipped `secondary` variant: a neutral fill, not an ember outline */
.btn-secondary {
  height: 2.75rem;
  background: var(--secondary);
  color: var(--secondary-foreground);
  padding-inline: var(--primitive-space-4);
  border-radius: var(--radius);
  font-weight: 600;
  transition: background-color var(--duration-fast) ease;
  cursor: pointer;
}

.btn-secondary:hover {
  background: color-mix(in srgb, var(--secondary) 80%, transparent);
}
```

The `outline` variant is the bordered one: `--background` fill, `--foreground` text, a `1px` `--input` border and `--shadow-sm`. `link` changes no colour on hover — it underlines and nothing else.

### Cards (guest surface; see `design-system/tabletap/pages/kitchen.md` and `design-system/tabletap/pages/admin.md` for overrides)

```css
.card {
  background: var(--card);
  color: var(--card-foreground);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--primitive-space-6);
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--duration-fast) ease;
}

.card:hover {
  box-shadow: var(--shadow-md);
}
```

A card that is a link or a button also takes `cursor: pointer`; a card that is only a container does not. **Elevation carries the hover, never a transform.** The generator's `translateY(-2px)` lift is gone: a card that translates shifts the grid around it, which the Anti-Patterns list below forbids in the same breath. `--shadow-lg` does not exist either.

### Inputs (guest surface; see `design-system/tabletap/pages/kitchen.md` and `design-system/tabletap/pages/admin.md` for overrides)

```css
.input {
  height: 2.75rem;
  padding-inline: var(--primitive-space-3);
  border: 1px solid var(--input);
  border-radius: var(--radius);
  color: var(--foreground);
  /* Transparent, not the Sunken fill: muted text on Sunken measures 4.48:1, and a
     transparent well keeps input text on --background or --card instead. See
     docs/design/components.md, contrast note 3. */
  background: transparent;
  box-shadow: var(--shadow-sm);
  transition: box-shadow var(--duration-fast) ease;
}

.input:focus-visible {
  outline: none;
  /* 2px ring in --ring with a 2px offset filled by --background, per brand §1. */
  box-shadow:
    0 0 0 2px var(--background),
    0 0 0 4px var(--ring);
}
```

### Modals (guest surface; see `design-system/tabletap/pages/kitchen.md` and `design-system/tabletap/pages/admin.md` for overrides)

No dialog ships in M1; the shadcn `Dialog` arrives with the guest item detail and cart review in M2 (`docs/design/ux-notes.md`). The specification below is what it should compile to. `--shadow-xl` does not exist — the deepest shadow in this system is `--shadow-md` — and the overlay is the one value here with no token behind it yet.

```css
.modal-overlay {
  background: rgb(0 0 0 / 50%); /* No token yet: an overlay scrim is added with the M2 Dialog. */
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--popover);
  color: var(--popover-foreground);
  border-radius: var(--radius-lg);
  padding: var(--primitive-space-8);
  box-shadow: var(--shadow-md);
  max-width: 31.25rem;
  width: 90%;
}
```

---

## Style Guidelines

**Reconciled to `docs/brand-guidelines.md`.** The raw search matched "SaaS Mobile (High-Tech Boutique)" — an electric-blue fintech/gradient/glassmorphism style with no relation to a wood-fired neighbourhood restaurant. Corrected below.

**Style:** Warm Neighbourhood Counter-Service (Little Furnace)

**Keywords:** wood-fired, warm, honest, printed-signage grotesque, single-accent (ember), counter-side directness, oat and charcoal, tabular data

**Best For:** QR table ordering on a guest's own phone — a fast-casual, sit-down-and-order flow for a restaurant that describes itself, not a downloadable consumer app

**Key Effects:** Colour-only transitions on state change at `--duration-fast` (120ms); the generator's 150-300ms band is not what ships (no spring/haptic/glassmorphism vocabulary — those belong to the native-mobile SaaS style, not a mobile web guest surface); ember focus ring (2px, 2px offset); tabular-nums on prices and quantities so digits don't jitter; no gradients — ember is a flat single accent per brand rule ("exactly one accent hue")

### Page Pattern

**Pattern Name:** QR Table Ordering Flow

- **Conversion Strategy:** Guest scans the table's QR code, lands directly on that table's menu — no app download, no account creation. Menu items are honest and un-marketed ("delicious"/"amazing" are forbidden per brand voice); price and time are the trust signals.
- **CTA Placement:** One primary CTA per screen — "Add" on a menu item, "Place order" on the cart, both in Ember. No sticky download bar, no App/Play Store badges.
- **Section Order:** 1. Table header (wordmark + table number, "Table 7, welcome back"), 2. Menu browse (categories in Olive chips), 3. Item detail / add to cart, 4. Cart review, 5. Order confirmation with a real timer ("About 12 min"), 6. Status tracking (Placed → Paid → Cooking → Ready → Served)

---

## Motion

**No motion ships in M1.** The generator's Motion dial of 5/10 produced a GSAP stagger-list snippet; GSAP is not a dependency of this project, and the snippet has been removed rather than kept as an aspiration. `docs/design/motion-spec.md` is an M6 deliverable and does not exist yet.

The only movement any M1 component makes is a colour transition at `--duration-fast` (120ms) on hover, active and focus-visible. Nothing translates, scales, staggers or animates in. `--duration-base` (180ms) is defined for the larger transitions M6 will specify and is unused today. Under `prefers-reduced-motion` even the colour transition is dropped.

Entrance choreography, list staggers and the kitchen board's new-ticket cue are M6 decisions. Until then, treat any motion in a mock-up as unbuilt.

---

## Anti-Patterns (Do NOT Use)

- Avoid: low-quality imagery
- Avoid: outdated hours

### Additional Forbidden Patterns

- Avoid: **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- Avoid: **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- Avoid: **Layout-shifting hovers** — Avoid scale transforms that shift layout
- Avoid: **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- Avoid: **Instant state changes** — colour changes transition at `--duration-fast` (120ms). Nothing else transitions in M1
- Avoid: **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states transition colour at `--duration-fast` (120ms), and nothing else moves
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
