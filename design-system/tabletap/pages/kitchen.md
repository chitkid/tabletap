# Kitchen Page Overrides

> **PROJECT:** TableTap
> **Reconciled against packages/ui/tokens.css on 2026-09-03**
> **Generated:** 2026-09-03 01:53:50
> **Page Type:** Kitchen Display (dark, real-time)
> **Reconciled with:** `docs/brand-guidelines.md` (kitchen surface, semantic status colors, kitchen type scale)

> **Override warning:** Rules in this file **override** the Master file (`design-system/tabletap/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

> **Reconciliation note:** The raw generator classified this query as "General" and returned a marketing landing-page pattern (Hero / Value prop / Features / CTA / Footer) with a light-surface color strategy — none of it describes an order-ticket board. Rewritten below to match `docs/brand-guidelines.md`; the generated dials (Variance 4/10, Motion 3/10, Density 6/10) are kept.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** none — full-bleed ticket board, not a centered marketing layout
- **Layout:** Columns by order status (Placed, Paid, Cooking, Ready); new tickets enter at the top of their column. A cook reads this from roughly a metre away, often at an angle, sometimes through steam — layout must stay legible at that distance.
- **Sections:** 1. Status column headers, 2. Ticket cards (table number, item lines, elapsed timer, status chip), 3. Timer band with 5/10 minute thresholds per ticket

### Spacing Overrides

- **No spacing override.** Density 6/10 falls in the same "Standard" tier as the guest surface's density 4/10 (both resolve to the generator's 4-7 bucket), and the kitchen surface takes Tailwind's default `--spacing` unchanged. The generator's `--space-xs … --space-3xl` names do not exist in this project; see `design-system/tabletap/MASTER.md` § Spacing for the two real mechanisms (the `--primitive-space-*` scale and the per-surface `--spacing` multiplier). The only thing `[data-surface="kitchen"]` sets in `packages/ui/theme.css` is `font-size: var(--kitchen-body-size)` and `color-scheme: dark`.
- Ticket card internal padding: `--primitive-space-4` (`1rem`, the `--order-card-padding` token). Gutter between ticket cards and between columns: `--primitive-space-6` (`1.5rem`, Tailwind `gap-6`).

### Typography Overrides

Per `docs/brand-guidelines.md` §2 kitchen type scale — nothing on this surface is smaller than 16px, and body text is 20px or larger:

| Element | Size | Font | Weight | Line Height |
|---------|------|------|--------|-------------|
| Ticket table number | 32px | Bricolage Grotesque (display) | 700 | 1.1 |
| Ticket item line | 22px | IBM Plex Sans (body) | 500 | 1.35 |
| Kitchen body | 20px (minimum on this surface) | IBM Plex Sans (body) | 400 | 1.4 |
| Modifier / note | 18px | IBM Plex Sans (body) | 400 | 1.4 |
| Timer | 28px | IBM Plex Mono | 500 | 1.1 |
| Column header | 16px | IBM Plex Sans (body) | 600 | 1.2 |

Timer digits and table numbers set `font-variant-numeric: tabular-nums` so elapsed time does not jitter as it ticks.

The sizes above are the target scale, not a shipped mechanism. `[data-surface="kitchen"]` sets `font-size: var(--kitchen-body-size)` (`1.25rem`) on the surface root, which moves anything sized in `em` or inherited; Tailwind's `text-*` utilities are rem-based and therefore ignore it. Overriding the `--text-*` scale under the surface is a decision M3 has to make before it builds the board — it is in `docs/backlog.md`.

### Color Overrides

- **Background:** Ink Dark `#151311` (kitchen display page background — a full-shift, hot-lights surface; a white screen at eye level is glare)
- **Surface:** Ink `#1C1917` (ticket cards)
- **Raised:** `#292420` (ticket headers, hovered rows, column headers)
- **Text:** Oat `#F6F1E8` (ticket item lines, headings) — **Muted Text:** `#B8AFA5` (table number caption, elapsed labels, secondary notes)
- **Border:** `#7A6C62` (ticket outlines, column dividers) — the token is `--border`, and `--input` is the same value. It was moved off Ink Light `#3D3631`, which measured 1.56:1 on the kitchen background and failed the WCAG 1.4.11 3:1 non-text bar; the new value measures 3.66:1 on the background, 3.46:1 on the ticket surface and 3.03:1 on the raised header.
- **Ember on kitchen:** Ember Light `#F0663D` for the "new order" card edge / active card border and accent text (Ember `#C23E18` is too dark to clear AA on this background — Ember Light is the kitchen-surface variant)
- **Olive on kitchen:** Olive Light `#9CAB63` for tags and secondary labels
- **Focus ring:** Ember Light `#F0663D`, 2px with 2px offset (the kitchen-surface variant of the guest's Ember ring)

**Token names for the values above:** `--background` (Ink Dark), `--card` (Ink), `--secondary` and `--muted` (Raised), `--foreground` and `--card-foreground` (Text), `--muted-foreground` (Muted Text), `--border` and `--input`, `--primary` and `--ring` (Ember Light), `--accent` (Olive Light). They are the same names the guest surface uses; only the values differ, which is what makes one component spec cover both surfaces.

**Order status (dark-surface values, six states) — color is never the only carrier of meaning; every status chip pairs its color with its label text and an icon:**

| State | Dark surface hex | Meaning |
|-------|-------------------|---------|
| Placed | `#8AB4E8` | Order received, not yet paid |
| Paid | `#6CC7B5` | Payment settled |
| Cooking | `#F0B84B` | On the pass, being made |
| Ready | `#7BD389` | Ready to collect or run |
| Served | `#B8AFA5` | Delivered to the table, closed |
| Cancelled | `#F28B82` | Cancelled or refunded |

**Timer thresholds (reuse the status hues, dark surface):**

| Threshold | Hex | Trigger |
|-----------|-----|---------|
| Timer OK | `#7BD389` | Under 5 minutes elapsed |
| Timer Warning | `#F0B84B` | 5 minutes elapsed |
| Timer Late | `#F28B82` | 10 minutes elapsed |

### Component Overrides

- Avoid: gray text on gray background
- Avoid: low contrast text
- Never rely on color alone for order status or timer state — every status chip and every timer badge carries its label text and an icon alongside the color, per brand rule
- Timer and table-number digits use `font-variant-numeric: tabular-nums`
- Nothing on this surface below 16px; body text never below 20px

---

## Page-Specific Components

- Ticket card: table number, item list (with modifiers/notes), elapsed timer, status chip
- Status column header (Placed / Paid / Cooking / Ready)
- Timer badge (OK / Warning / Late, reusing the status hues above)
- "Bump" / mark-ready control at the bottom edge of each ticket card

## Recommendations

- Effects: no decorative glow (text-shadow or otherwise) — it reduces contrast under a kitchen's bright, hot lighting. The "new order" cue is the Ember Light card border plus the status chip's color/label/icon, not a glow effect. Keep visible focus rings and high readability.
- Typography: this is a dark surface — use the lighter Text color (`#F6F1E8`) on the Ink/Ink Dark backgrounds, not dark text (the generic "darker text on light backgrounds" guidance from the raw search does not apply here).
- Accessibility: minimum 4.5:1 for body text — every kitchen-surface pair in `docs/brand-guidelines.md` §1 already measures AAA (16.47:1 text-on-background, 8.57:1 muted-on-background) or AA-and-above for status hues on dark (7.76:1 to 10.29:1).
- CTA Placement: not applicable — a kitchen display has no marketing CTAs. The per-ticket action ("Ready" / bump-to-next-status) sits at the bottom edge of each ticket card.
