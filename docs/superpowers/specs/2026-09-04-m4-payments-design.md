# M4 Payments — Design Spec

Date: 2026-09-04. Status: implemented on `feat/m4-payments` (2026-09-04); the deviations decided while building are recorded in §9 below. Verified locally against Docker Compose: e2e 6/6 with a payment-to-kitchen latency of 30-53 ms against the 500 ms budget across six runs, the offline banner in 7-9 ms, Lighthouse accessibility 100 on the landing, the menu and the kitchen board.
Project: TableTap — QR table ordering with a real-time kitchen display (portfolio full-stack project).
Milestone: M4 of six. Builds on M1 Foundation, M2 Guest flow + Demo landing and M3 Kitchen display (all merged into `main`). The master brief remains the permanent context; this spec covers M4 only.

## 1. Goal and scope

A guest pays for their order, and only a payment event makes the order paid. The kitchen cooks paid orders and nothing else. The demo still runs end to end without a card and without Stripe keys, because the owner has none (decision of 2026-09-04): the Stripe adapter is written and tested against signed fixtures, and a `demo` provider stands in until a key is configured.

In scope:
- Payment on the guest's order screen: `POST /api/orders/:id/payment` creates a provider session for a `placed` order and answers a URL the browser follows.
- `POST /api/payments/webhook`: raw body, signature verified before anything is parsed, idempotent through a `processed_events` table, the only writer of `paid`.
- The `demo` provider: `/pay/<orderId>` renders an honest fake terminal, and `POST /api/payments/demo/complete` feeds the same settlement function the webhook uses. Both exist only in demo mode.
- The ADR 0009 removal in full: `placed → cooking` goes, the tests that assert it change, the board's New column narrows to `paid`, and ADR 0009 becomes superseded.
- Simulate rush places orders that are already paid, otherwise the narrowed board would stay empty.
- Guest copy follows the new truth: a placed order is waiting for payment, a paid order is with the kitchen.
- The landing says how payment works in this deployment: no card in demo mode, Stripe's test card when a key is set.
- Migration 0003 (`processed_events`, `payments(order_id)` index); ADR 0010 and ADR 0011; README, spec and backlog updates; e2e for the paid path and for a declined payment.

Out of scope: refunds and cancelling a paid order with money back (backlog); tips and split bills (non-goals); cash or waiter-taken payment; saved cards; Apple Pay and Google Pay; a sweeper that cancels unpaid orders after a timeout (backlog); multi-currency (`OrderDto` still carries no currency — M5).

## 2. Decisions from brainstorming

| Question | Decision |
|---|---|
| Integration shape | One `PaymentProvider` port with two adapters (`stripe`, `demo`) and one internal `settlePayment` both funnel into. The demo path therefore exercises the same idempotency, amount check and transition the Stripe path uses. Rejected: Stripe only (the demo cannot run without keys); a demo short-circuit straight to the transition (the demo would stop proving the code that carries production). |
| Order first, then payment | The order is created as `placed` exactly as in M2, then paid. `paid` is written by `settlePayment` alone; no role holds it in `TRANSITION_RIGHTS`, so the rights check refuses it before the machine is consulted. |
| Choosing the provider | `stripe` when both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set, otherwise `demo`. The demo routes are registered only when the resolved provider is `demo` and `DEMO_MODE=true`, so a production deployment with Stripe has no endpoint that grants `paid` to a client. |
| Idempotency | `processed_events` with a unique `(provider, event_id)`. The row is inserted first and the work follows; a unique violation means Stripe is retrying and the answer is 200 with nothing done. |
| Amount | Taken from the order row when the session is created and compared with the amount in the event. A mismatch does not pay the order: it writes an audit row and answers 200, because a 500 would only make Stripe retry a request that will never succeed. |
| Raw body | The webhook is registered inside its own encapsulated plugin scope with a buffer content-type parser, so raw-body parsing cannot leak into the JSON routes. This closes the M2 backlog item. |
| The return trip | `success_url` is `/orders/<id>?paid=1`. The page may still show `placed` because the webhook has not landed yet; it says "Payment received. Confirming…" and waits for the socket. The redirect is never evidence of payment. |
| Guest copy | `placed` → "Order #42 is waiting for payment." with a Pay button; `paid` → "Order #42 sent to the kitchen."; `cooking`, `ready`, `served`, `cancelled` unchanged from M3. |
| Simulate rush | Rush orders are inserted as `paid` with a `demo` payment row marked `succeeded` and a system actor, so the board has work after the New column narrows. |
| Cancellation | Unchanged from M3. Cancelling a paid order does not move money; the audit row records that no refund was made and the backlog carries the refund flow. |
| ADR 0009 | Removed in full per its own checklist, and its status becomes superseded. An M4 reviewer's concrete check: `ORDER_TRANSITIONS.placed` no longer contains `'cooking'`. |

