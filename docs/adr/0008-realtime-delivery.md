# ADR 0008: Real-time delivery — Socket.io rooms, a token handshake, a snapshot on connect

Date: 2026-09-04
Status: accepted

## Context

M3 puts a guest's order on the kitchen screen in under half a second and then keeps two screens — the board and the guest's phone — agreeing about the same order while both are open. That is a push problem, and the brief names Socket.io for it.

The tempting shape is to move the writes onto the socket too: the cook presses Start, the board emits a `transition` message, the server acks. It is one round trip and it looks tidy. It is also a second front door into the domain. Everything that guards `POST /api/orders` today — the RBAC matrix, Zod validation, the rate limiter, idempotency keys, the audit row — lives in the Fastify request pipeline, and a socket message reaches none of it. Either that stack is re-implemented for messages, or the socket path is quietly weaker than the REST path.

The other half of the problem is where the socket may connect at all. ADR 0004 put the REST API behind the Next.js rewrite so session cookies stay first-party, and it did that precisely because Vercel's rewrites do not proxy WebSockets. The socket therefore cannot ride the same path, and the first-party cookie it would want for authentication is not sent cross-site.

## Decision

**Socket.io pushes, REST mutates.** Every write is still an HTTP request through the proxy, with the whole guard stack in front of it. The socket carries exactly three server-to-client events (`order:created`, `order:updated`, `demo:reset`) and accepts exactly one client-to-server message (`subscribe`); anything else a client sends is ignored. The event map lives in `packages/shared/src/events.ts` and types both ends.

**The seam is an emitter, not a socket handle.** `apps/api/src/lib/order-events.ts` declares `OrderEvents`, a typed `EventEmitter` decorated onto the app as `app.orderEvents`. `createOrder`, `transitionOrder` and the rush generator emit into it after their transaction commits; `apps/api/src/realtime/server.ts` is the only subscriber and the only module that knows a socket exists. Emitting after the commit means no broadcast can roll a write back, and the API tests can assert that a route emitted the right thing without opening a socket at all. It is not full isolation: an emitter dispatches synchronously, so a listener that threw — `publish` re-parses each payload, and a parse can throw — would surface as a 500 on a request whose row is already changed. Wrapping the listener is on the backlog.

**The handshake carries its own credential.** `POST /api/socket-token` sits behind `requireAuthenticated()` on the proxied REST path, where the cookie is first-party and the principal already resolved. It mints an HS256 JWT with header `typ: 'tt-socket'`, subject the user or guest-session id, and a sixty-second expiry, signed with `SOCKET_TOKEN_SECRET` — a secret of its own, not the cookie secret and not `TABLE_TOKEN_SECRET`. `apps/web/lib/socket.ts` builds the client with an `auth` callback rather than a fixed value, so a fresh token is fetched before every connection attempt, reconnects included; sixty seconds is long enough to complete a handshake and far too short to be worth stealing.

Two properties do real work here. The token is **typed**: `verifySocketToken` passes `typ` to `jwtVerify`, so a table token out of a QR code (`typ: 'tt-table'`) cannot open a socket, and a socket token cannot claim a table. And it is **short-lived**, which is what makes it safe to hand to a browser that will put it in a WebSocket URL's handshake rather than in a cookie the browser protects.

**Rooms are assigned by the server.** The handshake middleware in `realtime/server.ts` verifies the token, stores the `SocketPrincipal` on `socket.data`, and the connection handler joins the room the principal implies: `kitchen` for staff, `table:<tableId>` for a guest. Clients never name a room, so a guest cannot subscribe to another table by any client-side means. Broadcasts go to `kitchen` and to `table:<order.tableId>` together, and every payload is re-parsed through the public `OrderDtoSchema` on the way out, which is what keeps `guestSessionId` inside the API.

**State comes from a snapshot, not from a replayed log.** A client emits `subscribe` and the server answers through the ack callback with everything it should currently show — active orders for the restaurant if the principal is staff, the session's own orders if it is a guest — plus the server's clock. That runs on every connect, so a reconnect and a first connect are the same code path and there is no gap to reconcile. Between snapshots, `applyEvent` in `apps/web/lib/board-store.ts` ignores any event whose `updatedAt` is older than the copy it holds, so an event that overtakes another across a reconnect cannot move a ticket backwards.

**Bumps are optimistic and resync when they lose.** Pressing Start moves the ticket immediately and then posts the transition. If the post fails — usually because another screen moved it first and the API answered 409 `INVALID_TRANSITION` with the current status — the board drops the optimistic status, says "Couldn't move #42. It is Cooking now.", and re-subscribes rather than trying to patch its way back to the truth.

**One process, for now.** The Socket.io server uses the default in-memory adapter. Two API instances would each hold their own rooms and a broadcast from one would never reach a board connected to the other. A multi-instance deployment therefore needs the Redis adapter; that is deployment work and is on the backlog for M6.

**The `resolvePrincipal` extraction is withdrawn.** M1's review recommended pulling the cookie-unsign plus `resolvePrincipal` pair into one reusable helper before M3, on the assumption that the socket handshake would have to repeat it. It does not. The handshake reads a token, not a cookie jar, and the token is minted by a route that has already run the normal principal pipeline. There is nothing left to share, so the recommendation is closed rather than carried forward.

## Consequences

- The browser talks to two origins: the web origin for REST through the rewrite, the API origin for the socket. `NEXT_PUBLIC_API_ORIGIN` is what points at the second, and like every `NEXT_PUBLIC_*` it is baked in at build time — the web image must be rebuilt to move the API, which is the same constraint `API_URL` already carries (ADR 0004).
- The API must be reachable from the browser directly, not only from the Next server. Its Socket.io CORS origin is `WEB_ORIGIN`, the same value REST uses, so a wrong `WEB_ORIGIN` now breaks the board as well as sign-in.
- One more secret in every environment. `SOCKET_TOKEN_SECRET` is required by `apps/api/src/config.ts` with a 32-character minimum, so a deployment that forgets it fails to boot rather than failing to authenticate.
- `demo:reset` is the only event broadcast to every socket. Everything else is addressed to a room, which is the invariant a reviewer should check first when a new event is added.
- A board that reconnects is cheap but not free: every reconnect runs the active-orders query again. Fine at one restaurant and a two-hundred-row limit; it is the first thing to reconsider if the board ever holds hundreds of tickets.
- Because the socket is delivery only, an event arriving out of nowhere cannot corrupt state that the API did not already write. The worst a bad event can do is show a stale ticket until the next snapshot.
