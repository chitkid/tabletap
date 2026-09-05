# Deploying TableTap

This is a runbook, not a description — follow it top to bottom on the first deploy. Every step that
needs an account, a login or a password is marked **(owner)**: nothing in this repository, and no
automation described here, signs in or creates an account on anyone's behalf.
`.github/workflows/deploy.yml` only redeploys services that already exist, with values that already
exist — it is not how they come into being the first time.

Three services, three free tiers, no payment method and no object storage: the web on **Vercel**,
the API on **Render** built from `Dockerfile.api`, Postgres on **Neon**. Section 4 of
`docs/superpowers/specs/2026-09-05-m6-polish-portfolio-design.md` is the design record this runbook
implements — read it if a step here seems to need a reason.

**No value from `.env.example` may reach a public host.** Every value in that file is a local demo
default, published in this repository's history: anyone who has cloned it already has them. Six
values are generated fresh in step 4 and none of them is ever copied from that file.

## What this document cannot verify

Free tiers change, and a runbook written against last year's terms strands the person following it.
Nothing below has been executed against a live account by whoever wrote it. So:

- Where a command, a limit, a plan name or an API field could have moved, this document says which
  page to confirm it against. Confirm it there rather than trusting the specific here.
- A step that does not match what you see on screen is far more likely to be drift than a broken
  deployment. Read it that way.

**One unverified thing is not like the others, and it is the reason check 5 in step 9 is not
optional.** Every item above announces itself: a renamed Blueprint key is rejected, a moved CLI flag
fails a build, an expired tier is a page that says so. Whether Vercel's middleware runtime delivers
`FORWARD_SECRET` — a plain, non-`NEXT_PUBLIC_` project variable — to the edge function announces
nothing at all. If it does not, the middleware finds no secret, signs nothing, sends neither header,
and the API falls back to keying every visitor on the one address it sees. No error is raised
anywhere, no log line appears, and the demo behaves correctly in every respect except that one
person exploring it can lock out the next. Step 4 says why the property matters and step 6 checks
what it can check from a dashboard; only check 5 observes the thing itself.

The checks in step 9 are written to the opposite rule and to a stricter one: each states what a
**correct** deployment returns, so that a healthy service is never reported as broken. Three
separate checks in an earlier version of this document did exactly that, and a check you cannot
distinguish from a real fault is worse than no check at all.

---

## 0. Confirm the three free tiers before relying on them

**(owner)** Five minutes of reading now, against the providers' own current pages:

| Confirm                 | Where                                            | What this deployment assumes                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Hobby            | vercel.com/pricing                               | A free personal project, no payment method, and it does not sleep.                                                                                                                                                                 |
| Render free web service | render.com/pricing and the Docker/free-plan docs | A free web service that builds a Dockerfile, in the region `render.yaml` names (`frankfurt` — step 3 is where you change it), that sleeps after a period of inactivity and wakes on the next request. WebSockets on the free plan. |
| Neon free project       | neon.com/pricing                                 | A free Postgres project that does not expire, with a connection string you can copy.                                                                                                                                               |

Two of those assumptions carry real weight. If **Render's free plan no longer builds Dockerfiles**,
this deployment has no host — the whole point of Render here is that it runs `Dockerfile.api`
unchanged. If **Neon's free project now expires**, the demo dies silently months from now, which is
the exact failure Render's own free database was rejected for.

If a tier has changed in a way this document does not cover, stop and re-decide the topology rather
than improvising around it. Nothing further down is worth doing on a tier that will not hold.

## 1. The database, on Neon

**(owner)**

1. Create a Neon account and a project. Pick the region nearest the **Render** region, which is
   `region: frankfurt` in `render.yaml` unless you change it — step 3 is where that choice is made,
   so decide it there first if Frankfurt is not where you want the API. Every query the API makes
   crosses whatever distance is left between the two.
2. Copy the connection string. **Take the direct connection string, not the pooled one** — the
   pooled host has `-pooler` in it. The reason is in this repository: `packages/db/src/client.ts`
   creates the client with `postgres(url, { max: 10 })` and leaves prepared statements on, and
   transaction-mode pooling does not support them. Nothing here sets `prepare: false`, so the
   pooled endpoint is the wrong one to hand it.
3. Keep the string somewhere you can read it back. It is `DATABASE_URL` in step 3.