## 3. Visual direction and the aesthetic risk (`frontend-design`)

**Direction.** The guest surface stays the printed menu card of M2. Payment adds one screen and one button, both in the same voice.

**The one risk: the demo terminal is honestly fake.** `/pay/<orderId>` is drawn as the restaurant's own card terminal — the amount at display size, a dead keypad, a Pay button and a Decline button of equal weight — and it says plainly "This is a demo. No card, no money." Why it is worth it: a screen that imitates a real bank page is a lie in a portfolio, and an honest terminal shows both taste and where the line is. Why it is a risk: a terminal can read as a toy beside the restrained guest screens. Mitigation: the brand palette and type, no payment-network logos, no card fields to type into, and Decline sitting beside Pay so the unhappy path is visible rather than hidden.

## 4. Data and contracts

### 4.1 Migration 0003

- `processed_events`: `id`, `provider` (`payment_provider`), `event_id text`, `type text`, `payload jsonb`, `received_at timestamptz`, unique `(provider, event_id)`.
- Index `payments(order_id)`.
- No column is added to `orders`: `paid_at`, the `paid` status and the `paid → cooking` edge already exist from M1.

### 4.2 Shared contracts

```ts
PaymentSessionResponse = { url: string }
PaymentProviderName    = 'stripe' | 'demo'
DemoLinksResponse     += payments: { provider: PaymentProviderName; testCard: string | null }
ORDER_TRANSITIONS.placed = ['paid', 'cancelled']          // ADR 0009 removed
COLUMNS[0]               = { key: 'new', title: 'New', statuses: ['paid'] }
NEXT_STATUS / BUMP_LABEL   lose their 'placed' entries
```
New error codes: `PAYMENT_REQUIRED` (409 — the order is not in a state that can be paid, or is paid already) and `SIGNATURE_INVALID` (400 — webhook only).

### 4.3 API

| Method and path | Guard | Behaviour |
|---|---|---|
| `POST /api/orders/:id/payment` | `requireGuest()` | The order must belong to the session and be `placed`, else 409 `PAYMENT_REQUIRED`. Creates or reuses a pending `payments` row and a provider session, answers `{ url }`. Rate limit 10/min on the guest cookie. |
| `POST /api/payments/webhook` | `config.public`, `principal: false`, own scope, buffer parser | Verifies the signature against `STRIPE_WEBHOOK_SECRET`; 400 `SIGNATURE_INVALID` when it fails. Then `settlePayment`. Always 200 once the signature holds. |
| `POST /api/payments/demo/complete` | `requireGuest()`, demo provider only | Body `{ outcome: 'paid' \| 'declined' }`. Builds a synthetic event (`event_id = demo:<paymentId>`) and calls the same `settlePayment`; a decline marks the payment `failed` and leaves the order `placed`. |
| `GET /api/demo/links` | unchanged | Gains the `payments` block so the landing and the guest screen know which provider is live. |

`settlePayment(db, events, { provider, eventId, type, orderId, paymentId, amountCents, payload })`: insert the `processed_events` row (unique violation → return "replayed"), load the order, refuse anything not `placed` (audit `payment.late`), compare the amount (mismatch → audit `payment.mismatch`, mark the payment `failed`, stop), then in one transaction mark the payment `succeeded`, set the order `paid` with `paid_at`, audit `payment.succeeded` with the actor `system`, and after the commit emit `order:updated` so the board receives the ticket.

### 4.4 Configuration

`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` (both optional; together they select the Stripe provider), and a derived `config.paymentProvider`. `.env.example` documents both, states that leaving them empty is what makes the demo run without a card, and points at `stripe listen --forward-to localhost:4000/api/payments/webhook` for a local Stripe run.

## 5. Web

