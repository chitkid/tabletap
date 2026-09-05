# Deploying TableTap

This is a runbook, not a description — follow it top to bottom on the first deploy. Every step
that needs a Fly account, a payment method or a password is marked **(owner)**; nothing in this
repository, and no automation described here, attempts to sign in or create an account on your
behalf. `.github/workflows/deploy.yml` only redeploys an app that already exists, with secrets
that already exist — it is not how the two apps come into being the first time.

Two Fly apps, one region (`fra`), each stopped when idle and started on the next request — spec
section 4.1 of `docs/superpowers/specs/2026-09-05-m6-polish-portfolio-design.md` is the design
record this runbook implements; read it first if a step here seems to need a reason.

**No value from `.env.example` may reach a public host.** Every value in that file is a local demo
default, published in this repository's own history — anyone who has cloned it already has them.
Five must be generated fresh for the deployment and set with `fly secrets set`, never copied:
`BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `TABLE_TOKEN_SECRET`, `SOCKET_TOKEN_SECRET`,
`DEMO_PASSWORD`.

## 0. Before you start

- A Fly.io account with a payment method on file **(owner)** — Fly requires a card even for usage
  that stays inside the free allowance, and only the owner may add one (see the permission rules
  this assistant works under).
- `flyctl` installed and you signed in **(owner)**:

  ```sh
  # macOS/Linux
  curl -L https://fly.io/install.sh | sh
  # or: brew install flyctl

  fly auth login
  ```

- A GitHub repository with write access, for the `FLY_API_TOKEN` secret in step 7.

## 1. Create the two apps

`fly.api.toml` and `fly.web.toml` already exist in the repository root, with the app names
`tabletap-api` and `tabletap-web`, region `fra`, and every non-secret setting this deployment
needs. `fly launch` with `--copy-config --yes` uses that file as-is instead of generating a new
one and prompting for every setting again:

```sh
fly launch --config fly.api.toml --copy-config --yes --no-deploy
fly launch --config fly.web.toml --copy-config --yes --no-deploy
```

`--no-deploy` matters: neither app has its secrets set yet (steps 3–5), so a deploy attempted now
would only build a machine that crashes on boot for want of `DATABASE_URL` or
`BETTER_AUTH_SECRET`. If `fly launch` offers to provision a Postgres or Redis database at this
point, decline — Managed Postgres is its own step below, with its own region and plan choice.

**If either app name is taken** (Fly app names are global, not per-account), `fly launch` will ask
for another one. Pick `tabletap-api-<something>` / `tabletap-web-<something>`, then before
continuing:

1. Update `app = '...'` at the top of that file.
2. Update every literal that names the renamed app or its `.fly.dev` address, **repository-wide**
   — the two `fly.*.toml` files cross-reference each other's public address, but so do
   `.github/workflows/deploy.yml` (the smoke-check URLs) and this file (the first-deploy and
   post-deploy-check URLs). Grepping only the two toml files misses both of those and leaves an
   automated deploy's own smoke check curling a host that no longer exists:

   ```sh
   grep -rn 'tabletap-api\|tabletap-web' --include='*.toml' --include='*.yml' --include='*.md' .
   ```

   Update every hit, not only the ones inside the two toml files.

3. Commit the rename before deploying, so the workflow and this runbook stay in sync with reality.

## 2. Allocate the API's private address

**Required for every deploy, not only a renamed one** — this is its own step rather than a note
inside step 1 precisely so a reader whose app names were free does not skim past it. `fly.web.toml`'s
`API_URL` build argument points at `tabletap-api.flycast`, which does not resolve, and never will,
until this exists:

```sh
fly ips allocate-v6 --private --app tabletap-api
```

See the long comment on `API_URL` in `fly.web.toml` for why this is a `.flycast` address rather
than the more obvious-looking `tabletap-api.internal`, why it is `http://`, not `https://`, and why
it carries no `:4000` — all three were checked against Fly's own private-networking and Flycast
documentation rather than assumed, and the first version of this file got the port and the scheme
wrong before that check happened.