There is **no separate migration step, here or anywhere below.** `Dockerfile.api`'s entrypoint
(`apps/api/docker-entrypoint.sh`) runs `migrate.js` and then `seed.js --if-empty` before it starts
the server, on every boot. The schema and the seeded demo menu exist as soon as the first deploy
comes up.

Two things to know rather than to act on. Neon's free project suspends its compute after a short
idle period and wakes on the next connection; that is part of why the first request after a quiet
spell is slow (step 10). And if the API's first boot fails with a Postgres error naming an
unrecognised configuration parameter, the cause is a query parameter in the connection string that
the driver passed straight through — keep `?sslmode=require` and drop the rest.

## 2. The web project on Vercel — created, not yet deployed

**(owner)** The API needs the web app's public address (CORS, better-auth) and the web app needs
the API's. Creating the Vercel project first, without deploying it, breaks that circle: a Vercel
project has its production address from the moment it exists.

```sh
npm install --global vercel
vercel login
vercel link            # run from the repository root
```

`vercel link` offers to create a new project. Take that, name it (`tabletap-web` reads well), and
then set two things in the project's settings, because they are what a pnpm workspace needs and
neither is always detected:

- **Root Directory: `apps/web`.** `apps/web/next.config.ts` sets `outputFileTracingRoot` two levels
  up from the working directory, which is the repository root exactly when this is `apps/web`.
- **Include files outside the Root Directory in the build step: on.** `apps/web` imports
  `@tabletap/ui` and `@tabletap/shared` as TypeScript source (`transpilePackages`), so a build that
  cannot see `packages/` cannot compile.

Leave the build and install commands at their detected defaults: `apps/web/package.json`'s `build`
is `next build`, and `packages/ui/tokens.css` is committed, so nothing has to be generated first.

**Do not connect the GitHub repository to this project.** Vercel's Git integration deploys on the
push itself, before CI has said anything about the commit; `.github/workflows/deploy.yml` deploys
after `ci` goes green, and it can only be the only route to production if nothing else is also a
route. (If you have already imported from Git, turn automatic production deployments off in the
project's Git settings.)

Then read the project's **production address** off the dashboard — Settings → Domains — rather than
assuming it from the name. **`<web>` from here on is that host name without a scheme** — something
like `tabletap-web.vercel.app` — so every URL below reads `https://<web>/…`.

Two notes on what `vercel link` just did locally. It wrote `.vercel/project.json`, which holds the
organisation and project ids step 7 needs. And `.vercel/` is in this repository's `.gitignore` on
purpose: `vercel pull` writes the project's environment — secrets included — into
`.vercel/.env.production.local`, and that file must never be committed.

`apps/web/next.config.ts` sets `output: 'standalone'`, which exists for the Docker image the local
Compose stack builds. Vercel's own Next.js builder handles that setting; no change is needed for
it. It is mentioned here only so that a build failure naming it is recognisable rather than
mysterious.

## 3. The API on Render, from `render.yaml`

**(owner)** `render.yaml` in the repository root declares the service: Docker, free plan, health
check `/health`, `autoDeploy: false`, and every environment variable listed with the secrets marked
`sync: false` so Render asks for them instead of reading them from a file in git.

0. **Pick the region before you create anything.** `render.yaml` says `region: frankfurt`, which is
   a guess about where you are, not a requirement of this project. If you are not in Europe, edit
   that line to the Render region nearest you and commit the change first — Frankfurt is otherwise
   where the API lives, and every query it makes to a Neon database on another continent pays for
   the crossing twice. Render's region names are its own (`oregon`, `ohio`, `virginia`,
   `frankfurt`, `singapore` at the time of writing); take the current list, and the free plan's
   availability in the one you want, from Render's own region documentation. A region the free
   plan does not serve is one of the ways the Blueprint below is rejected.
1. In Render, create a **Blueprint** from this repository. Render reads `render.yaml` and prompts
   for every `sync: false` value. If anything is rejected, the two things to check are that region
   and the key names — confirm both against Render's current Blueprint reference, since the spec
   has renamed keys before.
2. Fill in what you already have: `DATABASE_URL` from step 1, `WEB_ORIGIN` = `https://<web>` from
   step 2.
   All six generated values come from step 4 — do that step now if you would rather not come back,
   or enter placeholders and correct them before the first deploy finishes; the verification gate in
   step 6 is what catches a placeholder that was never replaced.
