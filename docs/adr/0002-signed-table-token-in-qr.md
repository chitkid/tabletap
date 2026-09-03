# ADR 0002: The QR code carries a signed table token, not a table id

Date: 2026-09-02
Status: accepted

## Context

A guest starts by scanning the QR sticker on the table. The URL behind it has to tell the API which table the guest is at.

If the URL carried the table id (or worse, the table number), anyone could edit it. Sitting at table 3 and claiming table 11 would be a matter of changing one character — enough to send an order to someone else's bill, or to watch another table's orders once M2 and M3 land. The QR is printed on a sticker in a public room; it is not a secret and cannot be treated as one. What it can be is _unforgeable_.

## Decision

The QR encodes `${WEB_ORIGIN}/t/<token>`, where the token is a JWT signed with HS256 (`jose`) using `TABLE_TOKEN_SECRET`.

- Header: `alg: HS256`, `typ: "tt-table"` — the custom `typ` is checked on verification, so a token minted for anything else does not pass.
- Claims: `sub` = table id, `rid` = restaurant id, `tn` = table number, `iat`, `exp`.
- TTL from `TABLE_TOKEN_TTL_DAYS`, default 365 days. Printed stickers have to outlive a demo reset, so a short lifetime would mean reprinting.

`signTableToken()` and `verifyTableToken()` live in `packages/shared/src/server/table-token.ts`, exported as `@tabletap/shared/server` — a Node-only subpath the web app is forbidden to import (an ESLint `no-restricted-imports` rule in `apps/web` enforces it). The API and the seed use them; the browser never sees the secret.

`POST /api/guest/claim` verifies the signature and expiry, then checks the database: the table must exist, be active, and belong to the restaurant named in `rid`. A valid signature alone is not enough — a token for a table that has since been deactivated is refused. Verification failures map to `TOKEN_INVALID` (401) or `TOKEN_EXPIRED` (401); a table that fails the database check gives `NOT_FOUND` (404).

## Consequences

- The table a guest is bound to comes from the server, not from anything the client can type. Guards scope by `principal.tableId`, never by a path parameter alone.
- A demo reset does not invalidate a printed QR code. `seed --reset` deletes and re-inserts every row, but the ids are derived from natural keys rather than minted (`packages/db/src/seed/ids.ts`): table 7 of `little-furnace` keeps the same uuid across every reset, so a token signed a year ago still resolves to a table that exists. That is what makes the 365-day TTL above honest rather than aspirational.
- Changing `TABLE_TOKEN_SECRET` invalidates every printed QR code. In the demo that is a reseed; for a real deployment it would mean reprinting the stickers. It is the only thing that does.
- There is no key rotation: the tokens carry no `kid`, so two secrets cannot be live at once. Rotation is in `docs/backlog.md` alongside admin-triggered QR regeneration (M5).
- A 365-day token in a public place is a long-lived credential for _one table_. It grants nothing except the right to open a session at that table, and the session itself expires in hours.
