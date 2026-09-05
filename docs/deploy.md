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

- A GitHub repository with write access, for the `FLY_API_TOKEN` secret in step 6.

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
2. Update every `https://tabletap-api.fly.dev` / `https://tabletap-web.fly.dev` literal across
   **both** `fly.api.toml` and `fly.web.toml` (`grep -n fly.dev fly.api.toml fly.web.toml` finds
   every occurrence) — these two files cross-reference each other's public address, and one
   missed occurrence produces exactly the half-working site spec section 4.2 warns about.
3. Commit the rename before deploying, so the workflow and this runbook stay in sync with reality.

## 2. Managed Postgres

```sh
fly postgres create --name tabletap-db --region fra
# When prompted for a configuration, choose the Managed Postgres (MPG) option — not the legacy
# unmanaged cluster — so Fly handles backups and failover.
fly postgres attach tabletap-db --app tabletap-api
```

`attach` sets `DATABASE_URL` on `tabletap-api` as a secret by itself — nothing to copy by hand.
The API's own entrypoint (`apps/api/docker-entrypoint.sh`) runs migrations and seeds the demo data
on every boot, so the schema and the seeded menu exist as soon as the first deploy's machine comes
up; there is no separate migration step in this runbook.

## 3. Object storage (Tigris)

```sh
fly storage create --name tabletap-storage --app tabletap-api
```

This prints a bucket name, an access key id, a secret access key, and the Tigris endpoint
(`https://fly.storage.tigris.dev`) — and, depending on your `flyctl` version, may set some of
these directly as secrets under provider-chosen names (`AWS_ACCESS_KEY_ID` and similar). The API
does not read those names; it reads the seven `S3_*` variables ADR 0012 defines, the same
interface MinIO serves locally. Map the printed values onto them explicitly:

```sh
fly secrets set --app tabletap-api \
  S3_ENDPOINT=https://fly.storage.tigris.dev \
  S3_REGION=auto \
  S3_BUCKET=<bucket name from the command above> \
  S3_ACCESS_KEY_ID=<access key id from the command above> \
  S3_SECRET_ACCESS_KEY=<secret access key from the command above> \
  S3_PUBLIC_URL=https://<bucket name>.fly.storage.tigris.dev \
  S3_FORCE_PATH_STYLE=false
```

`S3_PRESIGN_ENDPOINT` stays unset: that variable exists only for the local MinIO setup, where the
API and the browser reach the same store on two different hostnames (`minio:9000` vs.
`localhost:9000`) and a signature has to pick one. Tigris is one public endpoint for both, so the
split does not apply — set it and every presigned upload URL fails to verify.

## 4. The five secrets you must generate fresh

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
read it back — it is what the three seeded staff accounts (kitchen, admin, and the third role the
seed creates) sign in with on the deployed demo, and the value is not printed anywhere else after
this step. `TABLE_TOKEN_SECRET` and `SOCKET_TOKEN_SECRET` must differ from each other — generating
both independently, as above, already guarantees that.

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

## 5. `FLY_API_TOKEN` for the deploy workflow

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

## 6. First deploy — API before web, by hand

`.github/workflows/deploy.yml` handles every deploy after this one, automatically, in this same
order, and refuses to run at all against a red build. The very first deploy is manual because
nothing is running yet for the workflow's smoke checks to find:

```sh
fly deploy --config fly.api.toml --remote-only
curl -fsS https://tabletap-api.fly.dev/health
# expect: {"status":"ok",...}

fly deploy --config fly.web.toml --remote-only
curl -fsS -o /dev/null -w '%{http_code}\n' https://tabletap-web.fly.dev/login
# expect: 200
```

**The order is not a preference.** `OrderDtoSchema` (`packages/shared`) requires `updatedAt` and
the per-status timestamps — `paidAt` among them since M4 — that an older API build does not send.
A newer web deployed against an older API therefore fails to parse every order response: the menu
still renders, and nothing past it works. The reverse order is safe, because an older web simply
ignores response fields it does not recognise (`docs/backlog.md`). Deploying web first, even only
once, puts every visitor in that window until the API catches up.

## 7. Post-deploy checks

Run all of these once, after the first deploy. The workflow's own smoke checks (`/health`,
`/login`) cover routine redeploys after this; these are the ones that need a human to look, and
one of them is a merge blocker, not a formality.

1. **Open <https://tabletap-web.fly.dev>.** The landing page renders with the demo QR code and the
   three role cards. Open the browser's network tab and confirm the Socket.io connection in
   `apps/web/lib/socket.ts` opens against `https://tabletap-api.fly.dev`, not `localhost` — that
   is `NEXT_PUBLIC_API_ORIGIN` from `fly.web.toml`'s build arguments taking effect.
2. **Open the kitchen board in one tab and the guest flow in another**, place an order, pay it in
   the demo terminal, and confirm the ticket appears on the board without a reload. This exercises
   the same-origin `/api/*` rewrite, the cookie, and the WebSocket together.
3. **Sign in as admin** (`/login?demo=admin&next=/admin`) with the `DEMO_PASSWORD` you generated,
   and confirm the photo upload control on a menu item shows "Photo upload is off in this demo…"
   and its button is disabled — proof `DEMO_UPLOADS_ENABLED=false` (API) and
   `NEXT_PUBLIC_UPLOADS_ENABLED=false` (web build) both took effect. If the API refuses uploads but
   the button is not disabled, the two disagree and the web image was built against stale values —
   rebuild it.
4. **The rate limiter's forged-header check — required, not optional.** The whole of the
   per-visitor rate-limit bucketing (`apps/api/src/lib/client-key.ts`) rests on one property: Fly's
   proxy _appends_ the real caller's address to `x-forwarded-for` rather than relaying whatever the
   caller sent, so a direct caller cannot pick its own bucket even though `TRUST_PROXY` trusts
   fly-proxy's own `fdaa::` address (it falls inside `fc00::/7`, i.e. `uniquelocal`). That is a
   property of Fly's edge, not of this code, and nothing else stands behind it — so it has to be
   observed on the deployed stack, not assumed from the source.

   Send the same forged header at the public API twenty-one times:

   ```sh
   for i in $(seq 1 21); do
     curl -s -o /dev/null -w '%{http_code}\n' \
       -X POST https://tabletap-api.fly.dev/api/guest/claim \
       -H 'content-type: application/json' \
       -H 'x-forwarded-for: 203.0.113.10' \
       -d '{"token":"not-a-real-token"}'
   done
   ```

   Expect twenty `401`s (the token is fake, which is fine — the check is about counting, not about
   claiming a table) followed by one `429` on the twenty-first line. **If the twenty-first request
   is not `429`** — if all twenty-one come back `401` — Fly's proxy is relaying the forged header
   instead of appending to it, the property this deployment depends on does not hold, and every
   visitor to the public demo shares one sign-in and one claim bucket with everyone else exploring
   it at the same time. Do not merge or hand out the link in that state; the fallback the design
   spec names is to stop trusting the forwarded header at all (`TRUST_PROXY` without
   `uniquelocal`) and accept that every request through the rewrite is keyed on the web
   container's own address instead, which is safe but coarse — file that as a follow-up rather
   than silently shipping a shared bucket.

5. **A second, different forged address gets its own bucket.** Repeat step 4's loop once with
   `x-forwarded-for: 203.0.113.11` right after exhausting `.10` — it should answer `401`, not
   `429`. This is the other half of spec section 4.5's requirement ("two different clients
   observed landing in two different buckets"): step 4 alone would also pass if every request
   shared one bucket that simply has a limit of twenty.
