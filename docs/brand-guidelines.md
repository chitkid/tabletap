# Little Furnace — Brand Guidelines v1.4

> Last updated: 2026-09-15 (v1.4)
> Status: Active for M1–M6

TableTap is the product: QR table ordering with a real-time kitchen display. Little Furnace is the seeded demo tenant that TableTap ships with — a neighbourhood wood-fired place serving flatbreads, grain bowls and a short list of sides and drinks. You order from the table and the food comes when it is ready; fast-casual pace, warm room. The name and the furnace image set the two surfaces: the kitchen surface takes the dark back-of-house character, the guest surface takes the warmth. The guest surface wears the restaurant brand; kitchen and admin wear neutral TableTap chrome — dark for kitchen, light and dense for admin — with ember as the single accent. All three come from the token base defined here. This document is the source of truth: the design system, `assets/design-tokens.json` and every UI string derive from it.

## Quick Reference

| Element         | Value                                   |
| --------------- | --------------------------------------- |
| Primary Color   | #C23E18                                 |
| Secondary Color | #6B7A3C                                 |
| Accent Color    | #1C1917                                 |
| Primary Font    | PT Sans Narrow                          |
| Voice           | Counter-side, direct, honest about time |

---

## 1. Color Palette

Charcoal ink for text and the kitchen background, one accent — ember orange — an oat off-white for guest backgrounds, and olive as the secondary. There is exactly one accent hue. If a screen needs a second attention colour, it needs fewer things competing for attention.

### Primary Colors

Ember. The wood-fired accent: the single call-to-action colour on both surfaces.

| Name        | Hex     | RGB             | Usage                                                                                                 |
| ----------- | ------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| Ember       | #C23E18 | rgb(194,62,24)  | Primary buttons, active tab, focus ring, price emphasis, the ember accent on kitchen and admin chrome |
| Ember Dark  | #9E3112 | rgb(158,49,18)  | Hover and pressed states on the guest surface, ember text on oat where the text is small              |
| Ember Light | #F0663D | rgb(240,102,61) | Ember on the kitchen surface: accent text, active card border, the "new order" edge                   |

### Secondary Colors

Olive. The quiet supporting hue — categories, vegetarian and dietary tags, chart series that are not statuses.

| Name        | Hex     | RGB             | Usage                                                                   |
| ----------- | ------- | --------------- | ----------------------------------------------------------------------- |
| Olive       | #6B7A3C | rgb(107,122,60) | Category chips, tag fills, large text, non-text UI on the guest surface |
| Olive Dark  | #4F5B2C | rgb(79,91,44)   | Olive body text and small text on oat; hover on olive fills             |
| Olive Light | #9CAB63 | rgb(156,171,99) | Olive on the kitchen surface: tags and secondary labels                 |

### Accent Colors

Ink. Charcoal: the text colour on the guest surface and the ground of the kitchen surface. Named an accent so the token pipeline generates its scale alongside ember and olive; in use it is structural, not decorative.

| Name      | Hex     | RGB           | Usage                                                                                                                    |
| --------- | ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Ink       | #1C1917 | rgb(28,25,23) | Body and heading text on the guest surface; card surface on the kitchen surface                                          |
| Ink Dark  | #151311 | rgb(21,19,17) | Kitchen page background                                                                                                  |
| Ink Light | #3D3631 | rgb(61,54,49) | Heavy rules on the guest surface. Not the kitchen border: that value is the neutral Border below, which has to clear 3:1 |

### Neutral Palette

Two neutral sets. The guest surface is light and warm; the kitchen surface is dark, because a kitchen display runs for a full shift under hot lights and a white screen at eye level is glare.

**Guest surface (light)**

| Name       | Hex     | RGB              | Usage                                           |
| ---------- | ------- | ---------------- | ----------------------------------------------- |
| Background | #F6F1E8 | rgb(246,241,232) | Oat page background                             |
| Surface    | #FFFDF9 | rgb(255,253,249) | Cards, sheets, menu items, text on ember fills  |
| Sunken     | #EDE6DA | rgb(237,230,218) | Input wells, table row stripes, inset panels    |
| Text       | #1C1917 | rgb(28,25,23)    | Body and headings                               |
| Muted Text | #6F675F | rgb(111,103,95)  | Item descriptions, timestamps, secondary labels |
| Border     | #918269 | rgb(145,130,105) | Dividers, card outlines, input borders          |

