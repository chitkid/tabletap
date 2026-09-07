# TableTap — a case study

TableTap is QR table ordering for one restaurant. A guest scans the code on the table, orders from
their phone, pays, and the ticket appears on the kitchen board the moment the payment settles. The
demo tenant is Little Furnace, a neighbourhood wood-fired place, and the whole thing is live:
<https://tabletap-web.vercel.app>.

This document is not a feature list; the [README](../README.md) is that. It is four problems where
the obvious answer was wrong, what each of them cost, and how the mistakes were found.

## The deployment, and what it measures

Three free tiers, no payment method: the web on **Vercel**, the API on **Render**, Postgres on
**Neon**. Figures taken on 2026-09-06 against the running deployment.

| Measurement                      | Where it was taken            | Result                                             |
| -------------------------------- | ----------------------------- | -------------------------------------------------- |
| Landing page, first load         | Vercel, rendering per request | **34 s** cold, **0.6 s** warm                      |
| `GET /health`                    | Render, warm                  | **200 in 0.43 s**, reporting `db: ok`              |
| API image build                  | Render                        | **2 m 43 s**                                       |
| Dashboard after a simulated rush | the admin surface, live       | 12 orders, $627.00, 42 s average to ready, 11 open |

The 34 seconds is the API waking, not the page rendering. `apps/web/app/page.tsx` is
`force-dynamic` and awaits `GET /api/demo/links` from the server, so a sleeping Render service
blocks the first **page** rather than the first press. That is the free tier's price, it was
accepted deliberately over a keep-alive ping that would have gamed the tier and stopped the
reset-on-boot from ever running, and the landing and the README both say so in a line.

One number below is **not** from the live hosts and is labelled every time it appears: the
payment-to-kitchen latency, which was measured on the local Docker Compose stack.

## 1. From payment to the kitchen

**The problem.** An order is placed, then paid, and only a payment event may send it to the kitchen.
Two different things produce that event — a signed Stripe webhook and the demo terminal's completion
route — and the guest's browser coming back from a payment page produces nothing at all, because a
redirect is a URL the guest could have typed. The definition of done for M3 was a number: the ticket
on the board within 500 ms of settlement.

**What was decided.** One port with two adapters, and `settlePayment` in
`apps/api/src/lib/payments.ts` as the single writer of `paid` ([ADR
0010](adr/0010-payments-one-port.md)). Both adapters translate their own event shape into one
provider-neutral `SettleInput` and hand it to the same function, so the demo path exercises the
idempotency guard, the amount check, the transaction and the broadcast that carry a real payment.
The alternative — a Stripe module that owns its whole flow and a simpler demo module beside it —
would have meant the demo proved only that the demo worked.

**The ordering is the interesting part, not the speed.** 34 ms against a 500 ms budget is a fact
about a laptop and a Docker network; nobody would have guessed otherwise. What the budget actually
protects is the sequence, and the sequence took the work:

- The `processed_events` row is inserted **first**. A provider that retries — and Stripe does —
  loses the unique index and is told the work is already done, before anything else can run twice.
- The order and the payment row move inside one transaction, and the socket broadcast happens
  **after** the commit. A listener must never see an order the database could still roll back.
- Which means the event can be lost, so the board cannot treat events as the whole truth. A snapshot
  is stamped with `serverTime` before its query runs and merged over what the board holds rather
  than replacing it, so an order committed while the snapshot was in flight is not erased by a
  snapshot that could not have known about it.
- A broadcast that throws is wrapped, so it cannot answer 500 for a write that already committed.

**What it measured.** `e2e/kitchen-live.spec.ts` runs two browser contexts at once: the kitchen board
in one, a guest ordering and paying in the other. It reads the order's `paidAt` from the API, records
the wall-clock moment the ticket becomes visible on the board, and fails over 500 ms. **34 ms** on
the local Compose stack, and **30–53 ms across ten runs** when M4 measured the same path. Both are
local Compose figures. The same spec asserts the negative first: while the order is unpaid the board
must have no heading for it at all, because an unpaid ticket was never on the pass rather than merely
gone from it.

**What it cost.** Two writers would have been simpler. Instead every path that could grant `paid`
had to be closed by hand: no role can reach it through the transition API, the demo completion route
is not merely guarded but absent when Stripe is configured, and the audit trail carries three
distinct outcomes for the payments that arrive when nobody wanted them — `payment.mismatch`,
`payment.overpaid`, `payment.late`. Refunds are out of scope and are the first thing a real
deployment would need.

