# M6 Polish + Portfolio — Design Spec

Date: 2026-09-05. Status: approved by the owner on 2026-09-05; implementation plan pending.
Project: TableTap — QR table ordering with a real-time kitchen display (portfolio full-stack project).
Milestone: M6 of six, and the last. Builds on M1 Foundation, M2 Guest flow + demo landing, M3 Kitchen display, M4 Payments and M5 Admin (all merged into `main`). The master brief remains the permanent context; this spec covers M6 only.

## 1. Goal and scope

M6 turns a repository into something a stranger can open. It puts the demo on a public address, gives the product a face, adds motion where motion earns its keep, and writes down what was built and why.

In scope:

- **Deployment.** Two Fly.io apps built from the Dockerfiles the repository already has, a managed Postgres, a Tigris bucket for object storage, and a deploy workflow that runs after CI is green.
- **The hardening a public address forces.** A rate-limit bucket per visitor rather than one for everybody; a demo reset that survives a sleeping machine; containers that do not run as root; an index this project has been missing; photo upload disabled in the deployed demo.
- **Identity.** A TableTap mark, a favicon set, an Open Graph image, and the Little Furnace SVG wordmark the M1 brand guidelines promised for this milestone.
- **Motion**, at the level the owner chose: state changes plus one entrance, and nothing on a path where a person is waiting.
- **Lighthouse in CI** as a gate rather than a local ritual, and a case study.

Out of scope, with the reason each stays out:

- **A shared store (Redis) for rate limits and Socket.io rooms.** Both matter only from the second instance onward, and this deployment runs one machine per app. Recorded, with the trigger that would change it.
- **A sweep for orphaned objects.** Upload is disabled in the deployed demo, so nothing new reaches the bucket.
- **Refunds, secret rotation, the waiter surface, multi-restaurant, a custom domain.** All already on the backlog; none is what this milestone is for.

## 2. Decisions from brainstorming

| Question | Decision |
|---|---|
| Deploy at all? | Yes, live (owner, 2026-09-05). A portfolio project's whole argument is a link someone can open. |
| Where | **Fly.io for everything.** It runs the existing Dockerfiles unchanged, and Postgres and S3-compatible storage (Tigris) live on the same account. Rejected: Railway (no first-party object storage — a second account and a second set of keys); Render (its free tier sleeps in a way that reads as broken); a Vercel split (the API needs a long-lived process for Socket.io and the hourly reset, so serverless cannot host it). |
| What a visitor may do | **Everything except uploading a file.** Menu, tables, QR reissue, dashboard and the printable sheet all work and the hourly reset undoes them. Upload is the one action whose consequences a database reset does not undo, on storage the owner pays for and is answerable for. The control stays visible and says why it is off. |
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

Two Fly apps in one region (`fra`), each from the Dockerfile already in the repository:

| App | Built from | Public | Why |
|---|---|---|---|
| `tabletap-api` | `Dockerfile.api` | yes | The browser opens the Socket.io connection straight to it |
| `tabletap-web` | `Dockerfile.web` | yes | The site itself |

Managed Postgres attached to the API. A Tigris bucket created with `fly storage create`, whose credentials map onto the `S3_*` variables the code already reads — the same interface MinIO serves locally, which is the point ADR 0012 made when it chose the AWS SDK.

Both apps stop when idle and start on demand. The first request after a quiet spell is therefore slower; that is the cost the owner accepted for a demo nobody is paying to keep warm, and §4.4 makes it safe.

### 4.2 Two origins, and why cookies still work

`apps/web/lib/socket.ts` connects the browser to `NEXT_PUBLIC_API_ORIGIN` directly, while every other browser request goes through the `/api/:path*` rewrite in `apps/web/next.config.ts`. That split decides the whole address layout:

- `API_URL` — the API's **internal** Fly address. Server components and the rewrite both use it, so ordinary HTTP never leaves the private network and the browser only ever sees a same-origin `/api/...`. Cookies keep working with no change to `SameSite` and no CORS in the browser's path.
- `NEXT_PUBLIC_API_ORIGIN` — the API's **public** address, used by the WebSocket alone. Cross-origin is safe here precisely because the socket authenticates with the 60-second `tt-socket` token fetched over the same-origin rewrite, never with a cookie. This matters: `fly.dev` is on the Public Suffix List, so two Fly subdomains are cross-site and a cookie would not have travelled between them anyway.
- `WEB_ORIGIN` — the web app's public address, which is what the API's CORS allows.

