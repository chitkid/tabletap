# Motion audit — where motion would carry meaning

Discovery pass over the shipped product, ahead of the redesign that adds a motion system.
Analysis only: nothing here is implemented. Method: the `ui-animation` skill's Discovery
workflow — recon the existing vocabulary, sweep every seam, gate each candidate on frequency
and purpose, report survivors _and_ the deaths.

**Seven opportunities accepted. Fourteen rejected.** The rejected list is the more useful half:
it records why several effects a redesign will reach for are wrong _here_, on this product,
rather than merely banned.

The product's one claim — _the kitchen sees the order the moment you tap_ — is the ranking axis.
It is written on the landing (`landing-content.tsx:104`) and demonstrated nowhere.

---

## 1. What already exists, and what it constrains

### 1.1 The vocabulary

| Token              | Value                        | Where                           |
| ------------------ | ---------------------------- | ------------------------------- |
| `--motion-fast`    | 180ms                        | `packages/ui/theme.css`         |
| `--motion-base`    | 280ms                        | `packages/ui/theme.css`         |
| `--motion-stagger` | 60ms                         | `packages/ui/theme.css`         |
| `--motion-ease`    | `cubic-bezier(0.2, 0, 0, 1)` | `packages/ui/theme.css`         |
| `--motion-instant` | 0.01ms                       | sentinel, not a design duration |

Read through `MOTION` in `packages/ui/src/components/motion.ts` as `var()` references. No motion
library: everything is CSS transitions plus `@starting-style` (Tailwind's `starting:` variant).
`--motion-ease` is asymmetric — leaves fast, settles slow — which is the right family for
arrivals and matches the skill's Enter curve. **Every proposal below reuses these five tokens.**
Where a proposal needs a value the set does not carry, it says so and names the new token,
because `scripts/validate-tokens.cjs` fails CI on a bare duration.

Five places already move, exactly as M6 §5 specified:

| #   | What                                              | Where                                                         |
| --- | ------------------------------------------------- | ------------------------------------------------------------- |
| 1   | A ticket arriving on the kitchen board            | `kitchen/ticket-card.tsx:24` (`ARRIVING`)                     |
| 2   | A ticket moving between columns                   | the same string — the card in the new column is a new element |
| 3   | The guest's progress rail advancing               | `order/order-live.tsx:37-39` (`GROWS` + `POPS`)               |
| 4   | The admin edit panel opening                      | `admin/row-editor.tsx:26` (`PANEL_OPENS`)                     |
| 5   | A first-paint stagger on the landing and the menu | `components/entrance.tsx:26` (`CASCADE`)                      |

Opportunities that would duplicate these are called out as already served, not repeated.

### 1.2 Finding: there are two duration families, and they disagree

`packages/ui/tokens.css` (generated from `assets/design-tokens.json`) defines
`--duration-fast: 120ms` and `--duration-base: 180ms`. `button`, `badge`, `input`, `textarea`
and `sheet` consume them as `transition-colors duration-(--duration-fast)`. `--motion-fast` is
also called "fast" and is **180ms**, which is the _other_ family's "base".

`docs/backlog.md:390-399` already records this and notes no task owned it. It is a prerequisite,
not a nice-to-have: three of the proposals below touch a control that currently transitions at
`--duration-fast` and would sit beside an element transitioning at `--motion-base`. Two
elements in one event moving at 120ms and 280ms is the usual cause of "something feels off"
(paired-elements rule). **Settle the family before building any of this.**

### 1.3 Finding: the reduced-motion architecture decides what may be proposed

One rule in `apps/web/app/globals.css` collapses every animation and transition — durations
_and_ delays — to `--motion-instant`. `apps/web/app/globals.test.ts:52` actively fails the build
if any component under `apps/web` or `packages/ui/src` writes its own `motion-reduce:` branch.

That is a good architecture and it has a sharp consequence for this audit:

> **A reduced-motion user always gets the instant end state. Never a bespoke alternative.**
> So any motion whose message exists _only in the movement_ becomes nothing for that user.

This is the gate that kills most of the rejected list. Every accepted opportunity below passes
it by the same test: the meaning is already carried statically — by a word, a colour, a position,
a live region — and the motion only makes it _noticeable_. Where an accepted item needs a static
carrier that does not exist yet, the proposal says so and adds it, rather than asking for a
reduced-motion branch the test forbids.

### 1.4 Finding: what the CI gate does and does not catch

`pnpm validate-tokens` scans `apps/` and `packages/ui/src` for hard-coded hex, rgb/hsl, px, rem,
durations and `cubic-bezier()`. Three blind spots a redesign can walk into:

- It does not flag `transition: all` or Tailwind's `transition-all`. (Currently clean — grep
  across `apps` and `packages` returns nothing. The ban is honoured; it is not enforced.)
