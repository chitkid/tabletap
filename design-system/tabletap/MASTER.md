# Design System Master File

> Source of truth for identity: docs/brand-guidelines.md; token values: assets/design-tokens.json.

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

> **Reconciliation note:** `ui-ux-pro-max --design-system` generated this file from the query keywords alone and had no knowledge of Little Furnace. Its raw output picked an "App Store Style Landing" / SaaS-fintech pattern with an unrelated red/gold palette and Playfair Display SC + Karla — all wrong for this brand. The tables and CSS below have been corrected to `docs/brand-guidelines.md` (colors, fonts, component specs, style and page pattern); the generated structure, dials and motion snippet are kept as produced.

---

**Project:** TableTap
**Generated:** 2026-09-03 01:52:38
**Category:** Restaurant/Food Service
**Design Dials:** Variance 6/10 (Balanced / Modern) | Motion 5/10 (Standard) | Density 4/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#C23E18` | `--color-primary` |
| On Primary | `#FFFDF9` | `--color-on-primary` |
| Secondary | `#6B7A3C` | `--color-secondary` |
| Accent/CTA | `#9E3112` | `--color-accent` |
| Background | `#F6F1E8` | `--color-background` |
| Foreground | `#1C1917` | `--color-foreground` |
| Muted | `#EDE6DA` | `--color-muted` |
| Border | `#E0D8CB` | `--color-border` |
| Destructive | `#B3261E` | `--color-destructive` |
| Ring | `#C23E18` | `--color-ring` |

**Color Notes (reconciled to `docs/brand-guidelines.md`):** This is the guest surface palette — Ember (`#C23E18`) is the single accent hue used for both Primary and Accent/CTA; `--color-accent` is set to Ember Dark (`#9E3112`), the hover/pressed variant of the same hue, never a second hue. Background is Oat, Foreground is Ink text, Muted is the Sunken input-well fill, Border is the guest divider color, and Destructive reuses the Cancelled status hue. Olive body text on oat must use Olive Dark `#4F5B2C` (6.51:1), not Olive `#6B7A3C` (4.17:1, below AA for text). Full palette including kitchen-surface and status colors is in brand-guidelines.md §1; raw token scales are in `assets/design-tokens.json` (use shades 300-600 only — 700+ collapse to near-black for `ink`/`olive`, a known generator limitation).

### Typography

**Reconciled to `docs/brand-guidelines.md` §2.** The generator's own typography search for this query returned Playfair Display SC + Karla — the display-serif restaurant cliché the brand spec explicitly rules out (see brand-guidelines.md §2 for why: it also rejected the rounded/playful runners-up and explains the Bricolage Grotesque choice in detail). Replaced below.

- **Heading/Display Font:** Bricolage Grotesque (700 for Display/H1, 600 for H2/H3)
- **Body Font:** IBM Plex Sans (400 body, 500-700 for UI weight, real tabular numerals)
- **Mono Font:** IBM Plex Mono (kitchen timers only, from the same superfamily as IBM Plex Sans)
- **Mood:** neighbourhood wood-fired warmth, printed-signage character — not cute, not corporate
- **Google Fonts:** [Bricolage Grotesque + IBM Plex Sans + IBM Plex Mono](https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap)

**Font Loading:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

```css
--font-display: 'Bricolage Grotesque', 'Trebuchet MS', system-ui, sans-serif;
--font-body: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace;
```

Every price, quantity, table number, elapsed time and money column sets `font-variant-numeric: tabular-nums`. `display=swap` is deliberate — the fallback stack renders immediately and the kitchen display in particular must be readable on a cold start over a slow venue network.

### Spacing Variables

*Density: 4/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

Colors below are reconciled to `docs/brand-guidelines.md` §1 (guest surface).

```css
/* Primary Button */
.btn-primary {
  background: #C23E18; /* Ember */
  color: #FFFDF9; /* Surface — text on ember fills */
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  background: #9E3112; /* Ember Dark — hover/pressed on guest surface */
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #9E3112; /* Ember Dark — preferred for ember text under 16px */
  border: 2px solid #C23E18; /* Ember */
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFDF9; /* Surface */
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E0D8CB; /* Border */
  border-radius: 8px;
  font-size: 16px;
  color: #1C1917; /* Text — never Muted Text inside an input well, see brand rule */
  background: #EDE6DA; /* Sunken */
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #C23E18; /* Ember */
  outline: none;
  box-shadow: 0 0 0 2px #FFFDF9, 0 0 0 4px #C23E18; /* 2px ring, 2px offset, per brand */
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: #FFFDF9; /* Surface */
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Reconciled to `docs/brand-guidelines.md`.** The raw search matched "SaaS Mobile (High-Tech Boutique)" — an electric-blue fintech/gradient/glassmorphism style with no relation to a wood-fired neighbourhood restaurant. Corrected below.

**Style:** Warm Neighbourhood Counter-Service (Little Furnace)

**Keywords:** wood-fired, warm, honest, printed-signage grotesque, single-accent (ember), counter-side directness, oat and charcoal, tabular data

**Best For:** QR table ordering on a guest's own phone — a fast-casual, sit-down-and-order flow for a restaurant that describes itself, not a downloadable consumer app

**Key Effects:** Standard 150-300ms transitions on state changes (no spring/haptic/glassmorphism vocabulary — those belong to the native-mobile SaaS style, not a mobile web guest surface); ember focus ring (2px, 2px offset); tabular-nums on prices and quantities so digits don't jitter; no gradients — ember is a flat single accent per brand rule ("exactly one accent hue")

### Page Pattern

**Pattern Name:** QR Table Ordering Flow

- **Conversion Strategy:** Guest scans the table's QR code, lands directly on that table's menu — no app download, no account creation. Menu items are honest and un-marketed ("delicious"/"amazing" are forbidden per brand voice); price and time are the trust signals.
- **CTA Placement:** One primary CTA per screen — "Add" on a menu item, "Place order" on the cart, both in Ember. No sticky download bar, no App/Play Store badges.
- **Section Order:** 1. Table header (wordmark + table number, "Table 7, welcome back"), 2. Menu browse (categories in Olive chips), 3. Item detail / add to cart, 4. Cart review, 5. Order confirmation with a real timer ("About 12 min"), 6. Status tracking (Placed → Paid → Cooking → Ready → Served)

---

## Motion

**Stagger List** (Standard) — Trigger: load or scroll | Duration: 300-450ms | Easing: `back.out(1.4)`

```js
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```

**Framework notes:** grid: 'auto' lets GSAP infer rows/columns from a CSS grid layout for a natural wave stagger

- ✅ Combine with from: 'center' for a bento-grid layout to draw the eye inward first
- ❌ Don't use back.out on dense data tables; the overshoot reads as sloppy on informational UI
- ⚡ Group DOM writes; avoid interleaving layout reads (getBoundingClientRect) between staggered tweens

---

## Anti-Patterns (Do NOT Use)

- ❌ Low-quality imagery
- ❌ Outdated hours

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