### 4.3 Secrets and configuration

Every secret is set with `fly secrets set` and none is baked into an image. `BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `TABLE_TOKEN_SECRET`, `SOCKET_TOKEN_SECRET` and `DEMO_PASSWORD` are generated fresh for the deployment — the values in `.env.example` are local-demo values and must never reach a public host. `DATABASE_URL` comes from the Postgres attachment, and the `S3_*` group (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE`) from the Tigris one. `NEXT_PUBLIC_APP_URL` is set to the web app's public address, because a link preview needs absolute URLs. `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stay unset, so the payment provider resolves to `demo` exactly as it does locally.

`TRUST_PROXY` is set for Fly's proxy — see §4.5, where it is measured rather than assumed.

The owner performs every step that requires signing in or attaching a payment method. The milestone delivers a runbook precise enough to follow without improvisation; it does not deliver an agent that logs in on the owner's behalf.

### 4.4 The demo reset must survive a sleeping machine

The hourly reset runs on a timer inside the API process. A machine that sleeps runs no timer, so a demo left in a mess stays in a mess until someone happens to visit — and the visitor who wakes it is exactly the person who sees the mess.

**The API resets on boot whenever `DEMO_MODE` is on**, and then schedules the interval as it does today. The reset is idempotent and boots are rare, so the cost is a moment of work on wake. Deploys reset the demo too, which for a demo is correct rather than unfortunate.

### 4.5 One bucket per visitor, proved rather than assumed

`@fastify/rate-limit` keys on `req.ip`. A browser sends no `x-forwarded-for` of its own, and `docs/backlog.md` already records the consequence: through the Next rewrite every browser reaches the API as the web container, so **all visitors share one bucket**. On a public link that is a defect, not a note — one person exploring the demo can exhaust the sign-in limit for everyone else.

Fly's proxy sets forwarded-address headers on the request entering the web container, so the rewrite may carry the visitor's address through on its own. That is a hypothesis. **The task is not complete until two different clients are observed landing in two different buckets on the deployed stack**, and the evidence is written into the report. If the rewrite does not carry it, the fallback is to forward Fly's own client-address header explicitly. `TRUST_PROXY` is configured to match whatever is actually proved.

### 4.6 The deploy workflow

`.github/workflows/deploy.yml`, triggered by `workflow_run` on the CI workflow completing for `main` and running only when its conclusion is `success`, so a red build cannot deploy. It needs a `FLY_API_TOKEN` repository secret, which the owner adds.

**The order is API first, then web, and it is not a preference.** `docs/backlog.md` records why: `OrderDtoSchema` requires fields that older API builds do not send, so a newer web against an older API fails to parse every order response — the menu still renders and nothing past it works. The reverse order is safe, because an older web ignores fields it does not know.

Each stage ends with a smoke check — `/health` on the API, the landing on the web. A failed smoke check fails the workflow.

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

Lighthouse moves into CI against the Compose stack and gates accessibility at 95 across all six audited pages, which currently measure 100. Performance is reported, not gated: a shared runner's numbers are not stable enough to fail a build on.

Deployment is verified on the live stack, not simulated: the smoke checks, the two-bucket rate-limit proof of §4.5, a reset observed after a machine wakes, and a WebSocket connection from a browser to the public API origin.

## 8. Documents

`docs/case-study.md` — the long form, for a reader deciding whether the engineer is any good. The measured payment-to-kitchen path; how a QR code is revoked without breaking sessions in progress; the boundary around presigned uploads and the traversal it closes; and the optimistic-concurrency bug that only failed on real Postgres because the test engine's clock was coarser and hid it. With an honest account of the review process and what it caught.

`README.md` keeps its job as operating instructions and gains a short opening: what this is, the live link, a strip of screenshots, and a pointer to the case study.

ADR 0014 "The demo is public, and what that changed" — context: a live address turns three backlog notes into defects. Decision: reset on boot, a bucket per visitor, upload disabled in the deployed demo. Consequences: a deploy resets the demo; the first request after idle is slow; and the shared-store item now has a precise trigger, namely a second instance.

`docs/brand-guidelines.md` §3 is updated: the wordmark SVG exists, and the TableTap mark is defined with its own usage rules.

`docs/backlog.md` gains what M6 defers and loses what it closes.