3. `BETTER_AUTH_URL` is this service's own public address, which does not exist until the service
   does. Enter `https://tabletap-api.onrender.com`, let the service be created, then read the real
   address off the Render dashboard and **correct `BETTER_AUTH_URL` if it differs** — Render
   appends a suffix when a name is already taken, and this value is better-auth's cookie prefix and
   callback base. Saving an environment variable restarts the service.

**`<api>` from here on is that host name without a scheme** — something like
`tabletap-api.onrender.com` — matching `<web>` above.

The first deploy happens when the Blueprint creates the service. It will not be healthy until every
value above is right; that is expected at this point in the runbook, not a fault to chase.
`autoDeploy: false` means no _later_ push deploys it — only the workflow does.

## 4. The six secrets, generated fresh

**(owner)** Generate each with the command `.env.example` already documents, and set them in
Render's environment editor. **Do not copy any value out of `.env.example`.**

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # run once per secret
```

| Variable              | Where it goes                         | Floor                                                              |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`  | Render                                | 32 characters, enforced at boot                                    |
| `COOKIE_SECRET`       | Render                                | 32 characters, enforced at boot                                    |
| `TABLE_TOKEN_SECRET`  | Render                                | 32 characters, enforced at boot; must differ from the next one     |
| `SOCKET_TOKEN_SECRET` | Render                                | 32 characters, enforced at boot; must differ from the previous one |
| `FORWARD_SECRET`      | **Render and Vercel, the same value** | 32 characters when present, enforced at boot — see below           |
| `DEMO_PASSWORD`       | Render                                | 8 characters — see below                                           |

The command above produces 64 hex characters, comfortably over every floor. Generating each
independently already guarantees `TABLE_TOKEN_SECRET` and `SOCKET_TOKEN_SECRET` differ.

### `FORWARD_SECRET` gets its own line

It is the only value here that is set in **two places and must match**. The web signs the visitor's
address it forwards over the `/api/*` rewrite and the API honours a forwarded address only when
that signature verifies (`apps/web/lib/forward-signature.ts`, `apps/api/src/lib/client-key.ts`).
That is what gives each visitor their own rate-limit bucket now that the two apps are on different
platforms and the API's peer is an ordinary public address.

A mismatch between the two sides **raises nothing**. No error, no log line, no failed request:
every signature simply fails to verify, the API falls back to the address of the connection it
received, and every visitor to the demo shares one bucket with everyone else. Leaving it unset
entirely does the same, and by design — unset means "verify nothing", never "believe anyone", so a
deployment that forgets it degrades to one shared bucket rather than to a bucket every caller can
choose. Either way the API boots and the demo looks correct. Check 5 in step 9 is the only thing
that sees it; step 6 compares the two values before any of that. A value that is present but
shorter than 32 characters is the one case that does stop the boot.

It is a plain runtime environment variable on both sides — unlike every `NEXT_PUBLIC_*` value it is
not inlined into the web build. **That much was measured, and measured locally**: a standalone
Docker image built with one value and run with another showed the running value, and the built edge
bundle still contained the unsubstituted `process.env.FORWARD_SECRET`.

**What that measurement cannot reach is Vercel.** Whether Vercel's middleware runtime hands a
non-`NEXT_PUBLIC_` project variable to the edge function is a property of that platform, and no
local image can establish it. It is also the one unverified thing in this document whose failure
produces no error anywhere — the middleware simply finds nothing, sends neither header, and every
visitor shares one bucket while the demo looks perfect. **Check 5 in step 9 is the only thing that
settles it**, which is why that check is the one you may not skip.

Changing the value afterwards is **a restart on Render and a redeploy on Vercel**. Vercel binds
environment variables to a deployment: there is nothing to restart, and an edited value does not
reach the deployment that is already serving until a new one is made.

### `DEMO_PASSWORD` gets its own line, for the opposite reason

The four secrets above `FORWARD_SECRET` fail loudly when they are missing: the API refuses to boot.
`FORWARD_SECRET` fails silently, as just described. `DEMO_PASSWORD` does something worse than
either. It has a default in `apps/api/src/config.ts`, and **that default is `tabletap-demo` — the
exact value published in `.env.example` in this repository.** So forgetting it does not fail
anything. It ships a working, healthy-looking public demo whose staff password is in a file anyone
can read.

Set it. Its absence from Render's environment list is the failure to look for, not a crash.

