# Admin Page Overrides

> **PROJECT:** TableTap
> **Reconciled against packages/ui/tokens.css on 2026-09-14**
> **Generated:** 2026-09-03 01:53:58
> **Page Type:** Dashboard / Data View
> **Reconciled with:** `docs/brand-guidelines.md` (light neutral chrome, tabular numerals, single-accent rule)

> **Override warning:** Rules in this file **override** the Master file (`design-system/tabletap/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

> **Reconciliation note:** The raw generator returned a "Real-Time / Operations Landing" marketing pattern (Hero with live preview / Key metrics / How it works / Start-trial CTA) and a dark, blue-primary "Exaggerated Minimalism" style — a SaaS product-landing treatment, not an internal admin dashboard, and the wrong palette (brand: admin is light, not dark). Rewritten below to match `docs/brand-guidelines.md`; the generated dials (Variance 3/10, Motion 2/10, Density 8/10) are kept. The generator's density-8 spacing table has since been replaced too: it named `--space-*` tokens this project does not have, and density on this surface comes from the grid and the type scale rather than a spacing multiplier. See Spacing Overrides below.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** none — a dense dashboard with a persistent sidebar, not a centered marketing max-width column
- **Layout:** Sidebar navigation + top bar, dense content area. No hero, no "how it works" section, no trial/contact CTA — this is an operator's daily tool, not a landing page.
- **Sections:** 1. Today's summary strip (orders today, open orders, revenue — brand voice: "12 orders today. 3 open."), 2. Orders table (sortable, filterable, status column), 3. Menu management (items, availability, "Sold out" toggle), 4. Analytics charts (order volume, popular items), 5. Settings

### Spacing Overrides

Density 8/10 → the generator's "Dense / Dashboard" tier (8-10 bucket). **The generator expressed that as a `--space-xs … --space-3xl` table; this project has no such tokens, so the table has been replaced by the mechanism that actually ships.**

`packages/ui/theme.css` sets no `--spacing` override for this surface. An earlier version multiplied every Tailwind spacing utility by `--spacing: 0.2rem`, which also scaled the size utilities — a `h-11` button came out at about `2.2rem` (≈35px), under the 44px target. M5 removed it: density on this surface comes from the grid and the type scale, not from shrinking every control below 44px. The `--primitive-space-*` tokens were never affected by the multiplier — they are absolute rem values, so a component token such as `--order-card-padding` stays `1rem` either way.

### Typography Overrides

- Headings (page titles, panel titles) use PT Sans Narrow per the Master type scale; body text and all data uses IBM Plex Sans.
- Every numeric column (order counts, revenue, dates, table numbers) sets `font-variant-numeric: tabular-nums` — brand rule, so columns don't jitter or misalign as data updates.
- No mono usage on admin — IBM Plex Mono is reserved for kitchen timers only.
- Type scale reuses the brand's shared Guest/Admin table (`docs/brand-guidelines.md` §2): Body 16px, Small 14px (dense table rows may use Small), Caption 12px, Price 18px/600.

### Color Overrides

- Admin is **light**, not dark — it reuses the guest surface's light neutral tokens as neutral TableTap chrome (not the restaurant-branded treatment): Background Oat `#F6F1E8`, Surface `#FFFDF9` (panels/cards), Sunken `#EDE6DA` (table row stripes only — never put Muted Text on a striped row, it fails contrast per brand rule 2; use full Text `#1C1917` instead), Text `#1C1917`, Muted Text `#6F675F`, Border `#918269` (the `--border` and `--input` token). It was darkened from `#E0D8CB`, which measured 1.26:1 on Oat and failed the WCAG 1.4.11 3:1 non-text bar; admin dividers and table rules are therefore visibly stronger than the earlier value — 3.33:1 on the background, 3.69:1 on a panel.
- Ember `#C23E18` is the single accent — used for the active nav item, primary buttons, and focus ring. No second accent hue.
- Order status badges and any status-colored chart series reuse the six-state semantic table (light-surface values): Placed `#3B6EA5`, Paid `#1F7A6D`, Cooking `#B7791F`, Ready `#2D853C`, Served `#6F675F`, Cancelled `#B3261E`.
- Non-status chart series (e.g. revenue trend, category breakdown) use Olive `#6B7A3C` for large marks/fills and Olive Dark `#4F5B2C` for any olive text, per brand's "chart series that are not statuses" rule — never invent a second accent color for charts.

### Component Overrides

- Data tables: sortable column headers use `aria-sort`; striped rows use Sunken `#EDE6DA` fill with full Text `#1C1917` (not Muted Text) inside the stripe.
- KPI stat tiles use tabular-nums and the admin voice register ("12 orders today. 3 open." — precise, dense, no exclamation).
- Charts follow `--domain chart` guidance: legend visible, tooltip on hover/tap, accessible color pairing (status hues already meet the 3:1 non-text minimum against Oat per brand-guidelines.md §1 accessibility table).

---

## Page-Specific Components

- Orders table (dense rows, sortable, status-badge column, tabular numerals)
- KPI stat tiles (orders today, open orders, revenue)
- Chart panels (order volume over time, popular items) — line/bar per `--domain chart`, not pie beyond 5 categories
- Menu item management rows (availability toggle, "Sold out" state per brand vocabulary)

## Recommendations

- Effects: Motion dial is 2/10 (Subtle), and no motion ships before M6 in any case — the only movement in the system today is a colour transition at `--duration-fast` (120ms). If M5 wants a count-up on a KPI number it is a new decision, kept brief and understated, not the animation-heavy dashboard the raw search implied. No "profit/loss color transitions" — this is a restaurant ops admin, not a trading dashboard; use the six semantic status colors for trend/direction cues instead of inventing green/red profit semantics.
- CTA Placement: no persistent marketing CTA in the nav. Primary actions are contextual to the panel in view ("Add menu item", "Mark table closed", "Export orders"), each using Ember as the single accent, subordinate to the data they act on.
