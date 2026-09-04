import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Server } from 'socket.io';
import {
  OrderDtoSchema,
  SOCKET_ROOMS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@tabletap/shared';
import {
  SocketTokenVerifyError,
  verifySocketToken,
  type SocketPrincipal,
} from '@tabletap/shared/server';
import { listOrders, type InternalOrderDto } from '../lib/orders';

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  { principal: SocketPrincipal }
>;

/**
 * How long a socket must wait between two subscribes. Each one runs the active-orders query, and
 * `@fastify/rate-limit` never sees a socket message, so the throttle lives here. A subscribe that
 * arrives sooner is acked `null`, which the client already knows how to retry.
 */
export const SUBSCRIBE_MIN_INTERVAL_MS = 1_000;

/**
 * engine.io's defaults (25 s ping interval, 20 s timeout) mean a board can sit dead for the better
 * part of a minute before it says so. A kitchen screen is read from a metre away and has to admit
 * within seconds that it is no longer the truth.
 */
const HEARTBEAT = { pingInterval: 10_000, pingTimeout: 5_000 } as const;

/** socket.io surfaces `err.data` on the client's connect_error; the code goes there. */
const handshakeError = (code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED') =>
  Object.assign(
    new Error(
      code === 'TOKEN_EXPIRED' ? 'Your connection token expired.' : 'This connection is not valid.',
    ),
    { data: { code } },
  );

/**
 * Delivery only. Rooms come from the token's principal, never from the client; every payload
 * passes through the public schema so `guestSessionId` and `restaurantId` never appear in a
 * payload sent to a client.
 */
export const realtimePlugin = fp(async (app: FastifyInstance) => {
  const io: RealtimeServer = new Server(app.server, {
    cors: { origin: app.config.WEB_ORIGIN },
    serveClient: false,
    ...HEARTBEAT,
  });

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth['token'];
    if (typeof token !== 'string') return next(handshakeError('TOKEN_INVALID'));
    try {
      socket.data.principal = await verifySocketToken(token, {
        secret: app.config.SOCKET_TOKEN_SECRET,
      });
      next();
    } catch (err) {
      next(handshakeError(err instanceof SocketTokenVerifyError ? err.code : 'TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const p = socket.data.principal;
    void socket.join(
      p.kind === 'staff' ? SOCKET_ROOMS.kitchen : SOCKET_ROOMS.session(p.guestSessionId),
    );
    let lastSubscribeAt = 0;
    socket.on('subscribe', async (ack) => {
      if (typeof ack !== 'function') return;
      const startedAt = Date.now();
      if (startedAt - lastSubscribeAt < SUBSCRIBE_MIN_INTERVAL_MS) return ack(null);
      lastSubscribeAt = startedAt;
      // Stamped before the read, not after: the client keeps any order it knows that is newer
      // than serverTime, which is what saves an order committed while this query was running.
      const serverTime = new Date(startedAt).toISOString();
      // socket.io dispatches this listener through a plain emitter and never awaits the
      // promise it returns, so an uncaught rejection here (a transient DB error, say) would
      // become an unhandled rejection and take the whole process down with it. Ack `null`
      // instead of leaving the client's subscribe promise hanging forever.
      try {
        const orders =
          p.kind === 'staff'
            ? await listOrders(app.db, { restaurantId: p.restaurantId, active: true })
            : await listOrders(app.db, { guestSessionId: p.guestSessionId });
        ack({ orders: orders.map((o) => OrderDtoSchema.parse(o)), serverTime });
      } catch (err) {
        app.log.error(
          {
            err,
            principal: { kind: p.kind, id: p.kind === 'staff' ? p.userId : p.guestSessionId },
          },
          'subscribe failed',
        );
        // Not an empty snapshot: a client reads a snapshot as the whole truth, so `orders: []`
        // would tell every board at once that the kitchen is empty.
        ack(null);
      }
    });
  });

  /**
   * `orderEvents` dispatches synchronously inside the request that committed the row, so a throw
   * here would answer 500 for a write that already happened. Log and move on instead.
   */
  const publish = (event: 'order:created' | 'order:updated') => (order: InternalOrderDto) => {
    try {
      const payload = { order: OrderDtoSchema.parse(order) };
      io.to(SOCKET_ROOMS.kitchen).emit(event, payload);
      // A rush order has no guest session; it reaches the kitchen and nobody else.
      if (order.guestSessionId !== null)
        io.to(SOCKET_ROOMS.session(order.guestSessionId)).emit(event, payload);
    } catch (err) {
      app.log.error({ err, event }, 'realtime publish failed');
    }
  };
  app.orderEvents.on('order:created', publish('order:created'));
  app.orderEvents.on('order:updated', publish('order:updated'));
  app.orderEvents.on('demo:reset', () => io.emit('demo:reset'));

  app.decorate('io', io);
  app.addHook('onClose', async () => {
    // Sockets first, so `close` is not left waiting on connections that will never end on their
    // own. `Server.close(fn?)` returns a promise in the installed 4.8 line (its callback is
    // optional and additional), so awaiting it is the whole story.
    io.disconnectSockets(true);
    await io.close();
  });
});