## 2. Revoking a printed QR code without ending a meal

**The problem.** The code on the table is a signed token ([ADR
0002](adr/0002-signed-table-token-in-qr.md)), unforgeable and deliberately long-lived: a sticker has
to outlive an hourly demo reset, so the TTL is 365 days. Unforgeable and long-lived together leave
one gap. A code that has left the building — photographed and posted, on a card that went missing,
on a table moved to another room — is valid for the rest of the year, and the only lever that existed
was rotating `TABLE_TOKEN_SECRET`, which retires every table in the restaurant at once.

What a stray code is worth bounds how bad this is, and it is worth stating plainly: it claims a
table. That is a session, a menu, orders the kitchen will cook, and sight of that table's orders. It
is not an account and it holds no money. An order sent to a table where nobody is sitting is still a
real cost to a restaurant.

**What was decided.** `tables.qr_version`, an integer on the table, carried inside the signature as
`v` ([ADR 0013](adr/0013-revocable-qr.md)). `POST /api/guest/claim` compares it against the row after
the signature verifies, and refuses on inequality — not `>=`, because a token from the future is as
invalid as one from the past and nothing mints a version a table does not have. A token with no `v`
claim reads as version 1, so every code printed before the column existed keeps working instead of
being revoked by the migration that introduced it. Reissuing is forward by one and nothing else.

**The asymmetry is the decision.** Printed codes die at once — including the card in the operator's
own hand, which is why the control asks the question before it acts. Sessions already in progress
continue, because a guest who has claimed the table holds a signed `tt_guest` cookie naming their
session, and the table token is never consulted again for the rest of that meal. The people sitting
at the table are exactly the ones a revocation is not aimed at, and a feature that ended their meal
to retire a lost card would be worse than the problem.

**What it cost.** Three things, all written down rather than discovered later:

- Reseeding recreates tables at version 1, so an hourly demo reset revalidates a code that was
  deliberately retired. Correct for a demo that returns to a known state, surprising if it is read as
  a bug.
- The reissue is guarded on `updatedAt`, which is millisecond-precise, so two reissues inside one
  millisecond are indistinguishable to the guard. Remote from a human-paced control that asks a
  question first, and it is the same optimistic-concurrency hole as problem 4 below.
- The guest is still told less than the server said. The claim answers "This QR code is no longer
  valid. Ask staff for a new one."; the web maps by error code alone and shows "This QR code is not
  valid." — the same sentence a forged token gets, with no instruction to ask staff. It is the one
  loose end in the decision and it is on the backlog.

`e2e/admin.spec.ts` proves the link worked **before** the reissue and only then that it stops. Without
the first half the test would pass on a token that was never valid.

## 3. The boundary around a presigned upload

**The problem.** An admin puts a photograph on a dish. Proxying two to five megabytes through the API
is the obvious shape and the wrong one: platform body limits sit below that, and the bytes would
travel through a Node process whose only interest in them is whether they are an image of a plausible
size ([ADR 0012](adr/0012-object-storage-uploads.md)). So the browser uploads straight to the store —
which means the API never sees the file, and something else has to stop a 500 MB upload, a
`text/html` payload, or a dish pointing at another dish's object.

**What was decided.** The server chooses everything about the key. `photoKey` builds
`menu/<itemId>/<uuid>.<ext>` from the item id and the content type, never from the file's own name,
which is attacker-controlled text that would carry the caller's path into the bucket. The URL is
signed for one key, one content type and sixty seconds, and the content type goes into the signature
through the presigner's `signableHeaders` — so a browser that sends `content-type: text/html` against
a URL signed for a JPEG gets a signature mismatch from the store rather than a 200 and a stored HTML
file in a world-readable prefix.

**One anchored pattern, three enforcement points.** The shape lives once, in
`apps/api/src/storage/types.ts`, and is checked wherever a key could enter the system from anywhere
but `photoKey`:

1. **At signing.** `presignPut` re-derives the shape, narrowed to the one extension this content type
   may carry, and refuses to sign anything else. A route that passed a key straight from a request
   body could otherwise let a signed-in member of staff write anywhere in the bucket.
2. **At confirmation.** `isPhotoKeyFor(id, key)` runs before the object is even asked about, and the
   `id` it uses is the one that just passed the ownership check — so no object outside this dish's own
   folder can be confirmed.
3. **On a key recovered from a stored URL.** A delete has to get the key back out of the `image_url`
   the row carries, and a row can hold a URL this code never wrote. The recovered key is checked
   against the same shape before anything is removed; null means "not ours to delete", never "no
   photograph".

