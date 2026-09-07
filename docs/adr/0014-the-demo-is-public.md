# ADR 0014: The demo is public, and what that changed

Date: 2026-09-06
Status: accepted

## Context

For five milestones the demo ran on one laptop behind Docker Compose. M6 put it on a public address —
the web on Vercel, the API on Render, Postgres on Neon, three free tiers with no payment method (M6
spec §4.1) — and the address did most of the work of this decision by itself.

Three entries that had sat on [the backlog](../backlog.md) for milestones, each with a note saying it
only mattered on a deployed host, became defects the moment there was one:

- **Both containers ran as root.** The M1 review wrote it down as "scoped to the local demo; neither
  is acceptable on a deployed host".
- **Every browser shared one rate-limit bucket.** A browser sends no `x-forwarded-for` and the
  Next.js rewrite forwards only what it receives, so every visitor reached the API as the web tier
  and was counted as one caller. On a laptop that made the sign-in limit per deployment rather than
  per member of staff — an oddity. On a public demo it means one visitor can deny the demo to the
  next.
- **An unconfirmed upload is an orphan and nothing sweeps them.** The hourly reset deletes menu rows
  through a path that never touches storage, so in a deployed demo every photograph uploaded in an
  hour would be an unreferenced world-readable object at the end of it — on storage the owner pays
  for and is answerable for.

Two more things arrived with the tier rather than with the address. A free Render service stops after
a period without traffic, and the hourly demo reset is an in-process `setInterval`: a machine that is
asleep runs no timer, so a woken demo would show whatever the last visitor left behind. And the wait
to wake it is tens of seconds, which a stranger reads as a broken project unless something says
otherwise.

## Decision

**The demo resets on boot, not only on a timer.** `demoResetPlugin` runs the seed in `--reset` mode
from Fastify's `onReady` hook, so a machine waking from sleep serves a coherent demo rather than the
previous visitor's half-finished order. A failed boot reset is logged and the server still starts:
the failure mode of the alternative is nobody getting a demo at all, which is worse than getting a
stale one. Three early returns keep it out of the way of anything that is not a demo — demo mode off,
a non-positive interval, or `NODE_ENV=test` — and each of them is pinned by a test, because a future
change that reseeded a real deployment on every restart would pass every other test in the suite.

**One rate-limit bucket per visitor, and the web signs what it forwards.** Across two providers the
web's call to the API leaves one network and arrives at the other as ordinary internet traffic, so no
proxy-trust argument survives the move. `apps/web/middleware.ts` sends the visitor's address together
with an HMAC over it, keyed by `FORWARD_SECRET`, which both platforms hold; the API honours a
forwarded address only when that signature verifies and otherwise keys on the address of the
connection it actually received (M6 spec §4.4). Unset means verify nothing, never believe anyone. The
key is normalised through the rate-limit plugin's own `normalizeIP`, so two addresses in one IPv6 /64
are one visitor, as they are for every route that kept the default generator.

**Four routes take that key, and the sign-in route is not one of them.** `clientKey` is passed as
`keyGenerator` on `POST /api/guest/claim`, `GET /api/demo/links`, `POST /api/demo/rush` and
`POST /api/socket-token` — the routes no session reaches. Everything else that is limited keys on
`guestKey` or `staffKey`, both of which fall back to a bare `ip:${request.ip}` when there is no
cookie yet. `POST /api/auth/sign-in/email` (`apps/api/src/plugins/auth.ts`) is the one the Context
names by its symptom, and it was left alone: it declares ten a minute with no `keyGenerator` at all,
so it still keys on the plugin default. After the move that is not even per deployment — it is one
bucket per Cloudflare edge node, shared between strangers and re-rollable by retrying, which is the
consequence below read onto the route where it matters most. `clientKey` plus a test is the fix, and
it is on [the backlog](../backlog.md) rather than landed at a milestone's last gate.

**Photo upload is off in the deployed demo.** `DEMO_UPLOADS_ENABLED=false`, and the API enforces it:
both photo routes refuse with 403 before any storage call, proven with a storage fake whose every
method throws. The web only explains — the control stays visible and says why it is off, because a
disabled button is a courtesy to an honest visitor rather than a control. Upload is the one action a
visitor can take whose consequences the next database reset does not undo. Everything else on the
admin surface stays open: menu edits, tables, QR reissue, the dashboard and the printable sheet all
work, and the hourly reset takes them back.

Three smaller things went with it, and they are recorded here because they are part of the same
answer rather than separate decisions: both containers run as `node`; every secret is generated fresh
for the deployment, because the values in `.env.example` are local demo values published in this
repository; and `orders` finally has an index on `restaurant_id`, which every restaurant-scoped query
had been paying for.

## Consequences

- **A deploy resets the demo.** Reset-on-boot means every deploy reseeds, so whatever a visitor was
  in the middle of is gone. Correct for a demo that is meant to return to a known state, and it would
  be indefensible for a product.
- **The first _page_ after idle is slow, not the first press.** `apps/web/app/page.tsx` is
  `force-dynamic` and awaits `GET /api/demo/links` from the server, so a sleeping API blocks the
  render rather than the first action taken on it. Measured on the deployment on 2026-09-06: **34 s
  cold, 0.6 s warm**. This is stated in one line on the landing page and in the README, because an
  unexplained wait reads as a broken project while an explained one reads as a trade-off. A scheduled
  keep-alive ping was rejected: it games the tier it depends on, and it would stop the reset-on-boot
  from ever running.
- **The shared-store item now has a precise trigger: a second instance.** The rate limiter's store
  and Socket.io's adapter are both in-memory and therefore per process. One machine per app is what
  makes them correct today. The day a second instance exists they are wrong together — two API
  instances never see each other's rooms, and each limit becomes per instance — so the backlog entry
  is written against that trigger rather than against a milestone.
- **The deployed demo's admin surface is deliberately not the full product, and it says so.** The
  photo control is visible and disabled with its reason beside it. A visitor is not left guessing
  whether the feature is broken or absent, and a reader of this repository can see that the local
  stack has the whole thing.
- **The fallback rate-limit key is weaker than the signed one, wherever the fallback is reached.**
  Render fronts services with Cloudflare, whose edge addresses are public and therefore outside
  `TRUST_PROXY`, so `proxy-addr` discards the forwarded chain and keys on the edge node — which
  differs from request to request. **Signed** traffic through the web's rewrite is unaffected,
  because the signature decides the key and no proxy is trusted for it — and signed means the four
  `clientKey` routes named above. Everywhere else the no-cookie fallback is a bare
  `ip:${request.ip}`, which is neither the signed address nor `normalizeIP`, so a first-time
  visitor's request through the rewrite lands on the drifting edge key exactly as a direct caller's
  does. What degrades is one bucket per edge node rather than one per caller. It is on the backlog
  with its trigger, and the fix is a header the platform documents as trustworthy rather than a
  hand-maintained list of Cloudflare ranges.
- **One leg is not covered by the signature.** The middleware signs whatever inbound
  `x-forwarded-for` it reads, so the visitor-to-web hop still rests on the web's platform overwriting
  or appending that header rather than relaying a value a client supplied. That assumption is
  inherited rather than introduced here, it cannot be tested off the platform, and it has its own
  post-deploy check in [the runbook](../deploy.md) for exactly that reason.
