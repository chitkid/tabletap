# M6 Polish + Portfolio — Design Spec

Date: 2026-09-05. Status: approved by the owner on 2026-09-05; implementation plan pending.
Project: TableTap — QR table ordering with a real-time kitchen display (portfolio full-stack project).
Milestone: M6 of six, and the last. Builds on M1 Foundation, M2 Guest flow + demo landing, M3 Kitchen display, M4 Payments and M5 Admin (all merged into `main`). The master brief remains the permanent context; this spec covers M6 only.

## 1. Goal and scope

M6 turns a repository into something a stranger can open. It puts the demo on a public address, gives the product a face, adds motion where motion earns its keep, and writes down what was built and why.

In scope:

- **Deployment.** The web on Vercel, the API on Render from the Dockerfile this repository already builds, Postgres on Neon — three free tiers, no payment method, no object storage — and a deploy workflow that runs after CI is green.
- **The hardening a public address forces.** A rate-limit bucket per visitor rather than one for everybody; a demo reset that survives a sleeping machine; containers that do not run as root; an index this project has been missing; photo upload disabled in the deployed demo.
- **Identity.** A TableTap mark, a favicon set, an Open Graph image, and the Little Furnace SVG wordmark the M1 brand guidelines promised for this milestone.
- **Motion**, at the level the owner chose: state changes plus one entrance, and nothing on a path where a person is waiting.
- **A case study**, and keeping the Lighthouse gate that already runs in CI green through the motion work.

Out of scope, with the reason each stays out:

- **A shared store (Redis) for rate limits and Socket.io rooms.** Both matter only from the second instance onward, and this deployment runs one machine per app. Recorded, with the trigger that would change it.
- **Object storage entirely.** Upload is disabled in the deployed demo, the seed sets no image, and the API treats unset `S3_*` as a supported state, so there is no bucket to sweep and none to create.
- **Refunds, secret rotation, the waiter surface, multi-restaurant, a custom domain.** All already on the backlog; none is what this milestone is for.

## 2. Decisions from brainstorming

| Question | Decision |
|---|---|
| Deploy at all? | Yes, live (owner, 2026-09-05). A portfolio project's whole argument is a link someone can open. |
| Where | **Vercel for the web, Render for the API, Neon for Postgres — all free tiers, no payment method** (owner, 2026-09-05, replacing an earlier Fly.io decision). Render runs `Dockerfile.api` unchanged and keeps a process alive, which Socket.io and the hourly reset both need; Vercel does not sleep, so the landing is instant; Neon's free database does not expire, where Render's own historically has. No object storage at all: uploads are off, the seed sets no image, and every `S3_*` variable is optional. Rejected: Fly.io (not free); one platform for everything (the web would sleep too, so a visitor waits half a minute for the first page and concludes the project is broken). |
| What a visitor may do | **Everything except uploading a file.** Menu, tables, QR reissue, dashboard and the printable sheet all work and the hourly reset undoes them. Upload is the one action whose consequences a database reset does not undo, on storage the owner pays for and is answerable for. The control stays visible and says why it is off. |
| The free tier's cold start | **Say so, in one line on the landing and in the README** (owner, 2026-09-05). Rejected: a scheduled keep-alive ping (it games the tier it depends on, and it would stop the reset-on-boot from ever running); saying nothing (a thirty-second wait with no explanation reads as a broken project). |
| The mark | **An open ring with an ember dot** — a tabletop seen from above, and the tap. Chosen over a wordmark alone (no face for the product) and over a QR finder pattern (legible, but a borrowed form every QR product wears). The circle is already this product's language: every dish plate is drawn as one. |
| Motion | **State changes plus a first-paint entrance.** Rejected: state changes alone (the landing is the first thing a stranger sees and it deserves an entrance); route transitions as well (the only option that adds delay to something a person is waiting for, and the most fragile thing to build on the App Router). |
| Scope of hardening | Only what going public forces. A shared store and an orphan sweep are documented rather than built. |

## 3. The mark, and what it is not

**The mark.** An open ring — a tabletop from above, its gap at the lower right — with a solid ember dot at the centre. It is drawn as one SVG component in the design system, coloured with tokens and containing no hex, so it stays inside the `validate-tokens` rule (ADR 0005). It reads at 16 px, which is what a favicon has to survive.

It is TableTap's mark, not Little Furnace's. The brand guidelines already forbid putting the product name and the restaurant's wordmark in one lockup: the guest surface wears the restaurant, the kitchen and admin wear TableTap chrome. The mark therefore appears in the kitchen and admin chrome, the favicon, the README and the Open Graph image, and **never inside the guest surface's own content**. The browser tab and the link preview are the product's chrome rather than the restaurant's room, so the favicon is the product's mark on every page, guest pages included; what the guest surface must not carry is the mark next to, or instead of, the Little Furnace wordmark.