- It does not scan `packages/ui/theme.css`, which is where the motion tokens actually live, so
  it cannot see the family collision in 1.2.
- It cannot tell which of the two "fast"s a component chose.

### 1.5 Finding: CLS 0 is true in the audit window, and there is a shift outside it

All six audited pages measure CLS 0 (`docs/lighthouse-results.json`). The product earns that
deliberately: the connection banner keeps its box when online (`kitchen/connection-banner.tsx:25`),
status paragraphs are mounted empty at `min-h-6`, `RowNotice` at `min-h-5`, `ROW_LINE` is one
height in both modes.

One shift escapes the measurement because it happens minutes after load: the kitchen timer
crossing 5 minutes _inserts_ a `size-5` glyph and the text ` · 5 min` into the badge
(`kitchen/timer-badge.tsx:11-19,35`), widening it, which on a three-column board can wrap the
ticket header and grow the card — moving every card below it. Opportunity 4 fixes this; the fix
stands on its own even if the motion is dropped.

---

## 2. Accepted opportunities

Ranked by how much each serves _the kitchen sees the order the moment you tap_.

---

### 1. The landing demonstrates the claim instead of asserting it

`apps/web/components/landing/landing-content.tsx` — new block, directly under the hero line.

**States.** (a) A phone frame holding a two-line order and a "Place order" button, beside a
board frame labelled _Kitchen · New_ with one empty ticket slot. (b) The same two frames with
the ticket present on the board.

**What the movement says that the static frames do not.** That the two screens are connected,
and that the connection has no perceptible latency. The sentence above it is a claim; this is
the evidence. Every other opportunity in this document is visible only to someone already
inside the product — this is the only one a stranger who has not signed in ever sees, and the
landing is the surface where the argument has to be made.

**Trigger.** A press on the phone frame's button. **Not autoplay and not scroll-into-view**:
motion on mount with no user action is the anti-pattern, a loop burns GPU and must be paused
off-screen, and — decisively — the claim is _"the moment you tap"_. A visitor who taps and
watches a ticket land has performed the sentence. A loop they merely watch has not. Offer a
reset so it can be replayed.

**Values.** Ticket: `opacity 0 → 1`, `translateY(8px) → 0`, `--motion-base`, `--motion-ease`
— the same arrival the real board uses, which is the point. A hairline connector between the
frames grows `scaleX(0) → 1` from the phone end over `--motion-fast`, leading the ticket by one
`--motion-stagger`. The phone's button label swaps to "Sent". Three elements, one event, one
curve.

**CLS.** Both frames fixed height; the ticket occupies its final box from first paint at
`opacity: 0`. Nothing is inserted.

**Reduced motion.** The strongest case in the document: collapsed to instant, the ticket is on
the board in the same frame as the press. That is not a degraded version of the claim — it is a
purer one. Add a live region announcing "Ticket for table 7 is on the kitchen board", so the
demonstration is not visual-only and the accessibility score is not bought with a picture.

---

### 2. The order's status change on the guest receipt, choreographed as one event

