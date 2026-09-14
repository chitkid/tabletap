import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { createStripeProvider } from './stripe';
import { PaymentSignatureError } from './types';

const SECRET = 'whsec_test_secret';
const WEB = 'http://localhost:3000';
const session = {
  orderId: '11111111-1111-4111-8111-111111111111',
  paymentId: '22222222-2222-4222-8222-222222222222',
  number: 42,
  amountCents: 2800,
  currency: 'USD',
  description: 'Order #42 · Table 7',
};

function providerWith(
  create = vi
    .fn()
    .mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' }),
) {
  const client = {
    checkout: { sessions: { create } },
    webhooks: { constructEvent: Stripe.webhooks.constructEvent.bind(Stripe.webhooks) },
  };
  return {
    provider: createStripeProvider({ client, webhookSecret: SECRET, webOrigin: WEB }),
    create,
  };
}
const signed = (body: string, opts: { secret?: string; timestamp?: number } = {}) =>
  Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: opts.secret ?? SECRET,
    timestamp: opts.timestamp,
  });

const completed = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_1',
        payment_intent: 'pi_1',
        amount_total: 2800,
        currency: 'usd',
        metadata: { orderId: session.orderId, paymentId: session.paymentId },
        ...over,
      },
    },
  });

describe('stripe provider', () => {
  it('creates a Checkout session with the amount and the ids the settlement needs', async () => {
    const { provider, create } = providerWith();
    const result = await provider.createSession(session);
    expect(result).toEqual({
      url: 'https://checkout.stripe.test/cs_test_1',
      providerSessionId: 'cs_test_1',
    });
    const params = create.mock.calls[0]![0];
    expect(params.mode).toBe('payment');
    expect(params.metadata).toEqual({ orderId: session.orderId, paymentId: session.paymentId });
    expect(params.line_items[0].price_data.unit_amount).toBe(2800);
    expect(params.line_items[0].price_data.currency).toBe('usd');
    expect(params.success_url).toBe(`${WEB}/orders/${session.orderId}?paid=1`);
    expect(params.cancel_url).toBe(`${WEB}/orders/${session.orderId}?paid=0`);
  });

  /**
   * Stripe's page is the one screen in this product we do not draw, and all but one word of it is
   * Stripe's own. Left unset, `locale` is `'auto'` and follows the guest's browser, so a guest
   * whose phone is in English would read a Russian line item on an English payment form. The line
   * item itself is `lib/ru.ts`'s `checkoutLineName`, and this test passes it through
   * untouched to prove the adapter does not translate, reword or truncate what it is handed.
   */
  it('asks Stripe for its own chrome in Russian, and prints the name it was given', async () => {
    const { provider, create } = providerWith();
    await provider.createSession({ ...session, description: 'Стол 7 · Заказ № 42' });
    const params = create.mock.calls[0]![0];
    expect(params.locale).toBe('ru');
    expect(params.line_items[0].price_data.product_data.name).toBe('Стол 7 · Заказ № 42');
  });
  it('reads a completed session into a settle input', () => {
    const { provider } = providerWith();
    const body = completed();
    expect(provider.readEvent(Buffer.from(body), signed(body))).toEqual({
      provider: 'stripe',
      eventId: 'evt_1',
      type: 'checkout.session.completed',
      outcome: 'succeeded',
      orderId: session.orderId,
      paymentId: session.paymentId,
      amountCents: 2800,
      currency: 'USD',
      providerSessionId: 'cs_test_1',
      providerPaymentIntentId: 'pi_1',
      payload: expect.any(Object),
    });
  });
  it('reads an expired session as a failure and ignores anything else', () => {
    const { provider } = providerWith();
    const expired = completed().replace('checkout.session.completed', 'checkout.session.expired');
    expect(provider.readEvent(Buffer.from(expired), signed(expired))?.outcome).toBe('failed');
    const other = JSON.stringify({ id: 'evt_2', type: 'customer.created', data: { object: {} } });
    expect(provider.readEvent(Buffer.from(other), signed(other))).toBeNull();
  });
  it('refuses a tampered body, the wrong secret, a stale timestamp and a missing header', () => {
    const { provider } = providerWith();
    const body = completed();
    const header = signed(body);
    expect(() => provider.readEvent(Buffer.from(body.replace('2800', '1')), header)).toThrow(
      PaymentSignatureError,
    );
    expect(() =>
      provider.readEvent(Buffer.from(body), signed(body, { secret: 'whsec_other' })),
    ).toThrow(PaymentSignatureError);
    expect(() =>
      provider.readEvent(
        Buffer.from(body),
        signed(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }),
      ),
    ).toThrow(PaymentSignatureError);
    expect(() => provider.readEvent(Buffer.from(body), undefined)).toThrow(PaymentSignatureError);
  });
  it('refuses an event whose metadata does not name the order and the payment', () => {
    const { provider } = providerWith();
    const body = completed({ metadata: {} });
    expect(() => provider.readEvent(Buffer.from(body), signed(body))).toThrow(
      PaymentSignatureError,
    );
  });
});