**Little Furnace's debt from M1.** `docs/brand-guidelines.md` §3 says the SVG logo arrives in M6, and the same section is emphatic about what it may be: the words "Little Furnace" in Bricolage Grotesque 700, tracking `-0.02em`, and nothing else — "don't add a flame, a furnace, a chef hat or any other picture beside it". So this milestone owes an SVG **file of the existing wordmark** in its four approved colour pairings, not a new drawing. The guidelines' Logo Usage section is updated to say the file now exists.

**The Open Graph image** is built from the same SVG source, so the mark cannot drift between the tab and the link preview. The image generator needs an embeddable font file, and this project has met that problem before: in M5 the QR sheet fell back to Helvetica because the brand font package ships no TTF. The rule is the same and it is not negotiable — if the display face cannot be embedded, ship a pre-rendered PNG and record it in the backlog. **Substituting a different typeface is not an option.**

## 4. Deployment

### 4.1 Topology

Three services, all on free tiers, and the owner adds no payment method:

| Piece | Where | Why |
|---|---|---|
| Web | **Vercel**, Hobby | Next.js's own platform. It does not sleep, so the landing — the first thing a stranger opens — is instant. |
| API | **Render**, free web service, built from `Dockerfile.api` | Runs the image this repository already builds, so no code moves to suit a host. It keeps a process alive, which Socket.io and the hourly reset both need and no serverless runtime offers. |
| Postgres | **Neon**, free | Render's own free Postgres has historically expired after a fixed period, which would kill the demo silently months later. Neon's free database does not. |

**No object storage.** The deployed demo refuses uploads (§2), the seed sets no `image_url` at all — every dish draws its own plate — and every `S3_*` variable is optional, with `storageConfigured` simply false when they are unset. Adding a bucket would be adding a service to hold nothing.

**Free tiers change, and this document cannot verify them.** The runbook tells the owner to confirm each service's current terms before relying on them, and says what to do if one has changed.

### 4.2 The API sleeps, and the site says so

A free Render service stops after a period without traffic and takes tens of seconds to answer the request that wakes it — not the second or two a paid instance takes. That is the price of the tier and the owner accepted it deliberately.

Two things follow. The reset-on-boot behaviour is what keeps a woken demo coherent rather than showing whatever the last visitor left. And the delay is **stated on the landing page and in the README** in one plain line, because an unexplained thirty-second wait reads as a broken project, while an explained one reads as a considered trade-off.

The web does not sleep, so the wait falls on the first *interaction*, never on the first *impression*.

### 4.3 Two origins, and why cookies still work

`apps/web/lib/socket.ts` connects the browser to `NEXT_PUBLIC_API_ORIGIN` directly, while every other browser request goes through the `/api/:path*` rewrite in `apps/web/next.config.ts`. That split decides the address layout:

- `API_URL` — the API's public address. Server components and the rewrite use it. The browser still only ever sees a same-origin `/api/...`, so cookies keep working with no `SameSite` change and no CORS in the browser's path.
- `NEXT_PUBLIC_API_ORIGIN` — the same public address, used by the WebSocket alone. Cross-origin is safe there because the socket authenticates with the 60-second `tt-socket` token fetched over the same-origin rewrite, never with a cookie.
- `WEB_ORIGIN` — the web app's public address, which is what the API's CORS allows.
- Every `NEXT_PUBLIC_*` value is inlined at build time, so all of them are Vercel **build-time environment variables**, never runtime-only ones.

### 4.4 One bucket per visitor, across two providers

The web and the API now live on different platforms, and that breaks the argument the previous design rested on. That argument was that every hop between the visitor and the API sat inside a private range the API could trust, so the forwarded chain could be walked back to the visitor. Across providers the web's call to the API leaves one network and arrives as ordinary internet traffic from an ordinary public address. Trusting it would let anyone forge a visitor address; not trusting it collapses every visitor onto one bucket.

**So the web signs what it forwards.** `apps/web/middleware.ts` sends the visitor's address together with a short signature over it, keyed by a secret shared with the API. The API honours a forwarded address only when that signature verifies, and otherwise keys on the address of the connection it actually received.

This is stronger than what it replaces, not merely different. It depends on no platform's proxy behaviour, so it survives this move and the next one; it closes the local-Compose spoofability the previous design had to leave open; and a caller reaching the public API directly cannot mint buckets, because it cannot produce the signature.

`TRUST_PROXY` stays configured for the platform's own proxy so that `request.ip` is right for everything else.

### 4.5 Secrets and configuration

