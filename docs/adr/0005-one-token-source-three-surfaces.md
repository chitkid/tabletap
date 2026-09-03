# ADR 0005: One token source, three surfaces

Date: 2026-09-03
Status: accepted

## Context

TableTap has three surfaces with genuinely different jobs. The guest orders from a phone in a warm room and sees the restaurant's brand. The kitchen reads a wall-mounted board across a hot, bright room and needs a dark, high-contrast, large-type layout. The admin works through dense tables on a laptop. They look different on purpose — but they are one product, and a colour that changes in one place must change in all three.

The failure mode to avoid is three stylesheets that drift: an ember that is `#C23E18` on the guest surface and `#C24018` on the kitchen board, a status green that passes contrast on light and fails on dark, and nobody noticing until a screenshot ends up in a case study.

## Decision

**One file is the source: `assets/design-tokens.json`**, in three layers.

1. _Primitive_ — colour scales, the 4 pt spacing scale, radii, the type scale, weights, line heights, shadows, durations. Raw values, no meaning attached.
2. _Semantic_ — `background`, `foreground`, `primary`, `border`, `ring`, the six visible `status-*` colours, `timer-ok|warn|late`, fonts, and so on. This layer is what components reference.
3. _Component_ — `button`, `dish-card`, `order-card`, `status-badge`, `cart-counter`.

`pnpm tokens` runs `scripts/generate-tokens.cjs` and emits `packages/ui/tokens.css`. That file and the hand-written `packages/ui/theme.css` are the two stylesheets the apps consume: `tokens.css` carries every value, `theme.css` maps them into Tailwind and defines the surface overrides. The generated file is committed, and CI regenerates it and fails on a diff, so the CSS can never drift from the JSON.

**The semantic layer uses shadcn's variable names** (`--background`, `--primary`, `--muted-foreground`, `--ring`, …). The shadcn components in `packages/ui` therefore work unmodified: they read the variables they already expect, and those variables happen to be our brand. No forked components to re-merge when shadcn changes.

**Surfaces are overrides, not stylesheets.** `packages/ui/theme.css` is hand-written and short. The generated dark semantic block is emitted under `.dark, [data-surface="kitchen"]`, so the kitchen board is the dark theme rather than a second design; `[data-surface="kitchen"]` adds only the larger body size and `color-scheme: dark`. `[data-surface="admin"]` sets `--spacing: 0.2rem`, which Tailwind 4 multiplies through every spacing utility, so the admin surface gets its density from one declaration instead of a parallel set of classes. The same file maps the tokens into Tailwind's `@theme inline`.

**Contrast is enforced, not assumed.** `pnpm validate-tokens` scans `apps/` and rejects raw hex, `rgb()` and multi-digit px or rem values, so a hardcoded colour cannot get past review; a unit test checks WCAG contrast ratios for the semantic pairs on both surfaces. Both run in CI.

## Consequences

- Every colour change flows through `assets/design-tokens.json`, `pnpm tokens`, and the contrast test. Changing a brand colour in a component file is a lint failure, which is the intent.
- The brand document stays upstream of the tokens, but only for the three brand hues. `scripts/sync-brand-to-tokens.cjs` reads the Quick Reference table and the Primary / Secondary / Accent colour sections of `docs/brand-guidelines.md` and rewrites exactly three primitive scales — `primitive.color.ember`, `primitive.color.olive` and `primitive.color.ink`, per the role map at the top of the script. It touches nothing else: the neutral primitives, the semantic layer, the dark block and the component layer are authored by hand in the JSON and gated by `packages/ui/src/tokens.test.ts`, which fails the build if a hand-authored pair drops below its contrast bar. `packages/ui/src/brand-sync.test.ts` runs the script against a throwaway copy of the repository layout and asserts that everything outside those three scales comes back unchanged. If the design system and the brand guidelines disagree about a brand hue, the design system is wrong.
- Because the kitchen is the dark theme, a new semantic token needs a light and a dark value at the moment it is added, or the board gets a light-mode colour on a dark background.
- Generating shades mechanically has one rough edge: the scales above 600 collapse toward black for the near-black `ink` and `olive` bases. It is noted in `docs/backlog.md` and affects no value in use — the semantic layer references shades 100 to 600 only.
- Because the sync is narrow, adding a fourth brand hue is a deliberate edit to the role map in the script plus a colour section in the brand document, not something a rerun invents.
