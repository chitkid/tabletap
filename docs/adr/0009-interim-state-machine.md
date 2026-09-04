# ADR 0009: An interim order state machine until payments exist

Date: 2026-09-04
Status: accepted

## Context

The master brief's order lifecycle is `placed → paid → cooking → ready → served`, with `cancelled` reachable from the early states. The `paid` step belongs to Stripe: the webhook that receives `checkout.session.completed` is what sets it, and that webhook is M4.

M3 is the kitchen display, and it ships before M4. Read literally, the brief's machine makes the milestone undemonstrable. A guest places an order, the ticket appears on the board within half a second — and then nothing can happen to it, because the only edge out of `placed` is a payment nobody can make. The board's whole reason to exist is the bump control, and the bump control would be dead on every ticket until the milestone after this one.

Three ways out were on the table. Fake a payment — a demo button, or a `paid` transition exposed on the API — which puts a lie in the audit log and leaves a route that M4 has to find and delete. Ship M3 with a board that only watches, and prove the transitions in M4 — which defers the interesting half of the milestone and leaves the socket layer, the concurrency guard and the timer thresholds untested against real use. Or admit that in a product with no payments yet, an order is cookable as soon as it is placed.

## Decision

**`placed → cooking` is an allowed edge for as long as no payment exists.** The owner took this on 2026-09-03. `ORDER_TRANSITIONS.placed` in `packages/shared/src/orders.ts` reads `['paid', 'cooking', 'cancelled']`, with a comment naming this ADR at the line itself.

The edge is narrow on purpose. `placed → ready` stays closed, so a ticket still has to pass through the pass. `TRANSITION_RIGHTS` gives the edge to the roles that would have it anyway — kitchen and admin may set `cooking`, `ready`, `served` and `cancelled`; waiter may set only `served` and `cancelled` — and every transition still passes all three checks in order: `can(role, 'orders.transition')` from the RBAC matrix, the role's right to the target status, then `canTransition(from, to)`.

**Nobody sets `paid` through the API.** `paid` appears in no role's `TRANSITION_RIGHTS`, so the 403 comes from the rights check before the machine is ever consulted. The status, its `paid_at` column and its `paid → cooking` edge all exist and are exercised by the shared tests; `apps/api/src/lib/transitions.ts` even lists `paid: 'paidAt'` in its `STAMP` map, marked as unreachable in M3. The shape M4 needs is already there, waiting for the only actor entitled to use it. The board reflects the same thing: its New column holds `placed` and `paid` together and the status chip tells them apart, so an order that arrives already paid needs no new column.

**M4 owes the removal.** This is a dated loan, not a design. When the Stripe webhook lands, M4 must:

1. Remove `'cooking'` from `ORDER_TRANSITIONS.placed` in `packages/shared/src/orders.ts`, leaving `['paid', 'cancelled']`.
2. Update the M3 tests that assert the edge — the "allows placed → cooking while payments do not exist (ADR 0009)" case in `packages/shared/src/orders.test.ts`, the `['kitchen', 'placed', 'cooking', true]` row of its `canRoleTransition` table, the transition-service and route tests in `apps/api` that bump a freshly placed order straight to `cooking`, and the web board-store fixtures that start a ticket in `placed`.
3. Narrow the board's New column to `paid` only (`COLUMNS` in `apps/web/lib/board-store.ts`, and the `placed` entries in `NEXT_STATUS` and `BUMP_LABEL`), because a placed-but-unpaid ticket is no longer something a cook may start.
4. Set this ADR's status to superseded.

## Consequences

- The M3 demo shows the entire loop without a card: scan, order, watch the ticket land, start it, mark it ready, and see the guest's phone say "Order #42 is ready." That is the milestone's definition of done, and it is reachable.
- The audit log stays honest. A ticket that went from `placed` to `cooking` says exactly that, with the cook who did it; nothing pretends money moved.
- The interim edge is a real hole for as long as it is open: a kitchen member can cook an unpaid order. Acceptable because in M3 there is no payment to skip — every order is unpaid — and unacceptable the moment M4 exists, which is what the obligation above is for.
- An M4 reviewer has one concrete thing to check before merging payments: that `ORDER_TRANSITIONS.placed` no longer contains `'cooking'`. If the tests listed above still pass unchanged, the removal did not happen.
- Until then the `paid` status is dead in production and alive in the tests. That is deliberate — the alternative is discovering in M4 that the column, the edge and the DTO field were never exercised.
