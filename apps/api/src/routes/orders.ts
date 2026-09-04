import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActiveOrdersQuerySchema,
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeySchema,
  OrderCreateRequestSchema,
  OrderDtoSchema,
  OrderResponseSchema,
  OrdersResponseSchema,
  PaymentSessionResponseSchema,
  TransitionRequestSchema,
  can,
  type OrderDto,
} from '@tabletap/shared';
import { AppError, validate } from '../lib/errors';
import { guestKey } from '../lib/guest-sessions';
import { createOrder, listOrders, loadOrder, type InternalOrderDto } from '../lib/orders';
import { startPayment } from '../lib/payments';
import { restaurantIdFor } from '../lib/restaurant';
import { transitionOrder } from '../lib/transitions';
import { requireAction, requireAuthenticated, requireGuest } from '../plugins/rbac';

/**
 * `guestSessionId` decides who may read an order and must never reach a client. Re-parsing
 * through the public contract drops it - and anything else that is not in the contract.
 */
const strip = (order: InternalOrderDto): OrderDto => OrderDtoSchema.parse(order);

export async function ordersRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post(
    '/orders',
    {
      preHandler: requireAction('orders.create'),
      config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: guestKey } },
      schema: { response: { 200: OrderResponseSchema, 201: OrderResponseSchema } },
    },
    async (request, reply) => {
      const principal = request.principal;
      if (principal.kind !== 'guest')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const idempotencyKey = validate(
        IdempotencyKeySchema,
        request.headers[IDEMPOTENCY_KEY_HEADER],
      );
      const body = validate(OrderCreateRequestSchema, request.body);
      const { order, created } = await createOrder(
        app.db,
        { principal, body, idempotencyKey },
        app.orderEvents,
      );
      return reply.status(created ? 201 : 200).send({ order: strip(order) });
    },
  );
  r.get(
    '/orders/:id',
    {
      preHandler: requireAuthenticated(),
      schema: { response: { 200: OrderResponseSchema } },
    },
    async (request) => {
      const { id } = validate(z.object({ id: z.uuid() }), request.params);
      const order = await loadOrder(app.db, id);
      if (!order) throw new AppError('NOT_FOUND', 404, 'Order not found.');
      const p = request.principal;
      const allowed =
        p.kind === 'guest'
          ? order.guestSessionId === p.guestSessionId
          : p.kind === 'staff' && can(p.role, 'orders.read.all');
      if (!allowed) throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      return { order: strip(order) };
    },
  );
  r.post(
    '/orders/:id/transition',
    {
      preHandler: requireAction('orders.transition'),
      config: {
        rateLimit: {
          max: 60,
          timeWindow: '1 minute',
          // One bucket per signed-in browser: the cookie jar is opaque and already parsed.
          keyGenerator: (request) =>
            request.headers.cookie
              ? `session:${String(request.headers.cookie)}`
              : `ip:${request.ip}`,
        },
      },
      schema: { response: { 200: OrderResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'staff')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const { id } = validate(z.object({ id: z.uuid() }), request.params);
      const body = validate(TransitionRequestSchema, request.body);
      const order = await transitionOrder(app.db, app.orderEvents, {
        orderId: id,
        to: body.to,
        actor: p,
        restaurantId: await restaurantIdFor(app.db, p),
      });
      return { order: strip(order) };
    },
  );
  r.post(
    '/orders/:id/payment',
    {
      preHandler: requireGuest(),
      config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: guestKey } },
      schema: { response: { 200: PaymentSessionResponseSchema } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'guest')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const { id } = validate(z.object({ id: z.uuid() }), request.params);
      // The amount is never in the request: startPayment reads it from the order.
      return startPayment(app.db, app.payments, { orderId: id, guestSessionId: p.guestSessionId });
    },
  );
  r.get(
    '/orders',
    { preHandler: requireAuthenticated(), schema: { response: { 200: OrdersResponseSchema } } },
    async (request) => {
      // No declared querystring schema, so `request.query` is `unknown`; validate it here.
      const query = validate(ActiveOrdersQuerySchema, request.query);
      const p = request.principal;
      if (p.kind === 'guest')
        return {
          orders: (await listOrders(app.db, { guestSessionId: p.guestSessionId })).map(strip),
        };
      if (p.kind === 'staff' && can(p.role, 'orders.read.all'))
        return {
          orders: (
            await listOrders(app.db, {
              restaurantId: await restaurantIdFor(app.db, p),
              active: query.active === '1',
            })
          ).map(strip),
        };
      throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
    },
  );
}