`apps/web/components/order/order-live.tsx`, `order/order-screen.tsx:70-72`.

**States.** (a) `Order #7 sent to the kitchen.` + a Paid badge + the rail at stage 2.
(b) `Order #7 is being made.` + a Cooking badge + the rail at stage 3.

**What the movement says that the static frames do not.** That this line changed _because the
kitchen just acted_, not because the page reloaded. This is the guest's half of the product's
claim — the moment a stranger's phone reflects a decision made in another room. Today the rail
beside it runs a careful 280ms advance while the two larger elements in the same event — the
headline (the page's LCP element) and the status badge — hard-cut. One of three elements is
choreographed; the other two arrive by teleport.

**Trigger.** The socket's `order:updated` for this order.

**Values.** Headline: `opacity 0 → 1`, `translateY(4px) → 0` at `--motion-base` /
`--motion-ease`, starting on the same frame as the rail's line growth. Badge fill transitions
at the same duration and curve as the headline, _not_ at `--duration-fast` — paired elements in
one event share timing (see 1.2). The dot's existing `--motion-base` delay stays: the line
grows, then the dot answers, then nothing else moves.

**Implementation note.** Swapping text in place with `@starting-style` needs the headline to be
a new element — key it on `order.status`, which is the same trick the rail already relies on.

**CLS — required, not optional.** The six headlines differ in length and wrap to two lines on a
360px phone. This is the LCP element on `/orders/[id]`; reserve a `min-h` sized to the tallest
headline before animating anything.

**Reduced motion.** The new sentence is simply there — which is the entire fact. The `ready`
state additionally already fires an `sr-only role="alert"` (`order-live.tsx:150-154`), and the
badge carries its label as a word, never colour alone.

**Argues against constraint 1.** The badge's fill is `background-color`, which "only `opacity`
and `transform`" forbids. The constraint's real target is _layout_ properties — `width`,
`height`, `top`, `left` — which recalculate layout every frame and are what CLS and the
Lighthouse gate actually punish. Colour is paint: it composites, it shifts nothing, and the
product **already ships it** on `button`, `badge`, `input`, `textarea` and `sheet` via
`transition-colors duration-(--duration-fast)`. Constraint 1 is already not literally true in
the codebase. Restate it as "never animate layout properties; `opacity` and `transform` for
movement, `color`/`background-color` for state feedback only" and it becomes a rule the code
can keep.

---

### 3. A ticket's arrival says where it came from

`apps/web/components/kitchen/ticket-card.tsx:24` (`ARRIVING`), `kitchen/kitchen-board.tsx:331-343`.

**States.** (a) The ticket absent from this column. (b) The ticket present in this column.

**What the movement says that the static frames do not.** _Which of two different events just
happened._ Today one string covers both: a brand-new ticket from a guest's phone and a ticket
someone bumped along rise identically. On a board worked by two or three staff — plus a guest
who can cancel — those are opposite facts. One is new work arriving; the other is work someone
else already took. A cook scanning the board peripherally currently cannot tell them apart
without reading the card.

**Trigger.** The card's insertion into its column's list — `@starting-style`, the mechanism
already in place, so no new machinery.

**Values.** Entering **New** (it came from outside the board): keep today's
`translateY(8px) → 0`. Entering **Cooking** or **Ready** (it came from the column to its left):
`translateX(-12px) → 0`. Both at `--motion-base` / `--motion-ease`, both with the existing
opacity fade.

Two disciplines. Keep the distance small — 12px, not the column width. A card travelling 400px
across the grid would exceed the sub-300ms budget, would be a lie (it did not slide, it was
re-parented), and would drag a cook's eye away from the ticket they are plating. And gate the
horizontal form to `md:` and up: under `md` the board is `grid-cols-1` and the columns stack, so
"from the left" is false there.

**Reduced motion.** The ticket is in its column, which is the whole fact. "New work" already has
three permanent static carriers — the `fresh` left border, the chime, and the document-title
count — so nothing this motion says is said only by the motion.

**Left as it is, deliberately.** The _departure_ is not animated and should not be. Exiting the
old column would need the card kept mounted after the optimistic update, and a cook must never
see a ticket lingering where it no longer is. The existing comment at `ticket-card.tsx:15-23`
argues this correctly; a redesigner reading "if open animates, close animates" should not
undo it.

---

### 4. The timer crossing a threshold — and the shift that reveals

`apps/web/components/kitchen/timer-badge.tsx`.

**States.** (a) `04:59`, no glyph, `--timer-ok`. (b) `05:00 · 5 min`, a triangle, `--timer-warn`.

**What the movement says that the static frames do not.** That _this_ ticket crossed **just
now**. A board showing eight amber timers says nothing about which one newly went wrong; the
static frame conflates "has been late for six minutes" with "became late one second ago". The
glyph arriving is the only available signal for the second. Kitchen time pressure is the
board's entire subject.

**Trigger.** `useNow`'s one-second tick crossing 5 min, then 10 min. Twice per ticket, at most.

**Values.** `opacity 0 → 1`, `scale(0.8) → 1` on the glyph, `--motion-base` / `--motion-ease`.
`transform-box: fill-box; transform-origin: center` on the SVG, or it scales about the canvas
origin.

**Prerequisite, and the reason this earns its rank.** The glyph and the suffix are currently
_inserted_, widening the badge and potentially wrapping the ticket header — the shift described
in 1.5. Reserve both: render the glyph's `size-5` box at every threshold, `aria-hidden` and
`opacity-0` while ok, and give the suffix a fixed-width span. Then the width never changes, the
motion has somewhere to happen, and a real (if unaudited) layout shift is gone. **Do the
reservation whether or not the motion ships.**

**Reduced motion.** The glyph is simply there. Colour and the words ` · 5 min` / ` · late` are
permanent carriers — the codebase already insists colour is never alone
(`timer-badge.tsx:13`) — so this loses nothing but the emphasis.

---

### 5. The basket bar arrives from the edge it lives on

`apps/web/components/basket/basket-bar.tsx`, mounted at `menu/menu-screen.tsx:57-65`.

**States.** (a) A menu with no basket. (b) A menu with a bar pinned across the bottom of the
viewport.

**What the movement says that the static frames do not.** Where the basket _is_. A guest's
first Add currently materialises a bar in a place they were not looking; the thing that appears
gives no account of itself. A bar that rises from the bottom edge says it belongs to that edge
and will stay there — which is the fact a guest needs for the next four taps.

This is also the **honest answer to the effect the brief bans**: the job "confirm the tap put
something in the basket" gets done at the basket, without a fake object flying across the
screen (see R1).

**Trigger.** The first Add on an empty basket only. Subsequent adds change the text _inside_
the bar, which is a live region and must not move.

**Values.** `@starting-style`: `translateY(100%) → 0` plus `opacity 0 → 1`, `--motion-base` /
`--motion-ease`. Identical machinery to `Entrance` and `PANEL_OPENS`.

**CLS.** The bar is `fixed` — out of flow by construction, so this cannot shift anything.
(`pb-28` on the menu already reserves the space it covers.)

**Reduced motion.** The bar is there, and it announces itself: `aria-live="polite"` on the
region already says "1 item · $8.50". The motion is precisely the sighted equivalent of an
announcement that already exists for everyone else.

---

### 6. Controls answer the thumb

`packages/ui/src/components/button.tsx:8`, `menu/quantity-stepper.tsx`, `menu/dish-card.tsx`.

**States.** (a) A control at rest. (b) A control under a thumb.

**What the movement says that the static frames do not.** _Which_ target was hit. The guest
surface is a phone: there is no hover, and the only current press feedback is
`transition-colors` — a colour change underneath the finger that is covering it. A 3% shrink is
visible at the control's edges, outside the contact patch. On a menu of twenty dishes with
adjacent Add buttons and a `size-11` ± pair, mis-taps are the failure this answers.
`docs/design/components.md` already specifies an `active` row for `button` and `dish-card`;
`dish-card.tsx` ships no hover or active treatment at all, so the spec and the code disagree
today.

**Trigger.** `:active`.

**Values.** `active:scale-[0.97]`; press at `duration-0` (instant — it must not lag the finger),
release at `--motion-fast`. Add `touch-action: manipulation` to the `button` base — only
`quantity-stepper.tsx:21` carries it today, so every other control keeps the 300ms tap delay.
Gate any _hover_ counterpart behind `@media (hover: hover) and (pointer: fine)`: Tailwind's
`hover:` is not gated unless the project sets `hoverOnlyWhenSupported`, and it does not, so a
hover style would stick after a tap on the exact surface this is for.

**Constraint 2 holds.** A 0ms press puts nothing between the press and its answer — it _is_ the
press. Nothing is delayed and no information waits behind it.

**Reduced motion.** Fully intact, uniquely. The global rule collapses the _durations_, not the
transform: the control still shrinks while held and snaps back on release. This is the one item
whose reduced-motion form is the same interaction.

---

### 7. The basket sheet behaves like a bottom sheet

`packages/ui/src/components/sheet.tsx`, `basket/basket-sheet.tsx`.

**States.** (a) Sheet closed. (b) A full-width bottom sheet over a dimmed page.

**What the movement says that the static frames do not.** That this is a surface over the menu
which can go back down, rather than a new page. Radix currently ships it with no animation of
any kind: on a phone, a full-width panel that hard-cuts into place reads as navigation, and a
guest who thinks they have left the menu behaves differently from one who knows they are on
top of it.

**Trigger.** `View basket`; and its mirror on Esc, overlay press, and `Keep browsing` — if open
animates, close animates.

**Values.** Content `translateY(100%) → 0`; overlay `opacity 0 → 1`. Same duration
(`--motion-base`) and same curve on both — a drawer whose scrim and panel disagree is the
canonical "off" feeling. A drawer curve (`cubic-bezier(0.32, 0.72, 0, 1)`) is worth a new token
rather than reusing `--motion-ease`, since the gate blocks a bare curve. Overlay gets `opacity`
only, never `background-color` — dimming by animating a colour is the expensive way to do the
cheap thing. Radix keeps the node mounted at `data-state="closed"`, so the exit is a
`data-[state=closed]:` transition, not `@starting-style`.

**Reduced motion.** Open and closed, instantly. The focus trap and the existing focus return to
`openerRef` (`basket-sheet.tsx:50-55`) carry the state change for anyone not seeing the slide.

**Argues against constraint 2, narrowly.** A drawer's entrance does put ~280ms between a press
and a fully-arrived panel. But constraint 2's purpose — and its measured case, the 34ms
payment-to-kitchen path against a 500ms budget — is that no animation should stand between a
person and _information they are waiting for_. Nothing here is gated behind the slide: the
basket's contents are legible from the first frame, and no network call is involved. Ranked
last regardless, because it serves craft rather than the claim.

---

## 3. Rejected

Each entry names the question that killed it. Several are effects the commissioning brief bans;
they are argued here rather than merely obeyed, so that the reasoning survives the ban.

### R1. Items flying from the dish card into the basket

**Killed by: what does it communicate?** It communicates something false. Nothing travels — the
cart is a `localStorage` write (`lib/cart.ts`) and the bar is a live region that recomputes. A
flying ghost invents an object and a journey that do not exist, and it teaches a guest to watch
the corner of the screen instead of the bar that actually holds the answer. It also fails 1.3
outright: collapsed to instant, it is _nothing_, so the confirmation it claims to provide never
reaches a reduced-motion user. Opportunity 5 does the same job at the place the answer lives.

### R2. Blob gradients, ambient background motion, glassmorphism

**Killed by: frequency, then purpose.** A guest sits with `/orders/[id]` open on the table for
the length of a meal, and a cook stares at `/kitchen` for a whole shift. Perpetual background
motion in front of either is the highest-frequency, lowest-information motion possible. It
answers no question, it burns GPU on a tablet that must stay responsive to a socket, and under
1.3 it is the purest example of movement carrying its entire message. Glassmorphism specifically:
the product already uses `backdrop-blur` once, on the sticky category nav
(`menu/category-nav.tsx:11`), where it is a legibility device for text scrolling underneath —
not decoration. Do not escalate that into a style. Blur is expensive, worst in Safari, and the
kitchen surface is a dark board built for reading at a metre.

### R3. Dashboard figures counting up; the week bars growing from zero

**Killed by: what does it communicate?** Four reasons, any one sufficient. (a) The figures are
server-rendered and correct on first paint — animating them means deliberately showing _wrong
revenue_ first. (b) It is motion on mount with no user trigger. (c) The bars are sized by
`height` percentage (`admin/week-bars.tsx:63`) — a layout property, forbidden — and the `scaleY`
alternative would distort the count label riding on each bar. (d) Under 1.3 it collapses to the
final figure, so the animation carried nothing that the static frame does not. This is the most
likely temptation in the redesign and it has no defensible form here.

### R4. A shimmer or pulse on the menu skeleton

**Killed by: reduced motion, then constraint 2.** `app/menu/loading.tsx:1-4` writes
`animate-none` with the comment "motion is an M6 deliverable" — it reads like an invitation, and
it should stay refused. A shimmer's whole message is "not frozen"; collapsed to instant it is a
static grey block, so the reduced-motion user — plausibly the user most in need of reassurance —
gets none. And the real case this would be for is the deployment's measured 34-second cold
start, where the honest instrument is a **sentence**, which the landing already has
(`COLD_START_NOTICE`). A sentence works for everyone; a shimmer works for some.

### R5. Scroll-triggered reveals on "How it works" and the technology list

**Killed by: what does it communicate?** Nothing. Four numbered steps and seven chips have no
state, no arrival and no change; a reveal on scroll is motion attached to the act of scrolling,
which the user did not perform in order to cause it. The landing already has one entrance
(`Entrance`, first paint only, capped at the fourth child) and one entrance per surface is the
budget.

### R6. A hover lift on the three landing role cards

**Killed by: it would promise a target that does not exist.** The `Card` is not clickable — only
the `Link` inside it is (`landing-content.tsx:158-164, 177-185`). A card that lifts under the
cursor claims the whole card is a door, and a click on its padding does nothing. This is a
correctness objection, not taste. If the redesign wants the card to be the target, that is a
`product-design` decision about what is clickable; the motion follows it, not the reverse.

### R7. The Simulate-rush cooldown as a depleting bar

**Killed by: reduced motion.** A 60-second `scaleX` countdown is cheap and composited, but its
only content is time remaining, which the button's own message already states in words ("12
orders over the next minute"). Collapsed to instant it is a full bar, then an empty one —
nothing. Separately worth recording: the real weakness of this control is that a landing visitor
presses it and is sent nowhere to see the result. That is a routing question for
`product-design`, not something motion can repair.

### R8. The connection banner easing in when the feed drops

**Killed by: bad news must not be eased.** A 280ms fade delays the one message on the kitchen
board that is urgent. The band already holds its space when online
(`connection-banner.tsx:18-29`) — a fix that cost `/kitchen` 0.044 CLS to earn — so the swap is
already shift-free and instant, which is correct. The recovery direction is no better: "the
board is live again" is told far more convincingly by the tickets resyncing than by a banner
tidying itself away.

### R9. Crossfading the confirm swaps (ticket cancel, QR reissue)

**Killed by: it would be actively harmful.** Both controls replace themselves in place with a
question — `ticket-card.tsx:108-149` and `admin/qr-actions.tsx:83-125` — precisely so that
nothing else can be pressed by mistake while the question stands. A 280ms crossfade leaves a
phantom of the just-pressed button under the finger and a half-visible destructive button beside
it, on the two controls in the product that cannot be undone (a reissue invalidates every
printed code immediately). It is also motion between a press and its answer. The instinct is
natural and it is wrong here.

### R10. An exit animation on the admin edit panel

**Killed by: constraint 2, and asymmetry that is deliberate.** The open is animated
(`PANEL_OPENS`); the close is not, which reads as an oversight against "if open animates, close
animates". It is not one. The close _is_ the confirmation that a save landed, so delaying it
puts animation between a press and its answer. It also coincides with focus returning to the
Edit button and the cells reverting to text — ample signal. Implementation would additionally
require keeping the panel mounted after unmount, which `@starting-style` cannot do. Recorded so
a redesigner does not "fix" it.

### R11. Route transitions anywhere

**Killed by: constraint 2, and a decision already taken.** The guest's
`/menu → /checkout → /pay → /orders` chain and the admin's three-section nav are full navigations.
M6 §2 rejected route transitions explicitly as "the only option that adds delay to something a
person is waiting for, and the most fragile thing to build on the App Router". Nothing has
changed; `/menu` and `/orders/[id]` are `force-dynamic` and already await the API. Adding 300ms
of choreography in front of a page that is waiting on a network is the exact failure the
constraint was written for.

### R12. Anything between a press and its answer

**Killed by: constraint 2, working as intended.** Covers the kitchen bump button's pending state
(`kitchen-board.tsx:236-287`), `Place order` (`checkout-screen.tsx:212-219`), `Pay`
(`pay-button.tsx:58-67`), the demo terminal's `Pay` / `Decline`, and admin `Save`. All five
already answer with a label swap, `disabled` and `aria-busy` — a text carrier that works
identically for every user. A spinner or a progress treatment would add nothing and would
animate the one interval the product deliberately left bare. Recorded as a single entry because
it is a single rule.

### R13. Motion on focus rings or any keyboard-initiated action

**Killed by: a core rule.** Keyboard actions repeat constantly and animation makes them feel
slow. Every ring in the product is instant and stays that way. Worth naming because focus
styling is where a "polish pass" reaches first.

### R14. A number pop on the quantity stepper; the fresh-ticket border fading out on touch

**Killed by: frequency, then purpose.** The stepper is the highest-frequency control on the
guest surface and is thumb-repeatable; the skill's rule is that high-frequency actions must be
invisible. A pop would also fight the basket bar's live region, which announces the same change
in words (`quantity-stepper.tsx:31-32` already reasons this way about announcements). The fresh
border's disappearance communicates "acknowledged", which the bump that caused it has already
said.

### R15. Giving the sold-out switch a travelling thumb

**Killed by: wrong question.** `admin/menu-row.tsx:263-272` is a `Button` with `role="switch"`
that swaps variant and label. A real thumb that travels would communicate the binary better —
but that is a change to _what the control is_, not to how it moves between states it already
has. Route to `ui-design`; motion follows once the control's shape is settled.

---

## 4. The single highest-leverage item

**Opportunity 1.** Everything else improves motion inside a product someone has already decided
to look at. Only the landing demonstration changes what a stranger learns before deciding —
and it is the only place where the product's one claim, currently a sentence, becomes a fact
they caused themselves.

## 5. Order of work

1. Settle the duration families (1.2). Nothing below is buildable against two "fast"s.
2. Reserve the timer badge's glyph and suffix width (1.5 / opportunity 4) — a real shift, fixed
   independently of any motion.
3. Reserve the order headline's height (opportunity 2) before touching it — it is the LCP element
   on `/orders/[id]`.
4. Then build in rank order, re-running the Lighthouse audit after opportunities 1, 2 and 4,
   since those are the three that touch an audited page's layout.