- `/orders/[id]`: a `placed` order shows the headline above plus a Pay button that posts to `/api/orders/:id/payment` and follows the answered URL. `?paid=1` renders "Payment received. Confirming…" until the socket delivers the `paid` order.
- `/pay/[id]` (demo only): the terminal described in §3, posting `paid` or `declined`; on `paid` it returns to `/orders/<id>?paid=1`, on `declined` it returns with a plain "Payment declined. Try again." on the order screen.
- Landing: the payment line reads "Payments run in demo mode: no card, no money." or, with Stripe configured, gives the test card `4242 4242 4242 4242`.
- Kitchen board: the New column holds `paid` only; a `placed` ticket never reaches the board.

## 6. Security

The signature is checked before the body is parsed as anything but bytes. Secrets stay server-side; the browser only ever receives a URL. The amount is the database's, never the client's, and is re-checked against the event. `paid` has exactly one writer. A replayed event does nothing. The demo completion route is registered only when the provider is `demo`, requires the guest session that owns the order, and produces audit rows that say `demo` so no reader mistakes it for money. Rate limits: payment session 10/min per guest cookie, demo completion 10/min, webhook unlimited but signature-gated.

## 7. Testing

Unit and integration: `settlePayment` (success; replay; amount mismatch; an order that is not `placed`; a decline), Stripe signature verification against signed fixtures (valid, tampered body, stale timestamp, wrong secret), a concurrent double delivery of one event, the state machine after the ADR 0009 removal, the payment route's guards and statuses, the demo completion route's absence when the provider is Stripe, and the guest headline per status. E2E: a guest orders, pays in the demo terminal, the ticket appears on the board in New, the kitchen carries it to Ready and the guest sees it; a second spec declines the payment and asserts the board never receives the ticket.

## 8. Documents

ADR 0010 "Payments through one port, settled once" (the provider port, the single settlement path, idempotency, why the redirect is not evidence). ADR 0011 "The demo payment provider" (why it exists, what it does not pretend to be, and the exact conditions under which its routes are registered). ADR 0009 becomes superseded. README gains a payments section with the environment variables and the local Stripe recipe; the backlog gains refunds, the unpaid-order sweeper and multi-currency.

## 9. Deviations from this spec, decided while building

Recorded here so a reader of the sections above is not left wondering.

- **`OrderDto` gains `paidAt`** (§4.2 lists no contract change to the order). The payment time was computed inside the API and stripped on the way out, so nothing outside the server could tell when an order settled. The guest surface and the e2e latency budget both measure the wait for the kitchen from the payment rather than from `placedAt`, and that needs the server's own stamp. It is required and nullable beside the other stage timestamps.
- **A second demo completion answers 200, not 409** (§4.3 implies a refusal). Pressing Pay twice, or returning to a tab left open while the kitchen got on with it, is not a mistake, and `PAYMENT_REQUIRED` would assert the opposite of the truth. The route answers `{ ok: true }` whenever the order is already paid, keyed on `paidAt` so a paid order that has since moved to `cooking` answers truthfully too. A genuinely closed attempt — a decline, then the back button — still answers 409, and the terminal responds by opening a fresh attempt.
- **`startPayment` always inserts a new attempt** (§4.3 says "creates or reuses a pending `payments` row"). Reuse would have to decide what a stale pending row means, and a new row per attempt keeps the audit trail literal. The cost is orphan pending rows, which is on the backlog.
- **`settlePayment` returns five outcomes, not three.** `paid`, `declined`, `replayed`, `mismatch`, `late` and `unknown-order`. `late` and the foreign-payment rollback were both added during review: a provider can expire a second attempt for an order that a first attempt already paid, and an event can name a payment belonging to a different order. Neither pays anything, both are audited, both answer 200.
- **The decline branch only closes an attempt that is still pending.** Without the guard, a failure event arriving after a success for the same attempt walked a settled payment back to `failed`.
- **The e2e coverage is split across the two specs** (§7 puts both in one place). The paid path and the declined path are in `e2e/guest-order.spec.ts`; the assertion that the board never held the unpaid ticket is in `e2e/kitchen-live.spec.ts`, where there is a board to assert it against.
- **A late success is no longer audited as `payment.late`.** §4.3 describes only the failure side of a late event; a late success now closes the attempt as `succeeded` and audits `payment.overpaid`, while a late failure still audits `payment.late` as written above.