Every secret is set through the platform's own secret store and none is baked into an image. `BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `TABLE_TOKEN_SECRET`, `SOCKET_TOKEN_SECRET`, `DEMO_PASSWORD` and the new forwarding secret are generated fresh for the deployment — **the values in `.env.example` are local demo values and are published in this repository.** `DEMO_UPLOADS_ENABLED` is `false`. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stay unset, so the payment provider resolves to `demo`.

`DEMO_PASSWORD` deserves its own line: it has a default equal to the published value, so forgetting it does not fail the boot — it ships a working public demo whose staff password is in the repository.

### 4.6 The deploy workflow

Both platforms deploy from GitHub on a push to `main`, gated on CI passing. **The order is API first, then web**, and it is not a preference: `OrderDtoSchema` requires fields older API builds do not send, so a newer web against an older API fails to parse every order response — the menu renders and nothing past it works. The reverse order is safe.

Each stage ends with a smoke check that retries, because the API's entrypoint runs migrations and the seed before it listens.

## 5. Motion

Five places, and no others:

1. A ticket arriving on the kitchen board.
2. A ticket moving between columns.
3. The status timeline advancing on the guest's order screen.
4. The admin edit panel opening. The row itself keeps its height — that is M5's decision and it stands.
5. A staggered entrance for the cards on the landing and the menu, on first paint only.

Three rules make it safe:

- **Only `opacity` and `transform`.** They are the two properties a browser can composite without recalculating layout, which is what keeps cumulative layout shift at zero and the Lighthouse gate green.
- **`prefers-reduced-motion: reduce` collapses every one of them** to an instant substitution. Not "shorter" — off.
- **Nothing on a path where a person is waiting.** The payment-to-kitchen route measured 34 ms against a 500 ms budget in M5; it gains no animation, and neither does anything between a press and the answer to it.

Durations and easing curves become design tokens, so motion falls under the same `validate-tokens` rule as colour, and a stray hard-coded `300ms` fails the gate the way a stray hex does.

## 6. Security

The public deployment changes the threat model, and three things answer it. Photo upload is off, so no anonymous visitor can put a file on storage the owner is answerable for. The rate limiter counts visitors individually, so one person cannot deny the demo to the next. Secrets are generated fresh for the deployment and set out of band, so the local demo's published values grant nothing.

Everything M1–M5 established stays: RBAC on every route, a signed table token verified server-side, prices read from the database, the presigned upload's key and content type fixed by the server. Containers stop running as root, which was on the backlog from M1 marked "not acceptable on a deployed host" — and now there is one.

## 7. Testing

Unit: the rate-limit key derivation for a forwarded address; the reset-on-boot decision; the mark component rendering at its documented sizes; motion tokens resolving, and every animation collapsing under `prefers-reduced-motion`.

Lighthouse already runs in CI against the Compose stack and already gates accessibility at 95 across all six audited pages, which currently measure 100 - the M5 fix wave put it there. M6 adds no Lighthouse machinery. What M6 owes is that the motion work does not lower those numbers, and in particular that cumulative layout shift stays at zero: the entrance animation on the landing and the menu is the one change in this milestone that could move it, which is why §5 confines every animation to `opacity` and `transform`. The deployed site is audited once by hand after the first deploy and its numbers go into the case study, because a shared CI runner's figures and a real host's are not the same claim.

Deployment is verified on the live stack, not simulated: the smoke checks; the two-bucket proof of §4.4, taken from two genuinely different clients through the web app's own `/api/*` rewrite, which is the path every visitor uses; a forged forwarding signature refused; a reset observed after the API wakes from sleep; and a WebSocket connection from a browser to the public API origin. Every check states what a **correct** deployment returns, because a check that reports a healthy deployment as broken is worse than no check — the reader cannot tell it from a real failure.

## 8. Documents

`docs/case-study.md` — the long form, for a reader deciding whether the engineer is any good. The measured payment-to-kitchen path; how a QR code is revoked without breaking sessions in progress; the boundary around presigned uploads and the traversal it closes; and the optimistic-concurrency bug that only failed on real Postgres because the test engine's clock was coarser and hid it. With an honest account of the review process and what it caught.

`README.md` keeps its job as operating instructions and gains a short opening: what this is, the live link, a strip of screenshots, and a pointer to the case study.

ADR 0014 "The demo is public, and what that changed" — context: a live address turns three backlog notes into defects. Decision: reset on boot, a bucket per visitor, upload disabled in the deployed demo. Consequences: a deploy resets the demo; the first request after idle is slow; and the shared-store item now has a precise trigger, namely a second instance.

`docs/brand-guidelines.md` §3 is updated: the wordmark SVG exists, and the TableTap mark is defined with its own usage rules.

`docs/backlog.md` gains what M6 defers and loses what it closes.