Write the value down. `GET /api/demo/links` returns it in plain text for every seeded account while
`DEMO_MODE` is on — that is deliberate, the demo is meant to be explored without an account — so it
is never more than a page load away. Keep your own copy anyway: debugging a boot failure is easier
before the endpoint serving it exists.

### What stays unset

**`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stay unset.** With either missing,
`apps/api/src/config.ts` resolves the payment provider to `demo`: the in-app terminal, no card and
no money. Setting them turns on real Stripe Checkout, which this demo is not for.

**Every `S3_*` variable stays unset, and there is no bucket to create.** Uploads are refused
(`DEMO_UPLOADS_ENABLED=false` in `render.yaml`), the seed sets no `image_url` and every dish draws
its own plate, so storage would hold nothing. `storageConfigured` is simply `false`.

## 5. Vercel's environment variables

**(owner)** In the Vercel project, Production environment. Five values:

| Variable                      | Value                 | Read when                        |
| ----------------------------- | --------------------- | -------------------------------- |
| `NEXT_PUBLIC_API_ORIGIN`      | `https://<api>`       | **Build**                        |
| `NEXT_PUBLIC_APP_URL`         | `https://<web>`       | **Build** (and again at runtime) |
| `NEXT_PUBLIC_UPLOADS_ENABLED` | `false`               | **Build**                        |
| `API_URL`                     | `https://<api>`       | **Build** and runtime            |
| `FORWARD_SECRET`              | the value from step 4 | Runtime                          |

**The three `NEXT_PUBLIC_*` values are build-time variables.** Next inlines them into the browser
bundle when it compiles, so a value supplied only at run time produces a bundle that still points at
`http://localhost:4000` — a kitchen socket that never connects, and a link preview nobody outside
can load. On Vercel an ordinary project environment variable is present during the build as well as
at runtime, so this needs no special setting; what it needs is that you do not mark any of them
runtime-only if your plan offers that, and that you **redeploy after changing one**, because a
change with no rebuild changes nothing in the bundle.

`API_URL` is build-time for a less obvious reason: the `/api/:path*` rewrite in
`apps/web/next.config.ts` is compiled into the build. It is _also_ read at runtime, because server
components call the API directly through it (`apps/web/lib/api.ts`). It must be right in both, which
one ordinary project variable gives you.

`NEXT_PUBLIC_API_ORIGIN` and `API_URL` hold the same address here, and they are two variables
because they are two paths: the browser's Socket.io connection goes to `NEXT_PUBLIC_API_ORIGIN`
cross-origin (safe — it authenticates with a 60-second `tt-socket` token, never a cookie), while
every other browser request goes to a same-origin `/api/...` and the rewrite forwards it to
`API_URL`. That is what keeps session cookies first-party with no `SameSite` change and no CORS in
the browser's path.

`NEXT_PUBLIC_UPLOADS_ENABLED=false` is the web's _explanation_ of the refusal, not the refusal
itself: the API enforces `DEMO_UPLOADS_ENABLED` regardless of what the web was built with. Matching
them means a visitor sees a control that says why it is off rather than one that just fails.

## 6. The verification gate, before the first real deploy

Nothing above detects a half-success: a value pasted into the wrong service, a placeholder never
replaced, a secret set on Preview instead of Production. Undetected, the mildest symptom is a
crash-looping service and the worst is a healthy demo with a published password. Check the exact
sets now.

**On Render — Environment.** `apps/api/src/config.ts` has exactly seven **required** fields — seven
that are neither optional nor defaulted — and the service does not boot without all seven:

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, `COOKIE_SECRET`,
`TABLE_TOKEN_SECRET`, `SOCKET_TOKEN_SECRET`.

Then three more that do not block the boot and still have to be right:

- `FORWARD_SECRET` — present, and at least 32 characters.
- `DEMO_PASSWORD` — present, and not `tabletap-demo`.
- `DEMO_UPLOADS_ENABLED` — `false`.

And two absences: no `STRIPE_*`, no `S3_*`.

**On Vercel — Settings → Environment Variables, Production.** The five from step 5, and
`NEXT_PUBLIC_UPLOADS_ENABLED` is `false`.

**Then compare the two `FORWARD_SECRET` values without printing either.** Reveal each on its own
dashboard and hash it:

```sh
# sha256sum on most Linux installs; shasum -a 256 on macOS and where sha256sum is absent.
printf '%s' 'the value from Render' | sha256sum
printf '%s' 'the value from Vercel' | sha256sum
```