**The escape it closes.** `menu/<id>/../<other>/x.jpg` passes `key.startsWith('menu/' + id + '/')`
and still leaves the folder. A backend that collapses dot segments resolves it to another dish's
object, and a browser normalises the `..` away before fetching, so a guest would be served bytes this
server never checked. The pattern is anchored at both ends, and the item id is compared as a string
rather than interpolated into the regex, so a caller cannot smuggle a pattern in either.

**A signature cannot express a ceiling**, which is the part that surprised. SigV4 signs an exact
`content-length` or none at all; `content-length-range` belongs to presigned POST policies, not to a
presigned PUT. So until the confirmation step has run, the upload is an unbounded file in a public
prefix. `checkUpload` closes it with a `HeadObject`, refuses anything missing, over 5 MB or not a
JPEG, PNG or WebP, and **deletes whatever it refuses**. An absent `ContentLength` is carried as a
null size all the way to that check rather than read as a zero-byte object, because zero would sail
through the one comparison that bounds an unbounded upload.

**What it cost.** An upload nobody confirms is an orphan, and there is no sweep — four ways to make
one, of which the hourly demo reset is the only one that fires on a timer. It is on the backlog with
its trigger rather than half-built. And the deployed demo turns the whole surface off
(`DEMO_UPLOADS_ENABLED=false`): every other action a visitor can take is undone by the next reset,
and putting a file on storage somebody is answerable for is not.

## 4. A bug that existed only on the real database

**The problem.** It passed every test.

Two people editing the same menu row is answered with 409 `CONFLICT`, decided by an
optimistic-concurrency guard inside the `UPDATE`'s own `WHERE`: read the row, then write it back with
`WHERE id = $1 AND updated_at = $2`, where `$2` is the `updatedAt` just read. Drizzle serialises a
JavaScript `Date` through `.toISOString()`, which carries three fractional digits. Postgres's default
`timestamp` precision is six. So a row whose `updated_at` came from the column's own `now()` default
stores microseconds, the guard compares three digits against six, and finds nothing — for ever. Not a
flaky conflict: a **permanent** one, on a row nobody else had touched.

The rows that would have been stuck are the ones an operator created on the live system. The seed
writes its timestamps as JavaScript `Date`s, so the demo menu would have edited fine; `createItem`
and `createCategory` insert without an `updatedAt` and let the column default supply it, so a dish an
admin had just added could never be edited again.

**Why the tests were silent.** The API and database suites run on PGlite ([ADR
0003](adr/0003-pglite-tests-compose-e2e.md)), and PGlite's clock is coarser than real Postgres's. A
`now()` there returns milliseconds — verified directly rather than assumed: `select now()` on a fresh
PGlite instance answers `2026-09-07 04:30:09.779+03`, three digits, and an inserted default lands the
same way. The microsecond digits that break the comparison were always zero, so the comparison always
matched.

**The fix was the column, not the call sites.** Migration `0005_timestamp-precision.sql` pins every
`created_at` and `updated_at` to `timestamp (3)`, and the `timestamps` helper in
`packages/db/src/schema/helpers.ts` carries the reason where a schema author will read it. Rounding
the `Date` at each call site, or writing `date_trunc` into each guard, would have worked once and
required every future writer to know. Making the column round-trip exactly what a JS `Date` can hold
means no call site needs to know anything.

The property is pinned by a test that writes `'2026-03-14 09:26:53.123456+00'` into the column by
hand and then runs the real guard against the value read back. Writing the six digits explicitly is
what makes the test independent of the clock that hid the bug in the first place.

**What it cost.** Milliseconds are now the resolution of the guard, so two writes to one row inside a
millisecond are genuinely indistinguishable and a stale write can win. That is inherent to a
timestamp-based guard rather than to this fix; a version counter or `xmin` closes it everywhere at
once, and it is on the backlog, found independently by three reviewers. The migration also takes
`ACCESS EXCLUSIVE` and rewrites three tables — harmless against a database with no rows in it, worth
knowing before it ever meets one that has.

## Measuring a property on a system you do not control

The rate limiter is meant to give each visitor their own bucket. Across two providers that cannot
rest on trusting a proxy: the web's call to the API leaves one network and arrives at the other as
ordinary internet traffic from an ordinary public address. So the web signs the visitor's address
with a secret the API shares, and the API honours a forwarded address only when that signature
verifies. Whether it holds on the live hosts is not something a test suite can answer, so it was
measured against the running deployment. The first four attempts were wrong, and how they were wrong
is the most transferable thing in the milestone.

