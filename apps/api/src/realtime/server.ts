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
 * passes through the public schema so `guestSessionId` stays inside the API.
 */
export const realtimePlugin = fp(async (app: FastifyInstance) => {
  const io: RealtimeServer = new Server(app.server, {
    cors: { origin: app.config.WEB_ORIGIN },
    serveClient: false,
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
    void socket.join(p.kind === 'staff' ? SOCKET_ROOMS.kitchen : SOCKET_ROOMS.table(p.tableId));
    socket.on('subscribe', async (ack) => {
      if (typeof ack !== 'function') return;
      const orders =
        p.kind === 'staff'
          ? await listOrders(app.db, { restaurantId: p.restaurantId, active: true })
          : await listOrders(app.db, { guestSessionId: p.guestSessionId });
      ack({
        orders: orders.map((o) => OrderDtoSchema.parse(o)),
        serverTime: new Date().toISOString(),
      });
    });
  });

  const publish = (event: 'order:created' | 'order:updated') => (order: InternalOrderDto) => {
    io.to(SOCKET_ROOMS.kitchen)
      .to(SOCKET_ROOMS.table(order.tableId))
      .emit(event, { order: OrderDtoSchema.parse(order) });
  };
  app.orderEvents.on('order:created', publish('order:created'));
  app.orderEvents.on('order:updated', publish('order:updated'));
  app.orderEvents.on('demo:reset', () => io.emit('demo:reset'));

  app.decorate('io', io);
  app.addHook('onClose', async () => {
    io.disconnectSockets(true);
    await io.close();
  });
});
