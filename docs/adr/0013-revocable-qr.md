# ADR 0013: A table's QR can be revoked

Date: 2026-09-05
Status: accepted

## Context

[ADR 0002](0002-signed-table-token-in-qr.md) made the printed code unforgeable, and deliberately made it long-lived: `TABLE_TOKEN_TTL_DAYS` defaults to 365, because a sticker on a table has to outlive a demo reset and reprinting the room every month is not a product.

Unforgeable and long-lived together leave one gap, and M5 is the milestone that has to look at it, because M5 is the one that prints the sheet. A code that has left the building — photographed off a table and posted, printed on a card that went missing, on a table that was moved to another room — is valid for the rest of the year and there is nothing anyone can do about it. The only lever that existed was `TABLE_TOKEN_SECRET`, and rotating it retires every table in the restaurant at once.

What a code is worth is worth stating plainly, because it bounds how bad this is. Claiming a table gets a guest a session at that table: they can read the menu, place orders that the kitchen will cook, and see that table's orders. It is not an account and it holds no money — payment is per order and the demo takes none — but an order sent to a table where nobody is sitting is a real cost to a restaurant, and a stranger reading a table's orders is a real thing to want to stop.

The owner decided on 2026-09-04 that a table's code must be retirable, one table at a time, from the admin surface.

## Decision

**A version on the table, carried inside the signed token.** `tables.qr_version` is an integer, `not null default 1` (migration 0004). `signTableToken` puts it in the payload as `v` alongside the existing `sub`, `rid` and `tn`, so it is inside the signature — a client cannot strip it, edit it, or add one of its own. `POST /api/guest/claim` compares it against the row after the signature and the table's own checks have passed:

```ts
if (claims.qrVersion !== table.qrVersion)
  throw new AppError(
    'TOKEN_INVALID',
    401,
    'This QR code is no longer valid. Ask staff for a new one.',
  );
```

**A token with no version reads as version 1.** `verifyTableToken` defaults `v` when the claim is absent, so every code printed before M5 — which is every code the demo has ever handed out — keeps working instead of being read as revoked by the migration that introduced the column. The default in the column and the default in the verifier are the same number on purpose.

**Reissuing increments it.** `POST /api/tables/:id/qr` does one guarded `UPDATE` setting `qr_version = before + 1`, and writes a `table.qr_reissued` audit row carrying the number and the version it moved from and to. There is no way to set the version to an arbitrary value and no way to move it back: the only operation is _forward by one_, which is the only operation the meaning supports.

**Equality, not `>=`.** A token from the future is as invalid as one from the past. Nothing mints a version the table does not have, so the only way to hold one would be a signing key that has escaped — and in that case the tighter test is the one to have.

**The control says what it is about to do, before it does it.** The reissue is the one control on the admin surface that cannot be undone, so `QrActions` swaps the row's controls for a question that names the table and states the consequence — _"Reissue the QR for table 7? Every printed code for this table stops working immediately."_ — with `Keep the current code` as the answer that costs nothing, holding focus, reachable with Escape. No dialog opens: nothing covers the row the operator is looking at, and while the question stands nothing else on that row can be pressed by mistake.

## Consequences

- **A reissue is immediate and irreversible for anything already printed.** There is no grace period and no way back: the next scan of every card for that table is refused, including the card in the operator's own hand. The QR sheet has to be printed again and the cards replaced. That is the point of the feature, and it is why the control asks first.
- **Live sessions continue, and that is the right behaviour.** A guest who has already claimed the table holds a signed `tt_guest` cookie naming their session; the table token is not consulted again for the rest of that meal. So reissuing while a table is occupied does not interrupt an order in progress — the people sitting there are exactly the ones a revocation is not aimed at.
- **Rotating `TABLE_TOKEN_SECRET` is now the only thing that invalidates every table at once**, and it remains on the backlog as a `kid`-header exercise. Between the two levers the coverage is complete: one table, or all of them.
- **The guest is told less than the server said.** `POST /api/guest/claim` answers 401 with `TOKEN_INVALID` and the sentence _"This QR code is no longer valid. Ask staff for a new one."_, but `apps/web/components/claim-table.tsx` maps by error code alone and shows its own _"This QR code is not valid."_ for that code. So a guest holding a retired card reads the same line as someone with a forged token and is never told to ask staff. Revocation wants either its own error code or the server's sentence passed through; it is on the backlog, and it is the one loose end in this decision.
- **Reissuing is guarded by `updatedAt`, which is millisecond-precise.** Two reissues of the same table inside one millisecond are indistinguishable to the guard, so both could succeed while the version moves by one and two audit rows each claim to have moved it from 1 to 2. Human-paced, from a control that asks a question first, this is remote; it is the same optimistic-concurrency hole the menu writes have, and one backlog entry — a version counter or `xmin` — closes all of them.
- **Reissuing writes an audit row; printing the sheet does not.** `GET /api/tables/qr.pdf` hands out a live token for every active table and leaves no record that it was asked for, and it carries no rate limit of its own. Both are on the backlog.
- **Reseeding revalidates.** `pnpm db:seed` recreates tables at `qr_version` 1, so a demo reset brings a bumped table back to the version its oldest printed code carries. Correct for a demo that is meant to return to a known state; worth knowing before anyone reads a reset as a bug.
