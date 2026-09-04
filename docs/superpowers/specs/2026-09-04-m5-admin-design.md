# M5 Admin — Design Spec

Date: 2026-09-04. Status: approved by the owner on 2026-09-04; implementation plan pending.
Project: TableTap — QR table ordering with a real-time kitchen display (portfolio full-stack project).
Milestone: M5 of six. Builds on M1 Foundation, M2 Guest flow + Demo landing, M3 Kitchen display and M4 Payments (all merged into `main`). The master brief remains the permanent context; this spec covers M5 only.

## 1. Goal and scope

M5 hands the restaurant its own tool: the menu, the photographs, the tables and their printed QR codes, and a day's figures. Everything the demo has been seeding by hand becomes something an admin can do.

In scope:
- `/admin`: a light, dense operator shell (sidebar, top bar, no centred column), reachable only by the `admin` role.
- Menu management: categories and items, with price, description, allergens, availability and sort order, edited in place.
- Photographs: a presigned upload straight to S3-compatible storage (MinIO locally), then a confirmation step that writes `image_url`. A photo replaces the generated plate on the guest menu, as ADR 0007 already provides for.
- Tables: create, rename, deactivate; a QR sheet as a printable PDF; and **QR revocation** — a table carries a version, the version travels inside the signed token, and reissuing invalidates every printed code immediately (owner's decision, 2026-09-04).
- Dashboard: four figures for today and seven days of paid orders.
- Two debts from the backlog: the currency moves onto `OrderDto` so the guest surface stops hardcoding USD, and the admin surface's density stops shrinking its own controls.
- MinIO in Compose and in CI; migration 0004; ADR 0012 and ADR 0013; e2e, Lighthouse and README.

Out of scope: a waiter surface (it stays on the backlog with `TRANSITION_RIGHTS.waiter` still unused by any screen); multi-restaurant and i18n (non-goals); editing or refunding orders; more than one photograph per dish; analytics beyond today and a seven-day count; bulk import.

## 2. Decisions from brainstorming

| Question | Decision |
|---|---|
| Upload shape | A presigned `PUT` straight to storage: the API mints a URL with the key, the content type and a 5 MB ceiling, the browser uploads, and a confirmation call writes `image_url` only after the API has seen the object. Rejected: uploading through the API (megabytes through a request body that Vercel and Railway both cap); a plain URL field (the brief asks for upload). |
| Storage client | AWS SDK v3 with the request presigner, because the same code addresses MinIO locally and S3 or R2 in production. MinIO runs as a Compose service with public read on the menu prefix — a menu photograph is already public. |
| QR revocation | `tables.qr_version` travels in the token as a claim and is compared at `POST /api/guest/claim`. Reissuing increments it, so printed codes stop working at once; sessions already claimed continue, because they rest on the signed cookie rather than the token. The control says so plainly and asks for confirmation. |
| PDF | Generated server-side with `pdfkit`: one card per table with its number, its label and its QR. The brand face is embedded when the font package ships a TTF; otherwise the built-in Helvetica, recorded in the backlog. |
| Deleting | A category with items and a table with orders are deactivated, never deleted: both foreign keys are `restrict`, and silently cascading away order history is not a thing an admin tool should do. Only an empty category and a table with no orders can be deleted outright. |
| Dashboard | Four tiles for today — orders, revenue, average time from paid to ready, tickets open now — and seven days of paid orders as CSS bars. No chart library. |
| Currency | `OrderDto` carries the restaurant's currency; `/orders/[id]` and `/pay/[id]` stop passing the literal `"USD"`, and `startPayment` reads it from the restaurant row. |
| Density | The admin surface stops scaling `--spacing`, which was shrinking 44 px controls to about 35. Density comes from the grid and the type scale instead. |
| Public URLs | `/admin` and its sub-paths only. `/admin` was reserved in the M1 spec. |

## 3. Visual direction and the aesthetic risk (`frontend-design`)

**Direction.** Neutral TableTap chrome, light and dense: a sidebar, a top bar, a working area with no marketing rhythm. The restaurant's brand belongs to the guest surface; this is the operator's tool.

**The one risk: the menu is edited in the table itself.** No modal ever opens. A row expands in place, its fields become editable, and an explicit Save and Cancel sit in the row. Why it is worth it: an operator changes ten prices in a shift, and a dialog for each turns work into clicking. Why it is a risk: in-place editing reads as unstable, and a row that changes height makes the whole table jump under the hand. Mitigation: one row is editable at a time, the row keeps its height when it enters edit mode, Save and Cancel are always visible while editing, and a failed save restores the previous values and says which field the server refused.

## 4. Data and contracts

### 4.1 Migration 0004

- `tables.qr_version integer not null default 1`.
- Index `orders(paid_at)` for the dashboard's day and week queries.
- No destructive change: everything else M5 needs already exists.

### 4.2 Shared contracts

```ts
OrderDto += currency: string                     // three letters, from the restaurant
MenuCategoryWriteRequest = { name, sortOrder?, isActive? }
MenuItemWriteRequest     = { categoryId, name, description?, priceCents, allergens?, isAvailable?, sortOrder? }
TableWriteRequest        = { number, label, seats?, isActive? }
PhotoUploadResponse      = { url, key, expiresInSeconds }
PhotoConfirmRequest      = { key }
DashboardResponse        = {
  today: { orders: number; revenueCents: number; averageReadyMs: number | null; openTickets: number };
  week: { date: string; orders: number }[];      // seven entries, oldest first
}
```
New error code: `IN_USE` (409 — a category with items, or a table with orders).

### 4.3 API

Every route below is `requireAction('menu.write')`, `requireAction('tables.write')` or `requireAction('dashboard.read')`, so a waiter and a kitchen member are refused everywhere.

| Method and path | Behaviour |
|---|---|
| `GET /api/dashboard` | The tiles and the week, computed in SQL, scoped to the staff member's restaurant. |
| `POST`, `PATCH`, `DELETE /api/menu/categories[/:id]` | Create, edit, delete. Delete answers 409 `IN_USE` when the category holds items. |
| `POST`, `PATCH`, `DELETE /api/menu/items[/:id]` | Create, edit, delete. Delete answers 409 `IN_USE` when the item appears on any order; deactivating is the alternative the message names. |
| `POST /api/menu/items/:id/photo-url` | Answers a presigned `PUT` valid for 60 seconds, with a server-chosen key (`menu/<itemId>/<uuid>.<ext>`), a fixed content type and a 5 MB ceiling. |
| `POST /api/menu/items/:id/photo` | Confirms: the API checks the object exists, then writes `image_url`. Until it does, the dish keeps whatever picture it had. |
| `POST`, `PATCH`, `DELETE /api/tables[/:id]` | Create, edit, delete. Delete answers 409 `IN_USE` when the table has orders. |
| `POST /api/tables/:id/qr` | Increments `qr_version`, audits `table.qr_reissued`, answers the table. Every printed code for that table stops working. |
| `GET /api/tables/qr.pdf` | Streams the printable sheet. |

`POST /api/guest/claim` gains one comparison: the token's version against the table's. A mismatch answers `TOKEN_INVALID` with "This QR code is no longer valid. Ask staff for a new one."

## 5. Web

`/admin` is a server-rendered shell that reads the staff session and redirects a non-admin to `/kitchen` (a kitchen member has somewhere to be) or `/login`. Three pages: Menu, Tables, Dashboard. The menu page is the dense in-place table of §3, with the photo control on the expanded row. The tables page lists tables with their QR state and carries the two dangerous controls — deactivate and reissue — each behind a confirmation that names the consequence. The dashboard is four tiles and a week of bars.

## 6. Security

Every admin route is guarded by the RBAC matrix, and the presigned URL is the only thing the browser ever receives — never a key, never a bucket credential. The key, the content type and the size ceiling are the server's; the confirmation step is what writes `image_url`, so a client cannot point a dish at an arbitrary address. QR revocation is enforced at the claim, not in the interface. Deletions that would take order history with them are refused rather than cascaded.

## 7. Testing

Unit and integration: the object key builder and the presigned URL against a stubbed storage client (no network); the claim's version comparison (valid, stale, absent); the dashboard aggregates on PGlite, including a day with no orders; every admin route refused for `waiter` and `kitchen`; `IN_USE` on a category with items and a table with orders; the confirmation step refusing a key whose object is absent; the row editor's save, cancel and failed-save rollback. E2E: an admin signs in, adds a dish, and a guest sees it on the menu; an admin reissues table 7's QR and the old link answers that the code is no longer valid. Lighthouse adds `/admin` with an admin cookie and holds the accessibility gate at 95.

## 8. Documents

ADR 0012 "Photographs live in object storage, uploaded by the browser" (the presigned shape, why the API never carries the bytes, the confirmation step, public read on the menu prefix). ADR 0013 "A table's QR can be revoked" (the version claim, what it does to printed codes and what it deliberately does not do to live sessions). README gains an admin section, the storage variables and the MinIO recipe; the backlog loses the currency and density items and gains whatever M5 defers.