## 3. Managed Postgres

Spec section 4.1 calls for **Managed Postgres (MPG)**, Fly's current database product — not
`fly postgres create`, which provisions the older, unmanaged Postgres cluster (still supported,
but not the one the spec chose, and not the one with Fly-managed backups and failover). flyctl's
command surface for this has moved more than once; confirm the current one before running
anything:

```sh
fly mpg --help
```

Use whatever that prints to create a cluster (region `fra`) and attach it to `tabletap-api` — the
attach step is what sets `DATABASE_URL` as a secret on the app; there is nothing to copy by hand
regardless of which exact subcommand your `flyctl` version uses to get there.

The API's own entrypoint (`apps/api/docker-entrypoint.sh`) runs migrations unconditionally and
then runs `node dist/seed.js --if-empty` on every boot — the `--if-empty` matters: it seeds the
demo menu and staff accounts once, the first time the database is genuinely empty, and does
nothing on every boot after that. (A different mechanism, the API's own demo-reset plugin, _does_
reseed unconditionally on every boot when `DEMO_MODE` is on — that one is spec section 4.4's
concern, not this migration step's.) Either way, the schema and the seeded menu exist as soon as
the first deploy's machine comes up; there is no separate migration step in this runbook.

## 4. Object storage (Tigris)

```sh
fly storage create --name tabletap-storage --app tabletap-api --public
```

**Capture the output before you do anything else.** `fly storage create` prints a bucket name, an
access key id, a secret access key and the Tigris S3 endpoint once, and only once —
`fly secrets list` afterward shows names and hashes, never values, so a lost secret access key
means creating a new bucket, not looking one up. It also sets three or four of these directly as
secrets on `tabletap-api` under its own names (`AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `BUCKET_NAME`) — the API does not read those; it reads the seven `S3_*`
variables ADR 0012 defines, the same interface MinIO serves locally. Map the printed values onto
them explicitly:

```sh
fly secrets set --app tabletap-api \
  S3_ENDPOINT=https://fly.storage.tigris.dev \
  S3_REGION=auto \
  S3_BUCKET=<bucket name from the command above> \
  S3_ACCESS_KEY_ID=<access key id from the command above> \
  S3_SECRET_ACCESS_KEY=<secret access key from the command above> \
  S3_PUBLIC_URL=https://<bucket name>.t3.tigrisfiles.io \
  S3_FORCE_PATH_STYLE=false
```

`S3_ENDPOINT` is the value `fly storage create` itself printed as `AWS_ENDPOINT_URL_S3` — copy
that one rather than retyping it, in case a newer Tigris/flyctl version has moved it to `t3.storage.dev`
(the endpoint Tigris now documents as canonical for new code) by the time you run this.
`S3_PUBLIC_URL` uses the `.t3.tigrisfiles.io` public-content domain, which only serves objects
from a bucket created `--public` as above — the `--public` flag makes the **whole bucket**
publicly readable, coarser than ADR 0012's original MinIO setup, which opens only the `menu/`
prefix and nothing else. Today that gap costs nothing: `DEMO_UPLOADS_ENABLED=false` means the API
refuses every upload before it ever reaches storage, so the bucket stays empty for as long as this
deployment runs with uploads off. **If uploads are ever re-enabled**, revisit this — a
bucket-wide-public Tigris bucket is a real change in what ADR 0012 promised, not a detail.

`S3_PRESIGN_ENDPOINT` stays unset: that variable exists only for the local MinIO setup, where the
API and the browser reach the same store on two different hostnames (`minio:9000` vs.
`localhost:9000`) and a signature has to pick one. Tigris is one endpoint for both the API's own
calls and any presigned URL, so the split does not apply — set it and every presigned upload URL
fails to verify.

## 5. The five secrets you must generate fresh

**(owner)** Generate each with the API's own recommended command — the same one `.env.example`
documents — and set them together. Do not reuse the `.env.example` values; they are public.

```sh
BETTER_AUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
COOKIE_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TABLE_TOKEN_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SOCKET_TOKEN_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
DEMO_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")

fly secrets set --app tabletap-api \
  BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  COOKIE_SECRET="$COOKIE_SECRET" \
  TABLE_TOKEN_SECRET="$TABLE_TOKEN_SECRET" \
  SOCKET_TOKEN_SECRET="$SOCKET_TOKEN_SECRET" \
  DEMO_PASSWORD="$DEMO_PASSWORD"
```

Each of `BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `TABLE_TOKEN_SECRET` and `SOCKET_TOKEN_SECRET` must
be at least 32 characters (`apps/api/src/config.ts` refuses a shorter one at boot); the command
above produces 64 hex characters. `DEMO_PASSWORD` needs only 8; write it down somewhere you can
read it back — it is what the three seeded staff accounts (`admin`, `kitchen` and `waiter`,
`packages/db/src/seed/data.ts`) sign in with on the deployed demo. Writing it down is still worth
doing even though it is not, strictly, the only record of it: `GET /api/demo/links`
(`apps/api/src/routes/demo.ts`) returns it in plain text for every seeded account whenever
`DEMO_MODE` is on, and the landing page's one-click staff sign-in links read it from exactly that
endpoint to prefill the login form (`apps/web/app/login/page.tsx`). That is by design — the demo
is meant to be explored without an account — but it means the value is only ever a page load away
regardless of whether you keep your own copy; keep one anyway, since debugging a boot failure
before the app is even serving that endpoint is easier with the value in hand. `TABLE_TOKEN_SECRET`
and `SOCKET_TOKEN_SECRET` must differ from each other — generating both independently, as above,
already guarantees that.

**Do not set `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`.** Left unset, `config.ts` resolves
the payment provider to `demo` — the in-app terminal, no card and no real money — exactly as the
local Compose stack runs it. This is a deliberate portfolio choice (spec section 4.3), not a step
left unfinished; setting either turns on live Stripe Checkout, which is out of scope for this
runbook.

Everything else the API needs — `WEB_ORIGIN`, `BETTER_AUTH_URL`, `DEMO_MODE`,
`DEMO_UPLOADS_ENABLED`, `TRUST_PROXY` — is already in `fly.api.toml`'s `[env]` block and needs no
manual step; it travelled with the app in step 1. The same is true of the web app's
`NEXT_PUBLIC_*` build arguments in `fly.web.toml` — see the comments in both files for why each
one lives where it does.

## 6. Verify the secrets before the first deploy

Nothing in the steps above detects a half-success — an `attach` that quietly errored, a
`fly secrets set` that ran against the wrong `--app`. Left undetected, the first symptom is a
machine crash-looping at `loadConfig`'s startup validation, with no earlier step in this runbook
telling you to go look. Check the exact required set now, before spending time on the workflow
token or the first deploy:

```sh
fly secrets list --app tabletap-api
```

Two different things are worth checking here, for two different reasons — confirm both, not only
the one that would crash the machine.

**Boot-blocking, if missing.** `apps/api/src/config.ts`'s `EnvSchema` has exactly five fields with
no `.default(...)` that are not already covered by `fly.api.toml`'s `[env]` block: `DATABASE_URL`
(step 3's attach), `BETTER_AUTH_SECRET`, `COOKIE_SECRET`, `TABLE_TOKEN_SECRET` and
`SOCKET_TOKEN_SECRET` (step 5's fresh values). Confirm all five are listed. (`WEB_ORIGIN` and
`BETTER_AUTH_URL` are also required with no default, but they will not appear in this list — they
live in `fly.api.toml`'s `[env]` block, not as secrets, so their presence was already guaranteed
the moment step 1's `fly launch` picked up that file.)

**Security-blocking, if missing, even though the app boots fine.** `DEMO_PASSWORD` has a default —
`tabletap-demo`, the exact value published in `.env.example` — so a `fly secrets set` in step 5
that silently ran against the wrong `--app` produces a perfectly healthy-looking deployment whose
staff password is the one in this repository, which is precisely what this runbook's opening
warning forbids. Confirm `DEMO_PASSWORD` is listed too; its _absence_ here is the failure this
check exists to catch for it, not a crash.

The four `S3_*` secrets from step 4 (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY`) are worth a glance for completeness, but do not belong in either list
above: they are `optionalNonEmpty` in `apps/api/src/config.ts`, and the app boots fine without any
of them — `storageConfigured` is simply `false` and the two photo-upload routes answer `503`
instead of crash-looping. Missing here is a silently-disabled feature, not a boot failure.

If either of the two required lists is short one name, add it now rather than finding out from a
crash-looping machine (or, for `DEMO_PASSWORD`, from a stranger signing in with it). If the first
deploy in step 8 does crash-loop anyway, `fly status --app tabletap-api` shows the machine state
and `fly logs --app tabletap-api` shows why — `loadConfig`'s own error message names every missing
or invalid variable by name.

## 7. `FLY_API_TOKEN` for the deploy workflow

**(owner)**

```sh
fly tokens create deploy --app tabletap-api --name github-actions
```

(A single deploy token scoped to `tabletap-api` is enough only if it can also deploy
`tabletap-web`; if your `flyctl` version scopes tokens to one app, create a second token for
`tabletap-web` and combine them, or create an organization-wide token with `fly tokens create org`
instead.) Add the result as a repository secret named `FLY_API_TOKEN`: GitHub repository → Settings
→ Secrets and variables → Actions → New repository secret. `.github/workflows/deploy.yml` reads it
under that exact name and nothing else in this repository does.

## 8. First deploy — API before web, by hand

`.github/workflows/deploy.yml` handles every deploy after this one, automatically, in this same
order, and refuses to run at all against a red build. The very first deploy is manual because
nothing is running yet for the workflow's smoke checks to find. Both toml files deploy with
`--strategy immediate` in the workflow; matching that here means the health checks in both files
are not what gates this step either — the explicit `curl` after each `fly deploy` is, and it needs
the same retry the workflow gives it: `fly deploy` with `--strategy immediate` returns as soon as
the machine starts, without waiting on the health check, while `docker-entrypoint.sh` still has to
run migrations and `seed.js --if-empty` before the API is even listening. A `curl` fired the
instant `fly deploy` returns can lose that race and see nothing yet, which reads as a failure this
early deploy has not actually had:

```sh
fly deploy --config fly.api.toml --remote-only --strategy immediate
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors https://tabletap-api.fly.dev/health
# expect: {"status":"ok",...}

fly deploy --config fly.web.toml --remote-only --strategy immediate
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors -o /dev/null -w '%{http_code}\n' \
  https://tabletap-web.fly.dev/login
# expect: 200
```

**The order is not a preference.** `OrderDtoSchema` (`packages/shared`) requires `updatedAt` and
the per-status timestamps — `paidAt` among them since M4 — that an older API build does not send.
A newer web deployed against an older API therefore fails to parse every order response: the menu
still renders, and nothing past it works. The reverse order is safe, because an older web simply
ignores response fields it does not recognise (`docs/backlog.md`). Deploying web first, even only
once, puts every visitor in that window until the API catches up.

## 9. Post-deploy checks

Run all of these once, after the first deploy. The workflow's own smoke checks (`/health`,
`/login`) cover routine redeploys after this; these are the ones that need a human to look, and
one of them is a merge blocker, not a formality.

1. **Open <https://tabletap-web.fly.dev>.** The landing page renders with the demo QR code and the
   three role cards. Open the browser's network tab and confirm the Socket.io connection in
   `apps/web/lib/socket.ts` opens against `https://tabletap-api.fly.dev`, not `localhost` — that
   is `NEXT_PUBLIC_API_ORIGIN` from `fly.web.toml`'s build arguments taking effect.
2. **Confirm the rewrite actually reaches the API, not only that the web app renders.** `/login`
   rendering (the workflow's own smoke check) proves the web _process_ is up; it says nothing
   about whether `API_URL` — the private `.flycast` address configured in `fly.web.toml` — actually
   resolves and answers. Neither the workflow's smoke checks nor a manual glance at the landing
   page would catch a broken private route here, since `/login` and the landing both render
   without it.

   `GET /api/menu` looks like the obvious thing to ask, and is the wrong choice: it is guarded by
   `requireAction('menu.read')`, so an anonymous caller (which this `curl` is) correctly gets `401`
   from a perfectly healthy deployment — `apps/api/src/routes/menu.test.ts` asserts exactly that.
   Reading that `401` as "the private route is broken" would be the same mistake check 5 below
   exists to guard against, in a new place. Ask a route that is `public: true` instead, one that
   still queries the database and still proves the private hop answers with real data:

   ```sh
   curl -fsS https://tabletap-web.fly.dev/api/demo/links
   # expect: real JSON — a guest url, and the seeded staff accounts with their roles and
   # passwords — not a connection error or a Next.js error page
   ```

   If this hangs, times out, or errors while `/health` on the API itself answers fine directly,
   the private route between the two apps is the problem, not either app individually — recheck
   the flycast address was allocated (step 2) and that `API_URL` in `fly.web.toml` matches the
   app name actually deployed.

3. **Open the kitchen board in one tab and the guest flow in another**, place an order, pay it in
   the demo terminal, and confirm the ticket appears on the board without a reload. This exercises
   the same-origin `/api/*` rewrite, the cookie, and the WebSocket together.
4. **Sign in as admin** (`/login?demo=admin&next=/admin`) with the `DEMO_PASSWORD` you generated,
   and confirm the photo upload control on a menu item shows "Photo upload is off in this demo…"
   and its button is disabled — proof `DEMO_UPLOADS_ENABLED=false` (API) and
   `NEXT_PUBLIC_UPLOADS_ENABLED=false` (web build) both took effect. If the API refuses uploads but
   the button is not disabled, the two disagree and the web image was built against stale values —
   rebuild it.
5. **The rate limiter's forged-header check — required, not optional.** The whole of the
   per-visitor rate-limit bucketing (`apps/api/src/lib/client-key.ts`) rests on one property: Fly's
   proxy _appends_ the real caller's address to `x-forwarded-for` rather than relaying whatever the
   caller sent, so a direct caller cannot pick its own bucket even though `TRUST_PROXY` trusts
   fly-proxy's own `fdaa::` address (it falls inside `fc00::/7`, i.e. `uniquelocal`). That is a
   property of Fly's edge, not of this code, and nothing else stands behind it — so it has to be
   observed on the deployed stack, not assumed from the source.

   The route's limit is `max: 20` inside a **one-minute** window (`apps/api/src/routes/guest.ts`).
   Twenty-one sequential HTTPS round-trips easily fit in a minute against a warm machine, but the
   very first request after a quiet spell pays the wake cost this configuration deliberately
   accepts (spec section 4.1), which can eat several of those sixty seconds on its own. Warm the
   machine first, outside the timed loop, then run the loop as fast as the shell allows:

   ```sh
   curl -fsS https://tabletap-api.fly.dev/health >/dev/null   # wakes it; not part of the count

   time (for i in $(seq 1 21); do
     curl -s -o /dev/null -w '%{http_code}\n' \
       -X POST https://tabletap-api.fly.dev/api/guest/claim \
       -H 'content-type: application/json' \
       -H 'x-forwarded-for: 203.0.113.10' \
       -d '{"token":"not-a-real-token"}'
   done)
   ```

   Expect twenty `401`s (the token is fake, which is fine — the check is about counting, not about
   claiming a table) followed by one `429` on the twenty-first line, with `time` reporting well
   under a minute. **If the loop itself took close to or over sixty seconds, the window rolled
   mid-loop and a twenty-first `401` means nothing** — rerun it faster (script it rather than
   pasting each line by hand) before drawing any conclusion. Only treat a twenty-first `401` as the
   real failure signature once the loop demonstrably finished inside the window.

   **If the twenty-first request is `401` on a loop that finished well inside a minute**, Fly's
   proxy is relaying the forged header instead of appending to it, the property this deployment
   depends on does not hold, and every visitor to the public demo shares one sign-in and one claim
   bucket with everyone else exploring it at the same time. Do not merge or hand out the link in
   that state; the fallback the design spec names is to stop trusting the forwarded header at all
   (`TRUST_PROXY` without `uniquelocal`) and accept that every request is keyed on fly-proxy's own
   `fdaa::` address instead — the one thing every request arriving at this app always shares,
   proxied or direct — which is safe but coarse — file that as a follow-up rather than silently
   shipping a shared bucket.

6. **Two genuinely different real clients, through the rewrite — not a second forged header at the
   API.** Check 5 above proves Fly's proxy discards a caller's own forged `x-forwarded-for`; it
   says nothing about the actual defect spec section 4.5 opens with, which is upstream of the API
   entirely. Every browser reaches the API _through the web app's `/api/*` rewrite_, not directly,
   so the property that matters here is whether _that_ path carries each visitor's real address
   along, all the way through the flycast hop this task's Critical A fix also touched. If it does
   not, `@fastify/rate-limit` keys every visitor on the same address, and one person exploring the
   demo exhausts the claim limit for everyone else. A second forged address sent straight at the
   public API, the way check 5 does, never touches the rewrite at all and cannot tell you this — it
   also cannot be fixed by repeating check 5 with a different forged value from the same machine,
   since the real caller behind that request has not changed, so a **correctly** behaving
   deployment still answers `429` for it, same as check 5 itself. Only a second real client, through
   the rewrite, proves anything here.

   **The action has to be repeatable without navigating away, and the failure has to be readable.**
   Clicking a real "guest" link off the landing page only works once — a successful claim redirects
   straight to `/menu`, and the button that started it is gone. Use an **invalid** table token
   instead, which fails the same way every time and never leaves the page:

   ```
   https://tabletap-web.fly.dev/t/not-a-real-demo-token
   ```

   This renders "This QR code is not valid." with a **Try again** button
   (`apps/web/components/claim-table.tsx`) — clicking it re-fires the same `/api/guest/claim` call
   through the rewrite without ever navigating anywhere. **Also know the failure mode's exact
   wording before you start:** `claim-table.tsx` has no case for a `RATE_LIMITED` error, so once the
   limit is hit the message does not change to anything about rate limits — it falls back to
   "Can't reach the server. Check the connection and try again.", which reads like a dropped
   connection, not a deliberate refusal. That is the signal you are watching for, not a red herring.

   Use two devices on two different networks — a laptop on wifi and a phone on cellular data is
   enough. **On device A**, open the URL above and click **Try again** repeatedly (twenty-plus
   times total, including the page's own first attempt) within a minute. **Confirm device A's
   message actually changes** from "This QR code is not valid." to "Can't reach the server. Check
   the connection and try again." before touching device B — this is the positive control: if
   device A never flips to the second message inside the minute, the run did not exhaust the
   bucket at all (rerun it faster, the same caution as check 5), and trying device B next would
   prove nothing either way. Only once device A shows the second message, **immediately open the
   same URL on device B**. Expect device B's _first_ load to show "This QR code is not valid." — the
   ordinary invalid-token message, not the rate-limited one. If device B shows "Can't reach the
   server…" on its very first attempt, the rewrite is not carrying a distinct address through for
   the two devices; they landed in the same bucket, which is the shared-bucket defect spec section
   4.5 describes, observed on the actual path every visitor uses.

   **If you ran check 5 shortly before this one, note that a real failure would show up in both.**
   Check 5 hits the API directly and check 6 goes through the rewrite, so a healthy deployment keeps
   them independent — but in the _broken_ world, both checks can collapse onto the same fallback
   key (fly-proxy's own address, or the web container's), and seeing both fail together is one
   finding, not two independent confirmations of it.