Each of them inferred bucket state from HTTP status codes across a sliding one-minute window, on the
assumption that the address the API keyed on was the same address twice. It was not. Render fronts
its services with Cloudflare, whose edge addresses are public and therefore outside `TRUST_PROXY`, so
`request.ip` is whichever edge node happened to serve that request — `141.101.76.191`, then
`172.70.242.93`, then `162.158.87.241`. Every probe was measuring that drift rather than the
property, and each attempt produced an answer that did not survive its own control.

Three changes settled it in one run. `@fastify/rate-limit` returns `x-ratelimit-remaining` on every
response, so the counter can be read instead of inferred from a refusal that has several possible
causes. The drift that was ruining the measurement is itself the discriminator — a signed address is
one stable key and a fallback address is not — so the check stopped testing the fallback and tested
the property directly. And the positive control ran inside the same minute as the negative one,
against `POST /api/demo/rush`, which allows two a minute: **signed `200, 409, 429` against unsigned
`409, 409, 409`.** Only the `429` carries the finding; the `409`s are "a rush is already running".
Half B also reaching `429` would mean a bare header picks a bucket, and half A never reaching it
would mean the signature never verifies and every visitor shares one — the check states both
directions, because a check that calls a healthy deployment broken is worse than no check at all.

The lesson generalises past rate limits: read the number the system reports rather than inferring it
from a status code, ask what state the measurement was taken in, and put the control in the same run
as the experiment.

## How it was built

Six milestones — foundation, the guest flow, the kitchen display, payments, the admin surface, and
this one. Each began with a design spec the owner approved, became a plan of numbered tasks, and each
task was implemented and then **reviewed by a separate agent that had not written it**, against the
spec and against the diff. Decisions with consequences went into an ADR; everything noticed and
deliberately not done went into [the backlog](backlog.md), which is now longer than some of the
milestones and is the honest part of the repository.

The review-after-every-task rule paid for itself in a specific way: reviews caught things tests
could not, because the tests were part of what needed reviewing.

- **A green number that was true of the fixture rather than of the product.** Lighthouse scored the
  kitchen board 100 for accessibility while a `cooking` badge on that surface measured 1.60:1 —
  effectively illegible across a room. The seeded board had no cooking ticket, so the audit never saw
  it. The fix required re-running the audit with a cooking ticket deliberately on the board.
- **A test that passed because it bypassed the thing it protected.** The upload flag's route tests
  handed a hand-built config straight to the app, so the parser that makes `DEMO_UPLOADS_ENABLED=false`
  mean false never ran. Reverting the schema to a coercion that reads every non-empty string as true
  would have left every one of those tests green.
- **A correction that would have shipped a new failure.** A fix for the badge above was specified as a
  one-word swap, correct for the kitchen surface and 3.58:1 on the guest receipt, where the same
  badge renders on a different fill. The implementer measured both surfaces, refused the instruction,
  and shipped a surface-scoped override plus a test that gates all fourteen pairings by measured
  contrast on both.
- **A runbook check that would have called a correct deployment broken.** Three separate instances in
  the deployment document, from three different lines of reasoning: a check that told the reader to
  find a WebSocket on a page that opens none, a check whose expected result contradicted the check
  above it, and one that read a 401 from a route requiring a role as evidence the private route was
  down. Both directions have to be asked of every check — would this call a correct deployment a
  failure, and would it call a broken one healthy?

Two things are worth saying about the tests themselves. The API and database suites run on PGlite, so
nothing needs a container and the suite is fast — and problem 4 above is the price of that: an
embedded engine is not the engine production runs. Compose plus Playwright plus a Lighthouse audit is
what closes that gap, and it is run by hand against a stack built from scratch before every merge.
The other is a known limit rather than a boast: `e2e` and the Lighthouse audit are not in a task's own
gate, which is how a UI change once broke two end-to-end specs and was found by an unrelated task
three tasks later.

## What is not here

Refunds. A waiter surface, though the rights exist for one. Multi-restaurant tenancy, which is a
stated non-goal and would need `GET /api/tables` scoped by restaurant before anything else. A shared
store for rate limits and Socket.io rooms, which matters from the second instance onward and has that
as its written trigger. Secret rotation as a `kid` header, which is the only lever that retires every
table's code at once. All of it is on [the backlog](backlog.md), with the reason each is there.
