import type Stripe from 'stripe';
import { PaymentSignatureError, type PaymentProvider, type SettleInput } from './types';

/** The slice of the SDK this adapter uses, so a test can hand it a fake and stay offline. */
export interface StripeLike {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
      ): Promise<{ id: string; url: string | null }>;
    };
  };
  webhooks: { constructEvent(payload: Buffer, header: string, secret: string): Stripe.Event };
}

const SUCCEEDED = new Set(['checkout.session.completed']);
const FAILED = new Set(['checkout.session.expired', 'checkout.session.async_payment_failed']);

export function createStripeProvider(opts: {
  client: StripeLike;
  webhookSecret: string;
  webOrigin: string;
}): PaymentProvider {
  return {
    name: 'stripe',
    async createSession(input) {
      const session = await opts.client.checkout.sessions.create({
        mode: 'payment',
        // The order is the whole basket: Stripe shows one line, the amount the database holds.
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountCents,
              product_data: { name: input.description },
            },
          },
        ],
        metadata: { orderId: input.orderId, paymentId: input.paymentId },
        success_url: `${opts.webOrigin}/orders/${input.orderId}?paid=1`,
        cancel_url: `${opts.webOrigin}/orders/${input.orderId}?paid=0`,
      });
      if (!session.url) throw new Error('Stripe returned a session with no url');
      return { url: session.url, providerSessionId: session.id };
    },
    readEvent(rawBody, signature) {
      if (signature === undefined) throw new PaymentSignatureError('missing signature header');
      let event: Stripe.Event;
      try {
        event = opts.client.webhooks.constructEvent(rawBody, signature, opts.webhookSecret);
      } catch (err) {
        throw new PaymentSignatureError(
          err instanceof Error ? err.message : 'signature check failed',
        );
      }
      const outcome = SUCCEEDED.has(event.type)
        ? 'succeeded'
        : FAILED.has(event.type)
          ? 'failed'
          : null;
      if (outcome === null) return null;
      const object = event.data.object as Stripe.Checkout.Session;
      const orderId = object.metadata?.['orderId'];
      const paymentId = object.metadata?.['paymentId'];
      // Without our own ids the event cannot be tied to an order; treating it as valid would let
      // a session created elsewhere pay something here.
      if (typeof orderId !== 'string' || typeof paymentId !== 'string')
        throw new PaymentSignatureError('event carries no order metadata');
      const intent = object.payment_intent;
      return {
        provider: 'stripe',
        eventId: event.id,
        type: event.type,
        outcome,
        orderId,
        paymentId,
        amountCents: object.amount_total ?? 0,
        currency: (object.currency ?? 'usd').toUpperCase(),
        providerSessionId: object.id,
        providerPaymentIntentId: typeof intent === 'string' ? intent : (intent?.id ?? null),
        payload: { id: event.id, type: event.type },
      } satisfies SettleInput;
    },
  };
}