Identical digests, and only then move on. `printf` rather than `echo` because a trailing newline
would change the digest of one and not the other. (This leaves the values in your shell history;
clear it if that matters to you.)

What this proves is that the two dashboards hold the same string. It does **not** prove the running
middleware ever reads it — that is check 5's job, and step 4 says why nothing short of check 5 can
do it.

If a boot does fail later, `loadConfig`'s error names every missing or invalid variable, and
Render's log tab is where it appears.

## 7. Tell the workflow where to deploy

**(owner)** `.github/workflows/deploy.yml` needs five secrets and two variables on the GitHub
repository. Settings → Secrets and variables → Actions.

**Secrets:**

| Name                | Where it comes from                                              |
| ------------------- | ---------------------------------------------------------------- |
| `RENDER_API_KEY`    | Render → Account Settings → API Keys                             |
| `RENDER_SERVICE_ID` | The `srv-…` id in the Render service's URL, or its Settings page |
| `VERCEL_TOKEN`      | Vercel → Account Settings → Tokens                               |
| `VERCEL_ORG_ID`     | `.vercel/project.json`, written by `vercel link` in step 2       |
| `VERCEL_PROJECT_ID` | the same file                                                    |

**Variables** (not secrets — they are public addresses, and the workflow prints them in its logs):

| Name         | Value                              |
| ------------ | ---------------------------------- |
| `API_ORIGIN` | `https://<api>`, no trailing slash |
| `WEB_ORIGIN` | `https://<web>`, no trailing slash |

The workflow's first step in each job fails with the missing names if any of these are absent, so a
forgotten one is a clear message rather than a confusing curl error.

Confirm Render's API is available on your plan and that the create-deploy endpoint still looks the
way `deploy.yml` calls it (`https://api.render.com/v1/services/{id}/deploys`, with an optional
`commitId`) at render.com/docs/api. If `commitId` is rejected, removing it deploys the branch head
instead — almost always the same commit, because the workflow's `concurrency` group queues runs
rather than overlapping them.

**And confirm the deploy statuses while you are on that page.** After triggering the deploy the
workflow polls it and waits for the status `live`, failing only on `build_failed`, `update_failed`,
`pre_deploy_failed`, `canceled` or `deactivated`. That vocabulary is Render's, not this project's,
and it is the part of the workflow most likely to have drifted. Anything the list does not
recognise is treated as "still deploying" on purpose — a status name added since this was written
should not fail a healthy deploy — so the symptom of drift is a job that waits out its
twenty-five-minute deadline on a deploy the dashboard already shows as finished, not a red build
you can read. If that happens, the status names in the `Wait for Render to report it live` step are
what to correct.

## 8. The first deploy, by hand — API first, then web

The workflow handles every deploy after this one. The first is manual because the Vercel project
has never been built and the workflow's checks have nothing to find yet.

**The order is not a preference.** `OrderDtoSchema` (`packages/shared`) requires `updatedAt` and the
per-status timestamps — `paidAt` among them since M4 — that an older API build does not send. A
newer web against an older API therefore fails to parse every order response: the menu renders and
nothing past it works. The reverse order is safe, because an older web ignores response fields it
does not recognise.

**API.** It was deployed when the Blueprint created it in step 3; if you have corrected environment
variables since, trigger a redeploy from the Render dashboard so the running instance has them.
Then, from your machine:

```sh
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors https://<api>/health
```

A correct deployment prints `{"status":"ok","version":…,"uptime":…,"checks":{"db":"ok"}}`. The
retry is not decoration: the entrypoint runs the migrations and the seed before the process
listens, and a free instance may also be waking. A `{"status":"degraded"}` with `"db":"fail"` is a
real fault — the connection string.

**Web**, from the repository root, on the commit you want live:

```sh
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

**Then delete what `vercel pull` left behind.** It writes the project's whole production
environment — `FORWARD_SECRET` and every other value you generated in step 4 — in plain text to
`.vercel/.env.production.local`. `.gitignore` keeps that out of the repository; nothing keeps it
off your disk:

```sh
rm -f .vercel/.env.production.local
```

The workflow does the same three commands on a runner that is destroyed afterwards, so this is a
first-deploy chore, not a recurring one. It comes back every time you run `vercel pull` by hand.

Then:

```sh
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors -o /dev/null -w '%{http_code}\n' https://<web>/login
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors https://<web>/api/demo/links
```

A correct deployment answers `200` to the first and real JSON to the second. Both of those are the
smoke checks the workflow runs after every later deploy, for the reasons written next to them in
`deploy.yml`.

If `vercel build` cannot find the workspace or picks the wrong directory, run the three commands
from `apps/web` instead of the repository root, and change the working directory of the
corresponding steps in `.github/workflows/deploy.yml` to match. The Vercel CLI's monorepo handling
is the part of this runbook most likely to have moved; the symptom is a failed build with the CLI's
own error, never a silently wrong deployment.

After this, pushing to `main` runs `ci`; if `ci` goes green, `deploy` runs and does the same two
deploys in the same order.

## 9. The post-deploy checks

Seven blocks — six checks, and 5b, which hangs off check 5 rather than standing on its own. Run
them all once, after the first deploy, **in the order given**: three of them count against the same
rate-limit bucket and would otherwise refuse each other for reasons that have nothing to do with
what is being tested. Each says what a **correct** deployment returns.

Check 5 is the one that cannot be skipped, for the reason given under it.

Before you start, wake the API so nothing below is timing a cold start:

```sh
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors https://<api>/health
```

### 1. The landing loads

Open `https://<web>`.

**Correct:** the page renders, with the demo QR code, the guest link and the three staff role cards.

The landing calls `GET /api/demo/links` from the server on every render, so a page that renders
_with_ its demo cards has already proved the web tier can reach the API. If the API had been asleep
this first load could have taken tens of seconds — that is the tier, not a fault.

Two other renderings, and they mean different things. Cards missing and the page reading as a plain
product page is the API answering 404: either `DEMO_MODE` is not `true` on Render, or the seed never
ran. A short notice in place of the cards means the API answered something else, and check 2 is
what will say what.

### 2. The rewrite reaches the API

```sh
curl -fsS --retry 10 --retry-delay 3 --retry-all-errors https://<web>/api/demo/links
```

**Correct:** 200, and JSON containing a guest URL and the three seeded staff accounts with their
roles and passwords.

This is the check that proves the browser's own path — Vercel, the `/api/:path*` rewrite,
`API_URL`, the API, the database — end to end. `/login` rendering does not prove it: that page only
calls the API when `?demo=` names a staff role (`apps/web/app/login/page.tsx`), so it renders fine
over a completely broken rewrite. And `GET /api/menu` is the wrong thing to ask: it requires
`menu.read`, so an anonymous curl gets **401 from a perfectly healthy deployment**.
`/api/demo/links` is `public: true` and it queries the database, which is why it is the one used
here.

If this errors while `https://<api>/health` answers fine directly, `API_URL` on Vercel is the thing
to look at — and remember it is read at build time, so correcting it needs a redeploy, not a
restart.

### 3. A guest claims table 7

From the landing, follow the guest link (or scan the QR).

**Correct:** the page says "Finding your table…" briefly and then the menu appears, with the seeded
dishes.

This spends one of the twenty claim requests your address is allowed per minute — which matters only
because checks 5, 5b and 6 count them.

### 4. The kitchen board's socket goes to the public API origin

Sign in at `https://<web>/login?demo=kitchen&next=/kitchen`. The form is prefilled with the seeded
kitchen account and the `DEMO_PASSWORD` you set. Then open the browser's network panel and reload
the board. Leave the panel unfiltered, or turn on both WS and Fetch/XHR — a WS-only filter hides the
polling half of what is described below.

**Correct — and it takes two observations, not one.**

**The address.** Socket.io traffic to `https://<api>` — `wss://<api>/socket.io/…`, and/or
long-polling requests to `https://<api>/socket.io/…` before the upgrade. Either is correct;
Socket.io starts on polling and upgrades, and a deployment that stays on polling still works.

**And the connection settling.** Watch the band across the top of the board. It says **"Connecting
to the kitchen feed…"**, and on a correct deployment it goes blank within a moment and stays blank
(`apps/web/components/kitchen/connection-banner.tsx` keeps the empty band in the layout on purpose,
so the board does not jump). Blank means the socket actually connected: the board only clears it on
Socket.io's `connect` event.

