import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { schema } from '@tabletap/db';
import { DemoCompleteRequestSchema } from '@tabletap/shared';
import { AppError, validate } from '../lib/errors';
import { loadOrder } from '../lib/orders';
import { settlePayment } from '../lib/payments';
import { PaymentSignatureError } from '../payments/types';
import { requireGuest } from '../plugins/rbac';

/**
 * Not wrapped in fastify-plugin on purpose: the raw-body parser below must stay inside this
 * scope. Registered with `app.register`, it applies to this route and nothing else.
 */
export async function paymentWebhookRoutes(app: FastifyInstance) {
  // A signature covers the bytes that were sent, not the object a parser rebuilt from them, so
  // the body must reach the handler untouched. Overriding the built-in JSON parser is allowed;
  // this scope has no other route, so the JSON routes keep parsing JSON.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });
  app.post(
    // Nobody signs in to deliver a webhook: the signature is the only credential, and it is
    // checked before the body is anything but bytes.
    '/payments/webhook',
    { config: { public: true, principal: false } },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      let input;
      try {
        input = app.payments.readEvent(
          request.body as Buffer,
          typeof signature === 'string' ? signature : undefined,
        );
      } catch (err) {
        if (err instanceof PaymentSignatureError)
          throw new AppError(
            'SIGNATURE_INVALID',
            400,
            'This event is not signed by the payment provider.',
          );
        throw err;
      }
      // A signed event we do not act on is still an event we accept: answering anything else
      // makes the provider retry something that will never change.
      if (input !== null) {
        const result = await settlePayment(app.db, app.orderEvents, input);
        request.log.info({ result, eventId: input.eventId, type: input.type }, 'payment settled');
      }
      return reply.send({ received: true });
    },
  );
}

const DemoCompleteBodySchema = DemoCompleteRequestSchema.extend({ orderId: z.uuid() });

/** Only mounted when the demo provider is live: with Stripe configured this path does not exist. */
export async function demoPaymentRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/payments/demo/complete',
    {
      preHandler: requireGuest(),
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { response: { 200: z.object({ ok: z.literal(true) }) } },
    },
    async (request) => {
      const p = request.principal;
      if (p.kind !== 'guest')
        throw new AppError('FORBIDDEN', 403, 'You do not have access to this.');
      const { orderId, outcome } = validate(DemoCompleteBodySchema, request.body);
      const order = await loadOrder(app.db, orderId);
      // A stranger's order and an order that never existed answer the same way, as everywhere else.
      if (!order || order.guestSessionId !== p.guestSessionId)
        throw new AppError('NOT_FOUND', 404, 'Order not found.');
      // The terminal may only settle an order that is still waiting: without this an order paid
      // through one attempt could be declined through an older one that is still open.
      if (order.status !== 'placed')
        throw new AppError('PAYMENT_REQUIRED', 409, 'This order is not waiting for payment.', {
          status: order.status,
        });
      const [payment] = await app.db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, 'pending')))
        .orderBy(desc(schema.payments.createdAt))
        .limit(1);
      if (!payment)
        throw new AppError('PAYMENT_REQUIRED', 409, 'This order has no payment to complete.');
      const result = await settlePayment(app.db, app.orderEvents, {
        provider: 'demo',
        // One event id per attempt, and the outcome is not part of it: whichever button is
        // pressed first settles the attempt, and the other one is a replay rather than a way
        // to walk a paid order back to failed.
        eventId: `demo:${payment.id}`,
        type: `demo.${outcome}`,
        outcome: outcome === 'paid' ? 'succeeded' : 'failed',
        orderId: order.id,
        paymentId: payment.id,
        amountCents: payment.amountCents,
        currency: payment.currency,
        providerSessionId: payment.providerSessionId,
        providerPaymentIntentId: null,
        payload: { terminal: 'demo', outcome },
      });
      request.log.info({ result, orderId: order.id, paymentId: payment.id }, 'demo payment');
      return { ok: true as const };
    },
  );
}
