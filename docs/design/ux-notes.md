# UX Notes

Supplementary `ui-ux-pro-max` searches run alongside the Task 11 design-system generation, grouped by topic. Each bullet is the rule name and guideline as returned by the search; nothing here is invented. Source queries are recorded under each heading.

## Touch targets

Query: `"touch target size mobile ordering" --domain ux -n 5`

- **Touch Target Size** (Touch, Mobile, High severity) — Small buttons are hard to tap accurately. Do: minimum 44x44px touch targets. Don't: tiny clickable areas.
- **Touch Spacing** (Touch, Mobile, Medium severity) — Adjacent touch targets need adequate spacing. Do: minimum 8px gap between touch targets. Don't: tightly packed clickable elements.
- **Touch Friendly** (Responsive, Web, High severity) — Mobile layouts need touch-sized targets. Do: increase touch targets on mobile. Don't: use the same tiny buttons on mobile as on desktop.
- **Pull to Refresh** (Touch, Mobile, Low severity) — Accidental refresh is frustrating. Do: disable pull-to-refresh where not needed (e.g. `overscroll-behavior: contain`).
- **Tap Delay** (Touch, Mobile, Medium severity) — the 300ms tap delay feels laggy. Do: use `touch-action: manipulation` or equivalent.

**Planned (M2):** guest-surface "Add to cart" and quantity steppers meet the 44x44px minimum with 8px+ gaps (see `design-system/tabletap/MASTER.md` pre-delivery checklist). In M1 the rule applies to the sign-in form, whose inputs and button are `h-11` (44px).

## States (loading/empty/error)

Query: `"loading state skeleton empty state error state" --domain ux -n 5`

- **Error Messages** (Accessibility, All, High severity) — error messages must be announced. Do: use `aria-live` or `role="alert"` for errors. Don't: rely on visual-only error indication.
- **Empty States** (Feedback, All, Medium severity) — guide users when no content exists. Do: show a helpful message and action. Don't: leave a blank empty screen.
- **Error Placement** (Forms, All, Medium severity) — errors should appear near the problem. Do: show the error below the related input. Don't: put a single error message at the top of the form.
- **Active State** (Navigation, All, Medium severity) — the current page/section should be visually indicated. Do: highlight the active nav item with color/underline. Don't: leave no visual feedback on current location.
- **Deep Linking** (Navigation, All, Medium severity) — URLs should reflect current state for sharing. Do: update the URL on state/view changes. Don't: use a static URL for dynamic content.

The search query targeted loading/empty/error states specifically; the tool's ranking also surfaced two adjacent Navigation-domain results (Active State, Deep Linking), included above for completeness since they are what the search returned. No result specifically named a loading-skeleton rule — defaults used for skeleton/shimmer timing (show a skeleton after 300ms of wait, per the Quick Reference `progressive-loading` guidance bundled with the skill).

**Planned (M2/M4):** empty basket and empty order-history states use brand voice ("Nothing in the basket yet.") per `docs/brand-guidelines.md` §4; payment errors are plain and actionable with the error shown near the problem. **Applied in M1:** the sign-in form's error is plain and actionable ("That email and password don't match." on a 401, "Too many attempts. Wait a minute and try again." on a 429), announced through an `aria-live="polite"` region linked to the password field by `aria-describedby`.

## Live regions

Query: `"aria-live region real-time updates" --domain ux -n 5`

- **ARIA Labels** (Accessibility, All, High severity) — interactive elements need accessible names. Do: add `aria-label` for icon-only buttons. Don't: ship icon buttons without labels.

Only one result was returned (the query matched a single row in `ux-guidelines.csv`, not zero). No row specifically covers `aria-live` region politeness levels for live data — defaults used for that part. **Planned (M2/M3):** order-status changes on the kitchen display and the guest's order-tracking screen will use `aria-live="polite"` (per the Quick Reference `aria-live-errors` / `toast-accessibility` guidance bundled with the skill, which specifies `aria-live="polite"` for non-urgent async updates and toasts), and icon-only controls (e.g. a quantity stepper's plus/minus, the kitchen ticket's bump control) carry `aria-label` per the result above.

## Next.js

Query: `"app router forms" --stack nextjs -n 5`

- **Use App Router for new projects** (Routing, Medium severity) — App Router is the recommended approach in Next.js 14+. Do: `app/` directory with `page.tsx`. Don't: `pages/` for new projects.
- **Use Route Handlers for APIs** (API, Medium severity) — `app/api` routes for API endpoints. Do: `app/api/users/route.ts`. Don't: `pages/api` for new projects.
- **Use Server Actions for mutations** (DataFetching, Medium severity) — Server Actions for form submissions. Do: `action={serverAction}` in forms. Don't: an API route for every mutation.
- **Use file-based routing** (Routing, Medium severity) — create routes by adding files in the `app` directory. Do: `page.tsx` for routes, `layout.tsx` for layouts. Don't: manual route configuration.

Only four results were returned for this query (search asked for up to 5).

**Planned (M2/M5), with one deliberate departure from the guidance above:** order placement and admin menu-item mutations go through the `/api/*` rewrite to the Fastify API, not through Server Actions. ADR 0004 is the reason. The API owns every write and every session, and the browser reaches it on its own origin so the guest and staff cookies stay first-party. A Server Action runs on the Next.js server, which is a different origin from Fastify and holds no `tt_guest` cookie of its own: it would have to forward the caller's cookie by hand on every call, or the API would see an anonymous request. The App Router rule the search returned ("don't use an API route for every mutation") is aimed at hand-rolled Next.js route handlers; there are none here — the rewrite is a proxy to a service that already exists. Forms still use the App Router and `react-hook-form`; only the transport is different.

## shadcn

Query: `"form dialog accessible" --stack shadcn -n 5`

- **Use Form with react-hook-form** (Form, High severity) — integrate the `Form` component with `react-hook-form` for validation. Do: `useForm` + `Form` + `FormField` pattern. Don't: custom form handling without `Form`.
- **Use Dialog for modal content** (Dialog, High severity) — `Dialog` component for overlay modal windows. Do: `Dialog` for confirmations, forms, details. Don't: style an `Alert` as a modal.
- **Use Zod for validation** (Form, Medium severity) — define the form schema with Zod for type-safe validation. Do: `zodResolver` with a form schema. Don't: hand-rolled manual validation logic.
- **Combine with React Hook Form** (Patterns, High severity) — `Form` + `useForm` for complete forms. Do: RHF `Controller` with shadcn inputs. Don't: custom form state management (`useState` + manual `onChange`).
- **Display form messages** (Form, Medium severity) — use `FormMessage` for validation error display. Do: `FormMessage` after `FormControl`. Don't: custom error text without `FormMessage`.

**Planned (M2/M5):** admin forms (menu item edit, settings) and guest-surface dialogs (item detail, cart review) will use shadcn's `Dialog` + `Form`/`FormField`/`FormMessage` pattern with Zod schemas, keeping error display and announcement consistent with the States section above. None of it is built yet: the only form in M1 is the staff sign-in form, which is a plain `<form>` with a `role="status"` live region, and the only components in `packages/ui` are `button`, `badge`, `card`, `input` and `label`. Submission goes through the same `/api/*` rewrite described under Next.js above.