**Why the address alone is not enough.** `createSocket` fetches a 60-second token from
`/api/socket-token` in its `auth` callback and calls back with an _empty_ object if that fetch
fails; the server refuses an empty handshake, and Socket.io then retries with backoff, for ever.
That loop produces exactly what the address observation calls correct — a steady stream of requests
to `https://<api>/socket.io/…` — on a board that is receiving nothing. The band is what separates
the two: in the retry loop it never goes blank, and the network panel shows a new handshake every
few seconds rather than one connection that stays open. A `POST /api/socket-token` answering
anything but **200** is the same fault seen from the other end.

This is the one place in the app where a socket exists to look at. **The landing opens none** —
`createSocket` is imported only by `apps/web/components/kitchen/kitchen-board.tsx` and
`apps/web/components/order/order-live.tsx` — so watching the landing for one finds nothing and
proves nothing.

The failure to look for on the address is an attempted connection to `localhost:4000`: that is
`NEXT_PUBLIC_API_ORIGIN` missing at **build** time, and it is fixed by setting it and redeploying,
not by restarting.

### 5. Two real clients, on two networks, do not share a rate-limit bucket

**This is the one check that cannot be skipped**, and it needs two networks and a phone, which is
exactly what makes skipping it tempting. Everything else in this list has a failure that announces
itself somewhere — a status code, an error page, a connection to `localhost`. This one does not.
It is the only observation anywhere in this runbook that settles whether Vercel's middleware runtime
actually delivers `FORWARD_SECRET` to the edge function (step 4), and a deployment where it does not
looks entirely healthy while every visitor shares one rate-limit bucket. Step 6's digest comparison
is not a substitute: it proves the two dashboards hold the same string, not that the running
middleware ever reads it.

It proves that property on the real path — through the deployed site's own `/api/*` rewrite, which
is the path every visitor uses.

**Two genuinely different networks.** Device A is a laptop on wifi; device B is a phone **on
cellular data with wifi off**. Two devices behind the same router share one public address, and
`client-key.ts` normalises an IPv6 address to its /64, so the same home connection is one bucket
over IPv6 too. Two devices on one network landing in one bucket is _correct behaviour_, and
mistaking it for the defect is the easiest false alarm here.

Use an invalid table token, so the action repeats without navigating away:

```
https://<web>/t/not-a-real-demo-token
```

The page claims the table on load and shows **"This QR code is not valid."** with a **Try again**
button (`apps/web/components/claim-table.tsx`); each press re-fires the same `/api/guest/claim`
through the rewrite and stays on the page.

**The arithmetic.** The limit is twenty per minute (`apps/api/src/routes/guest.ts`), and the page's
own first attempt is request one. So twenty presses of Try again make request twenty-one, and
twenty-one is the one refused. **The whole run has to finish inside a minute** — the window is a
minute, and if it rolls mid-run the result means nothing and the run has to be repeated faster.

**What a refusal looks like.** Not a message about rate limits: `claim-table.tsx` has no case for
the rate-limited code, so it falls back to **"Can't reach the server. Check the connection and try
again."** That reads like a dropped connection and it is the signal, not a red herring.

**On device A:** open the URL and press Try again twenty times, quickly. **Confirm device A's
message actually changes** to "Can't reach the server. Check the connection and try again." That is
the positive control. If it never changes inside the minute, device A did not exhaust the bucket at
all, and going on to device B would prove nothing either way — repeat it faster first.

**Only then, immediately, on device B:** open the same URL.

**Correct:** device B's first load shows **"This QR code is not valid."** — the ordinary
invalid-token message. Its bucket is its own.

**The defect:** device B shows "Can't reach the server…" on its very first load. The two clients
shared a bucket, which means one person exploring the demo can lock everyone else out of claiming a
table. Three causes, in the order worth trying:

1. **The web deployment is not receiving the variable at all.** Vercel binds environment variables
   to a deployment, so a `FORWARD_SECRET` added or edited after the current deployment was made has
   not reached it — and if the value was added late, the running middleware has never seen one.
   **Redeploy the web and run this check again**, and do that before concluding anything else.
2. **The value differs between the two platforms, or is missing on one.** Step 6's digest comparison
   rules this out if you did it; do it now if you did not.
3. **Vercel's middleware runtime does not expose the variable to the edge function at all** — the
   unverified platform fact this check exists to settle. If a redeploy with matching digests on both
   sides still fails, this is what is left. It is a finding, not a misconfiguration: record it, and
   do not hand out the link as a demo that limits per visitor, because it does not.