**Kitchen surface (dark)**

| Name       | Hex     | RGB              | Usage                                         |
| ---------- | ------- | ---------------- | --------------------------------------------- |
| Background | #151311 | rgb(21,19,17)    | Kitchen display page background               |
| Surface    | #1C1917 | rgb(28,25,23)    | Ticket cards                                  |
| Raised     | #292420 | rgb(41,36,32)    | Ticket headers, hovered rows, column headers  |
| Text       | #F6F1E8 | rgb(246,241,232) | Ticket item lines, headings                   |
| Muted Text | #B8AFA5 | rgb(184,175,165) | Table number, elapsed labels, secondary notes |
| Border     | #7A6C62 | rgb(122,108,98)  | Ticket outlines, column dividers              |

### Semantic Colors

Six order statuses, each with a light-surface and a dark-surface value. Colour is never the only carrier of meaning: every status also carries its label, and the kitchen ticket also carries position and a timer.

| State     | Light surface (#F6F1E8) | Dark surface (#151311) | Meaning                        |
| --------- | ----------------------- | ---------------------- | ------------------------------ |
| Placed    | #3B6EA5                 | #8AB4E8                | Order received, not yet paid   |
| Paid      | #1F7A6D                 | #6CC7B5                | Payment settled                |
| Cooking   | #B7791F                 | #F0B84B                | On the pass, being made        |
| Ready     | #2D853C                 | #7BD389                | Ready to collect or run        |
| Served    | #6F675F                 | #B8AFA5                | Delivered to the table, closed |
| Cancelled | #B3261E                 | #F28B82                | Cancelled or refunded          |

Timer thresholds reuse the status hues rather than adding new ones:

| Threshold     | Light   | Dark    | Trigger                 |
| ------------- | ------- | ------- | ----------------------- |
| Timer OK      | #2D853C | #7BD389 | Under 5 minutes elapsed |
| Timer Warning | #B7791F | #F0B84B | 5 minutes elapsed       |
| Timer Late    | #B3261E | #F28B82 | 10 minutes elapsed      |

### Accessibility

Every ratio below was computed with the WCAG 2.1 relative-luminance formula against the exact hex pairs listed. Every text pair passed its required check on the first pass. Three values were moved: the guest and kitchen borders, which failed WCAG 1.4.11 for non-text contrast (see that block below), and Ready, darkened from #2F8A3E to #2D853C in M2 — the badge label sits on the status fill, and at #2F8A3E the label measured 4.28:1 against Surface #FFFDF9, below AA. The darker green measures 4.56:1 and keeps the same hue.

**Required pairs**

| Foreground          | Background      | Measured | Required | Result     |
| ------------------- | --------------- | -------- | -------- | ---------- |
| Text #1C1917        | Oat #F6F1E8     | 15.54:1  | 4.5      | Pass (AAA) |
| Muted text #6F675F  | Oat #F6F1E8     | 4.94:1   | 4.5      | Pass (AA)  |
| Surface #FFFDF9     | Ember #C23E18   | 5.17:1   | 4.5      | Pass (AA)  |
| Ember Light #F0663D | Kitchen #151311 | 5.89:1   | 4.5      | Pass (AA)  |

**Status colours on their surface (minimum 3.0:1)**

| Status    | On oat #F6F1E8 | On kitchen #151311 |
| --------- | -------------- | ------------------ |
| Placed    | 4.71:1         | 8.63:1             |
| Paid      | 4.59:1         | 9.24:1             |
| Cooking   | 3.24:1         | 10.29:1            |
| Ready     | 4.12:1         | 10.17:1            |
| Served    | 4.94:1         | 8.57:1             |
| Cancelled | 5.81:1         | 7.76:1             |

**Status labels on their own fill (minimum 4.5:1)**

Every status badge is filled, so its label owes AA against the fill it sits on, not only 3.0:1 against
the page. The label colour is Surface #FFFDF9 on five of the six and Text #1C1917 on Cooking, whose
amber is too light for the pale label.

| Status    | Label           | On the light fill | On the kitchen fill |
| --------- | --------------- | ----------------- | ------------------- |
| Placed    | Surface #FFFDF9 | 5.22:1            | 8.63:1              |
| Paid      | Surface #FFFDF9 | 5.09:1            | 9.24:1              |
| Cooking   | Text #1C1917    | 4.80:1            | 10.29:1             |
| Ready     | Surface #FFFDF9 | 4.56:1            | 10.17:1             |
| Served    | Surface #FFFDF9 | 5.47:1            | 8.57:1              |
| Cancelled | Surface #FFFDF9 | 6.43:1            | 7.76:1              |

On the kitchen surface the label token resolves to the night background, so a kitchen badge is dark
text on a light status fill; those ratios are the ones already listed against Kitchen #151311.

**Supporting pairs, measured**

| Foreground            | Background      | Measured | Note                                        |
| --------------------- | --------------- | -------- | ------------------------------------------- |
| Ember #C23E18         | Oat #F6F1E8     | 4.67:1   | Ember text on oat is AA at any size         |
| Ember Dark #9E3112    | Oat #F6F1E8     | 6.43:1   | Preferred for ember text under 16 px        |
| Olive #6B7A3C         | Oat #F6F1E8     | 4.17:1   | Below AA for body text — see the rule below |
| Olive Dark #4F5B2C    | Oat #F6F1E8     | 6.51:1   | The text-safe olive                         |
| Olive Light #9CAB63   | Kitchen #151311 | 7.43:1   | Pass (AA)                                   |
| Ink Light #3D3631     | Oat #F6F1E8     | 10.54:1  | Pass (AAA)                                  |
| Text #1C1917          | Surface #FFFDF9 | 17.21:1  | Pass (AAA)                                  |
| Muted text #6F675F    | Surface #FFFDF9 | 5.47:1   | Pass (AA)                                   |
| Text #1C1917          | Sunken #EDE6DA  | 14.10:1  | Pass (AAA)                                  |
| Muted text #6F675F    | Sunken #EDE6DA  | 4.48:1   | Below AA — see the rule below               |
| Kitchen text #F6F1E8  | Kitchen #151311 | 16.47:1  | Pass (AAA)                                  |
| Kitchen muted #B8AFA5 | Kitchen #151311 | 8.57:1   | Pass (AAA)                                  |
| Kitchen text #F6F1E8  | Raised #292420  | 13.65:1  | Pass (AAA)                                  |
| Kitchen muted #B8AFA5 | Raised #292420  | 7.10:1   | Pass (AAA)                                  |

**Non-text contrast (WCAG 1.4.11)**

A border is the only thing that says where a card, an input or a ticket ends, so it is a meaningful non-text element and owes 3.0:1 against whatever it is drawn on. The original oat border #E0D8CB measured 1.26:1 on the oat background and 1.39:1 on the card surface; the original kitchen border #3D3631 measured 1.56:1 on the kitchen background and 1.47:1 on the ticket surface. All four fail. Both values were moved along their own hue — the oat border stays a warm oat taupe, the kitchen border stays the same warm grey — until they clear the bar on every surface they are drawn on, including the sunken fill and the raised ticket header.

| Element                         | Surface         | Measured | Required |
| ------------------------------- | --------------- | -------- | -------- |
| Border #918269                  | Oat #F6F1E8     | 3.33:1   | 3.0      |
| Border #918269                  | Surface #FFFDF9 | 3.69:1   | 3.0      |
| Border #918269                  | Sunken #EDE6DA  | 3.02:1   | 3.0      |
| Kitchen border #7A6C62          | Kitchen #151311 | 3.66:1   | 3.0      |
| Kitchen border #7A6C62          | Surface #1C1917 | 3.46:1   | 3.0      |
| Kitchen border #7A6C62          | Raised #292420  | 3.03:1   | 3.0      |
| Focus ring, Ember #C23E18       | Oat #F6F1E8     | 4.67:1   | 3.0      |
| Focus ring, Ember #C23E18       | Surface #FFFDF9 | 5.17:1   | 3.0      |
| Focus ring, Ember Light #F0663D | Kitchen #151311 | 5.89:1   | 3.0      |
| Focus ring, Ember Light #F0663D | Surface #1C1917 | 5.56:1   | 3.0      |

Text inside an input well still uses Text #1C1917, which measures 4.66:1 against the border itself — the border is a boundary, never a text background. `packages/ui/src/tokens.test.ts` asserts the border and input pairs on both surfaces, so a lighter border cannot come back unnoticed.

**Two usage rules follow from the measurements above.**

1. Olive #6B7A3C measures 4.17:1 on oat. It clears the 3.0:1 bar for large text (18.66 px bold or 24 px regular) and for non-text UI such as chip fills, borders and icons, and it is approved for exactly those. Olive body text on oat uses Olive Dark #4F5B2C (6.51:1).
2. Muted text #6F675F measures 4.48:1 on the sunken fill #EDE6DA — a near miss against the 4.5:1 bar. Muted text sits on the background or on a card surface, never on a sunken fill. Text inside inputs, striped rows and inset panels uses Text #1C1917 (14.10:1).

Focus rings use Ember #C23E18 at 2 px with a 2 px offset against the surface behind them; on the kitchen surface the ring is Ember Light #F0663D. Disabled states drop opacity but never fall below 3.0:1 against their surface.

---

## 2. Typography

### Decision

Display: **PT Sans Narrow**. Text: **IBM Plex Sans**. Mono: **IBM Plex Mono**.

The `ui-ux-pro-max` typography search for "warm neighbourhood restaurant wood-fired flatbread" returned five pairings, none of which was adopted. Its top restaurant result is Playfair Display SC + Karla — the display-serif restaurant cliché the spec rules out. Results two through four (Fredoka + Nunito, Caveat + Quicksand, Varela Round + Nunito Sans) are rounded and playful, aimed at children's and lifestyle products; a room that cooks over fire is warm, not cute. The fifth, Calistoga + Inter + JetBrains Mono, is the closest in shape — a display face for warmth over a workhorse sans plus a mono for data — and its structure is what this pairing adopts, but Calistoga is a chunky display serif with a single weight and no numeral variants, which will not carry prices, timers or a kitchen ticket.

Bricolage Grotesque was chosen in M1 for the character the spec asked for: a variable grotesque with a slightly irregular, printed-signage quality, which read as a neighbourhood place rather than a chain. IBM Plex Sans is the workhorse underneath it, with real tabular numerals for prices, timers and tables and a wide weight range for a dense admin surface. IBM Plex Mono comes from the same superfamily, so the kitchen timers sit next to Plex Sans ticket lines without a seam. The `ui-ux-pro-max` google-fonts search for "Bricolage Grotesque IBM Plex Sans" returned five IBM Plex Sans script variants (KR, Condensed, Devanagari, Hebrew, Thai) and neither of the two families named in the query, so no ranked recommendation came out of it; a direct lookup in the skill's `data/google-fonts.csv` confirmed all three families were present and available on Google Fonts — Bricolage Grotesque as a variable Sans Serif / Display face, IBM Plex Sans as a variable sans with Latin and Cyrillic subsets, IBM Plex Mono as the matching monospace.

Bricolage Grotesque is replaced as the display face in v1.3, ahead of the Russian localisation milestone. Google Fonts lists its subsets as `vietnamese, latin-ext, latin` — no Cyrillic — so a face chosen for the printed-signage character of a Latin neighbourhood spot cannot draw that same signage once it is in Russian. PT Sans Narrow replaces it: Paratype drew it from Cyrillic, and it is the face of Russian printed forms and timetables — the same vernacular register Bricolage Grotesque held for Latin. IBM Plex Sans and IBM Plex Mono are unchanged.

### Font Stack

```css
--font-display: 'PT Sans Narrow', 'Arial Narrow', system-ui, sans-serif;
--font-body: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Consolas, monospace;
```

Every price, quantity, table number, elapsed time and money column sets `font-variant-numeric: tabular-nums` so digits do not jitter as they tick.

### Type Scale

Guest and admin surfaces:

| Element    | Size (Desktop) | Size (Mobile) | Font    | Weight | Line Height |
| ---------- | -------------- | ------------- | ------- | ------ | ----------- |
| Display    | 48px           | 34px          | Display | 700    | 1.1         |
| H1         | 36px           | 28px          | Display | 700    | 1.15        |
| H2         | 28px           | 24px          | Display | 600    | 1.2         |
| H3         | 22px           | 20px          | Display | 600    | 1.3         |
| Body Large | 18px           | 18px          | Body    | 400    | 1.6         |
| Body       | 16px           | 16px          | Body    | 400    | 1.5         |
| Small      | 14px           | 14px          | Body    | 400    | 1.5         |
| Caption    | 12px           | 12px          | Body    | 500    | 1.4         |
| Price      | 18px           | 18px          | Body    | 600    | 1.3         |

Kitchen surface. A cook reads this from roughly a metre away, often at an angle, sometimes through steam. Nothing on this surface is smaller than 16 px, and body text is 20 px or larger.

| Element             | Size (Display) | Font    | Weight | Line Height |
| ------------------- | -------------- | ------- | ------ | ----------- |
| Ticket table number | 32px           | Display | 700    | 1.1         |
| Ticket item line    | 22px           | Body    | 500    | 1.35        |
| Kitchen body        | 20px           | Body    | 400    | 1.4         |
| Modifier / note     | 18px           | Body    | 400    | 1.4         |
| Timer               | 28px           | Mono    | 500    | 1.1         |
| Column header       | 16px           | Body    | 600    | 1.2         |

### Font Loading

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=PT+Sans+Narrow:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

`display=swap` is deliberate: the fallback stack renders immediately and the layout must not shift when the webfont lands. The kitchen display in particular has to be readable on a cold start over a slow venue network.

---

## 3. Logo Usage

Little Furnace has a wordmark and nothing else in M1. The wordmark now ships as an SVG file, `assets/little-furnace-wordmark.svg`. A favicon and an icon mark exist too, as of M6, but they belong to TableTap, not to Little Furnace — see **The TableTap mark**, below. Do not reference a logo file that does not exist, and do not substitute a stand-in mark.

### Wordmark

The wordmark is the words **Little Furnace** set in the display face at 700, tracking `-0.02em`, sentence-cased as written — never all caps, never all lowercase.

**Which display face, and why this section names two.** §2 is the authority and it says **PT Sans Narrow** since v1.3; that is what the product loads and what the guest header, the kitchen chrome and the admin chrome draw the wordmark in, as live text. The SVG at `assets/little-furnace-wordmark.svg` is older: it was cut in M6 from **Bricolage Grotesque** 700 and its letterforms are outlined paths, not live text, so it kept the shapes it was drawn with when the display face changed. Both are correct and they are correct about different things — the file is a fixed piece of artwork, the rule below is for anyone setting the words in type. Nothing is to be re-cut: a second wordmark artwork is a second brand, and this one is legible, in use and unaffected by which face a browser loads.

| Context                       | Colour                                       | Minimum size |
| ----------------------------- | -------------------------------------------- | ------------ |
| Guest surface header          | Ink #1C1917 on oat #F6F1E8                   | 20px         |
| Guest surface, ember emphasis | Ember Dark #9E3112 on oat #F6F1E8            | 20px         |
| Kitchen and admin chrome      | Kitchen text #F6F1E8 on ink dark #151311     | 18px         |
| Single-colour contexts        | Ink #1C1917, or kitchen text #F6F1E8 on dark | 18px         |

Clear space around the wordmark is the cap height of the L on all four sides.

### Don'ts

- Don't set the wordmark in any face other than the display face §2 names — PT Sans Narrow today. Don't re-cut `assets/little-furnace-wordmark.svg` to match it: see above.
- Don't stretch, skew, rotate or outline it.
- Don't colour it outside the four combinations in the table above.
- Don't add a flame, a furnace, a chef hat or any other picture beside it as a stand-in mark.
- Don't place it over a photograph or any background that drops its contrast below 4.5:1.
- Don't put the TableTap product name and the Little Furnace wordmark in the same lockup. The guest surface is the restaurant; TableTap chrome is the kitchen and admin.

### The TableTap mark

TableTap's mark is an open ring, its gap at the lower right, with a solid ember dot at the centre — a tabletop seen from above, and the tap. It belongs to the product, not to the restaurant, and it is drawn once as a design-system component, `packages/ui/src/components/mark.tsx`: the ring takes `currentColor`, the dot takes Ember `var(--primary)`. The same geometry is duplicated as literal values in two more files, because neither has a CSS context to resolve a token against — `apps/web/app/icon.svg` (the favicon: Ink #1C1917 and Ember #C23E18) and `apps/web/app/apple-icon.tsx` (180×180, the mark on an ember field).

**Where it appears.** Kitchen and admin chrome, beside the product name. The browser tab and the home-screen icon, on every page — guest pages included, because the tab and the icon are the product's chrome, not the restaurant's room.

**Where it does not appear.** Inside the guest surface's own content. The guest surface wears Little Furnace; it does not also wear TableTap.

**It never shares a lockup with the wordmark above.** The rule runs both ways: the wordmark never sits beside the mark, and the mark never sits beside the wordmark. One screen, one brand.

---

## 4. Voice & Tone

Little Furnace sounds like the person at the counter who knows the menu and has four other tables. Warm, brief, never performing.

### Principles

**1. Talk like the person at the counter.**

- "Anything else?"
- "Ready when you are."
- "Table 7, welcome back."

**2. Say the thing.**

- "Order sent to the kitchen." — not "Yay! Your order is on its way!"
- "That email and password don't match." — not "Oops!"

**3. Time is honest.**

- "About 12 min", backed by a real timer. Never "soon", never "almost there" without a number.

### Forbidden

| Avoid                                                                    | Reason                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Exclamation-heavy startup cheer ("Yay!", "Awesome!", "You're all set!!") | Nobody at a counter talks like this                         |
| Emoji in UI copy                                                         | Not in any string, any surface, any state                   |
| Apologising errors ("Oops!", "Sorry, something went wrong")              | An error should say what happened and what to do            |
| Marketing adjectives ("delicious", "amazing", "seamless", "curated")     | The menu describes the food; the interface does not sell it |
| Vague time ("soon", "shortly", "almost there")                           | If there is no number, do not imply one                     |

### Vocabulary

| Say                                 | Not                                             | Why                                              |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| Order sent to the kitchen           | Your order is on its way!                       | States what happened, no cheer                   |
| Ready when you are                  | Proceed to checkout                             | The counter phrase, not the funnel phrase        |
| About 12 min                        | Ready soon                                      | A number backed by a real timer                  |
| That email and password don't match | Oops! Login failed                              | Names the problem without apologising            |
| Anything else?                      | Would you like to add more items to your order? | Shorter, and how it is actually asked            |
| Table 7, welcome back               | Session restored                                | Human, and tells the guest which table is theirs |
| Sold out                            | Currently unavailable                           | What the kitchen actually says                   |
| Paid                                | Payment successful!                             | One word is enough                               |
| Cancelled                           | Order cancelled successfully                    | "Successfully" adds nothing                      |

### Tone by Context

| Context         | Tone                         | Example                                |
| --------------- | ---------------------------- | -------------------------------------- |
| Guest ordering  | Warm, brief                  | "Ready when you are."                  |
| Order status    | Factual, timed               | "Cooking. About 12 min."               |
| Errors          | Plain, actionable            | "That email and password don't match." |
| Empty states    | Matter-of-fact               | "Nothing in the basket yet."           |
| Kitchen display | Instructional, no decoration | "Table 7 · 2 flatbread · 1 grain bowl" |
| Admin           | Precise, dense               | "12 orders today. 3 open."             |

Sentence case everywhere. No terminal full stop on a button or a single-line label; full stops in sentences.

---

## Changelog

| Version | Date       | Changes                                                                                                                                                                                                                                                                             |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-09-03 | Initial guidelines: ember, olive and ink palette with measured WCAG ratios; Bricolage Grotesque with IBM Plex Sans and IBM Plex Mono; wordmark-only logo policy; voice principles and vocabulary.                                                                                   |
| 1.1     | 2026-09-03 | Guest border #E0D8CB → #918269 and kitchen border #3D3631 → #7A6C62, so both clear the WCAG 1.4.11 3:1 non-text bar on every surface they are drawn on. Added the non-text contrast block.                                                                                          |
| 1.2     | 2026-09-05 | The M1 debt: `assets/little-furnace-wordmark.svg` now exists. Added the TableTap mark (§3), a separate identity from the wordmark, with its own usage rules and its own component, favicon and app icon files.                                                                      |
| 1.3     | 2026-09-14 | Display face Bricolage Grotesque → PT Sans Narrow ahead of Russian localisation: Bricolage Grotesque has no Cyrillic; PT Sans Narrow is Paratype's Cyrillic face for Russian forms and timetables.                                                                                  |
| 1.4     | 2026-09-15 | §3 still named Bricolage Grotesque as the wordmark's face and forbade any other, one section after §2 replaced it. Says which face applies where: the product sets the words in the §2 display face, and the M6 SVG keeps the Bricolage outlines it was cut from and is not re-cut. |
