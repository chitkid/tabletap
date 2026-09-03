# ADR 0007: Every dish is drawn, not photographed

Date: 2026-09-03
Status: accepted

## Context

A menu without images looks unfinished, and M2 is the milestone a recruiter actually opens. The demo tenant has twenty dishes and no photographs of any of them: there is no kitchen, no photographer, no budget, and no image-generation key in this project.

The usual answers are all worse than they look. Stock photography of somebody else's food, captioned as Little Furnace's, is a lie told in the one place a restaurant product cannot afford one. Twenty generated images would be twenty network requests on a phone, against a milestone whose definition of done includes a Lighthouse audit. And a grid of grey placeholder boxes says the work stopped early.

The visual direction for the guest surface (spec §3) is a printed menu card — oat paper, a display grotesque, tabular prices. Printed menus have illustrations far more often than they have photographs, which is the opening this decision walks through.

## Decision

**Each dish gets a deterministic SVG plate, drawn from its own name.**

`packages/ui/src/lib/plate-plan.ts` exports `planPlate(seed, kind): PlatePlan` — a pure function, no randomness at call time. The dish name is hashed with FNV-1a; the hash seeds a mulberry32 PRNG; the PRNG lays out a composition of typed shapes (`circle`, `ellipse`, `arc`, `wedge`, `stroke`) on a fixed 128-unit viewBox. The same name always draws the same plate, on the server and in the browser, today and after a reseed.

`kind` comes from the category name (`kindFromCategory`): `flatbread`, `bowl`, `side` or `drink`, each with its own composition — a topped round for flatbreads, a rimmed bowl of wedges, scattered pieces for sides, a glass with a straw for drinks. So the four sections of the menu read as four different kinds of thing at a glance, while no two dishes inside a section look alike.

**Colour comes only from the brand.** `packages/ui/src/components/plate.tsx` renders the plan as inline SVG and fills every shape with `var(--plate-slot-N)`. Those six aliases are defined once in `packages/ui/theme.css` over the ember, olive, oat and ink primitives; the component contains no hex, which is what keeps it inside the `validate-tokens` rule (ADR 0005). The SVG carries `role="img"` and the dish name as its `aria-label`.

**A real photo always wins.** `DishCard` renders `item.imageUrl` when it is not null and the plate otherwise. M5's photo upload therefore replaces illustrations dish by dish, with no second decision to make and nothing to migrate.

## Consequences

- Zero image requests on the menu. The illustrations are inline markup that ships with the HTML — no `<img>`, no layout shift while they load, nothing to lazy-load or size.
- Twenty dishes look like one menu. A hand-drawn set at this size would drift; a generated one cannot.
- Nothing on the page claims to be a photograph of food that does not exist. That is the honest version of "we have no photos", and it is the argument that made this the choice rather than the fallback.
- The obvious risk stays: some viewers expect photographs on a food menu, and a drawn plate can read as childish if the shapes get busy. The mitigation is the M5 override, per dish, plus a quieter variant (fewer shapes, more oat) if review says so — never a switch to stock photography.
- Because the planner is pure, it is testable, and `packages/ui/src/lib/plate-plan.test.ts` treats it as the contract it is: the same name and kind produce an identical plan, two names produce different ones, every shape stays inside the plate radius, every palette slot is within range, each kind keeps its signature shapes, and the hash and PRNG are stable and bounded. A change that quietly reshuffles every dish's illustration fails the suite.
- Renaming a dish redraws it. `Plate` takes an optional `seed` for the case where that matters — pass a stable id and the illustration survives the rename.