#### 5b. And the hop this check does not cover, which needs its own fresh minute

The web signs whatever inbound `x-forwarded-for` it reads, so the whole property still rests on
Vercel overwriting or appending that header rather than relaying one the client supplied. That
assumption is inherited from an earlier milestone, it cannot be tested anywhere but on the real
platform, and one loop tests it.

**Wait sixty seconds after device A's run** — the window is a minute, and starting inside it means
the leading requests below answer `429` for a reason that has nothing to do with the header. Then,
from the laptop:

```sh
time (for i in $(seq 1 20); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<web>/api/guest/claim \
    -H 'content-type: application/json' -d '{"token":"not-a-real-token"}'
done
curl -s -o /dev/null -w 'forged: %{http_code}\n' -X POST https://<web>/api/guest/claim \
  -H 'content-type: application/json' -H 'x-forwarded-for: 203.0.113.10' \
  -d '{"token":"not-a-real-token"}')
```

**Correct:** twenty `401`s and then `forged: 429`, with `time` well under a minute. The forged entry
is not the nearest hop, so the middleware signed the laptop's real address and the last request
landed in the bucket the twenty before it had just filled.

**The defect:** `forged: 401`. Vercel relayed the client's own header, a caller can mint a fresh
bucket per request by varying it, and the per-visitor limit is decoration — record it as a finding
rather than shipping quietly.

If the leading twenty are already `429`, the minute had not rolled: wait and run the whole block
again. If the loop itself took near or over sixty seconds, it says nothing either way.

### 6. A forged visitor header sent straight at the API is ignored

**Wait at least sixty seconds after 5b before starting this**, if you are running it from the same
machine. A correct deployment keys this check on the laptop's own address — the very thing it is
about to prove — which is the same bucket 5b just filled. Starting early means a refusal that has
nothing to do with what is being tested.

Twenty-one requests straight at the public API — not through the rewrite — each claiming a
_different_ visitor address with a signature that cannot verify:

```sh
# A signature of the right shape - 64 hex characters, the length of a hex SHA-256 - so that
# `signedVisitor` in apps/api/src/lib/client-key.ts does not short-circuit on the length guard and
# the check exercises the comparison it is actually about.
sig=$(printf '0%.0s' $(seq 64))

time (for i in $(seq 1 21); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<api>/api/guest/claim \
    -H 'content-type: application/json' \
    -H "x-tt-visitor: 203.0.113.$i" \
    -H "x-tt-visitor-signature: $sig" \
    -d '{"token":"not-a-real-token"}'
done)
```

**Correct:** `401` repeatedly and then a `429`, with `time` reporting well under a minute. Twenty-one
different claimed addresses bought one bucket, not twenty-one: the API ignored every unverifiable
header and keyed on the address of the connection it actually received. The `401`s are the fake
token being rejected, which is fine — this check is about counting, not about claiming a table.

The refusal may arrive **before** the twenty-first request if your address already spent some of its
twenty in checks 3, 5 or 5b. That is still correct, and it is still the same finding: they shared a
bucket. What would be wrong is **no refusal at all** across all twenty-one, on a loop that finished
inside the minute — that would mean the API is believing a header anyone can write, and every caller
can pick their own bucket.

If the loop took close to or over sixty seconds, the window rolled and the run says nothing. Script
it rather than pasting lines by hand, and repeat.

## 10. What is expected, and is not a fault

**The first request after the API has slept takes tens of seconds.** Render's free web service stops
after a period without traffic and starts again on the next request; Neon's free compute suspends
and wakes the same way. That is the price of a demo nobody pays to keep warm, it was chosen
deliberately, and the landing page and the README both say so in a line — an unexplained
thirty-second wait reads as a broken project, an explained one reads as a trade-off. The web does
not sleep, so the wait falls on the first _interaction_ and never on the first _impression_.

**The demo data comes back reset.** The API reseeds on boot and on an interval
(`DEMO_RESET_INTERVAL_MINUTES=60`), so a menu item you renamed or a table you deactivated will be
back. Printed QR codes survive it: seeded ids are derived from natural keys, so a reset keeps the
same table ids and a printed code keeps working.

And one that is a deliberate refusal rather than a fault: **photo upload is off.** The control in
the admin menu editor stays visible and says why. If something calls the upload routes anyway they
answer **403** — the demo-uploads gate runs before the storage check, so it is a refusal, not the
503 an unconfigured store would give.
