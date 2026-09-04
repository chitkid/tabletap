# ADR 0011: The demo payment provider

Date: 2026-09-04
Status: accepted

## Context

There are no Stripe keys. The owner confirmed it on 2026-09-04, and it is not a temporary state of the afternoon: this is a portfolio project on one machine, and asking a reader of the repository to register with a payment processor before the demo does anything is not a demo.

M4's whole point, though, is that an order becomes `paid` and only then reaches the kitchen ([ADR 0010](0010-payments-one-port.md)). Without something to pay with, the milestone leaves a guest surface whose only button opens a session with nobody, a kitchen board whose New column is permanently empty, and a settlement function nothing on this machine ever calls. The M3 board could at least be demonstrated with the interim `placed → cooking` edge; M4 closes that edge, and closing it without providing a way to pay would make the product undemonstrable — the exact trap [ADR 0009](0009-interim-state-machine.md) was written to avoid a milestone earlier.

The Stripe adapter itself is not the problem. It is written, and its signature verification is tested against fixtures signed with a local secret, so it needs no network and no account. What is missing is a way to get from a guest's phone to a signed callback, which is precisely the part that requires an actual payment processor.

Three options. Ship the Stripe adapter alone and demonstrate the milestone with `curl` against the webhook — honest, and it turns the demo into a terminal session. Add a `POST /api/orders/:id/pay` that just sets the status — cheap, and it puts a lie in the audit log plus a route that grants `paid` to any client. Or write a second adapter that is openly a stand-in and admits it on screen.

## Decision

**A second adapter behind the same port, and it opens a session with nobody.** `createDemoProvider` in `apps/api/src/payments/demo.ts` implements the `PaymentProvider` interface in about ten lines. `createSession` returns `{ url: '/pay/<orderId>', providerSessionId: 'demo:<paymentId>' }` — a path in this application rather than an absolute URL somewhere else, which the Pay button follows without knowing the difference. `readEvent` throws `PaymentSignatureError` unconditionally, because the demo provider has no webhook and a callback claiming to be from it is not something to parse.

**The terminal is honestly fake.** `/pay/[id]` renders the restaurant's own card terminal — the amount at display size, a dead keypad that is `aria-hidden` because a screen reader announcing twelve inert buttons would be describing a machine that is not there, and two buttons of equal weight. Where a bank page would put the card number, this one puts "This is a demo. No card, no money." There is no payment-network mark, no card field and no bank chrome, because a portfolio screen that imitates a real bank page is a lie told with better CSS. Decline sits beside Pay at the same size: the unhappy path is part of what this demo is showing, not something to hide behind a link.

**The completion route exists only where there is nothing real to stand in for.** `apps/api/src/server.ts` registers `demoPaymentRoutes` under one condition:

```ts
if (config.paymentProvider === 'demo' && config.demoMode)
  await app.register(demoPaymentRoutes, { prefix: '/api' });
```

Both halves matter. `config.paymentProvider === 'demo'` means a deployment with Stripe keys has no such endpoint at all — not a guarded one, not a 403, absent from the routing table. `config.demoMode` keeps it out of a demo-less deployment that simply has not been given keys yet. The `/pay/[id]` page is registered either way, because Next.js has no equivalent switch, but it is harmless: it 404s for any order that is not `placed`, no guest is ever handed its URL when Stripe is live, and the route its buttons post to does not exist.

**Whichever button lands first settles the attempt.** `POST /api/payments/demo/complete` builds a `SettleInput` with `eventId = 'demo:<paymentId>'` — one id per attempt, with the outcome deliberately left out of it. Pressing Pay and then Decline on the same attempt is therefore a replay, not a way to walk a paid order back to `failed`. Pressing the same button twice is a replay too. An order that is already paid answers `{ ok: true }` rather than a 409, because a guest returning to a tab left open while the kitchen got on with it has not made a mistake, and `PAYMENT_REQUIRED` would assert the opposite of the truth. An attempt that is genuinely over — a decline, then the back button — answers 409, and the terminal responds by opening a fresh attempt and settling that, which is what a real terminal does when you tap the card again.

**Every row it writes says `demo`.** The `payments` row carries `provider = 'demo'`, the `processed_events` row carries the same, and each audit row's payload names the provider and the event id. Nothing in the database claims a card was charged.

**Simulate rush uses the same fiction, out loud.** A rush exists to fill the board, and the board holds paid tickets, so `apps/api/src/lib/rush.ts` inserts each order together with a `succeeded` `demo` payment row and a `payment.succeeded` audit row whose payload reads `{ provider: 'demo', source: 'rush' }`. It is the one path that writes `paid` without going through `settlePayment`: it does the whole thing in one transaction with a `system` actor, and there is no event to settle because there was never an attempt. The alternative — driving twelve fake webhook deliveries through the settlement — would buy nothing but a slower rush and a dozen `processed_events` rows about money that does not exist.

## Consequences

- **The demo grants `paid` to a guest-authenticated call, and that is exactly why the route cannot exist in a Stripe deployment.** `POST /api/payments/demo/complete` is guarded — `requireGuest()`, the order must belong to the caller's session, it must be `placed`, it must have a pending attempt, ten calls a minute per guest cookie — but the guard is on _who_, not on _whether money moved_, and no guard can fix that, because in demo mode no money moves. The registration condition is the real control. A reviewer's concrete check: with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` both set, `POST /api/payments/demo/complete` must 404.
- The audit log stays readable. Someone reading `payments` and `audit_log` a year from now can tell demo settlements from real ones by the provider column alone, without knowing which deployment wrote them or when the keys arrived.
- The demo exercises production's settlement rather than bypassing it. The `processed_events` insert, the amount comparison, the order-and-payment transaction and the post-commit broadcast all run on this machine, every time someone presses Pay — which is what makes the local e2e evidence about the code that would carry a real payment. The Stripe adapter's own two jobs, building a Checkout session and verifying a signature, are the part that stays covered by fixtures alone until a key exists.
- One combination is a dead end: the demo provider with `DEMO_MODE=false`. The Pay button opens an attempt and sends the guest to `/pay/<id>`, and the route the terminal posts to is not registered, so the payment cannot be completed by anyone. It is a misconfiguration rather than a mode — a deployment with no keys and no demo has no way to take money by design — but it fails late and quietly instead of at boot. On the backlog.
- Replacing the stand-in is a configuration change, not a code change. Set both Stripe variables and the provider resolves to `stripe`, the demo routes stop being registered, and the guest's Pay button starts answering an absolute URL at Stripe instead of a path here. Nothing in `settlePayment`, the audit vocabulary, the board or the guest copy is aware of the difference.
