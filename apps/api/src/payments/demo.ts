import { PaymentSignatureError, type PaymentProvider } from './types';

/**
 * Stands in for a payment processor when no Stripe key is configured. It creates no session with
 * anyone: it points the guest at this app's own terminal, and the completion route builds the
 * settle input the webhook would have carried (ADR 0011).
 */
export function createDemoProvider(): PaymentProvider {
  return {
    name: 'demo',
    createSession: async (input) => ({
      url: `/pay/${input.orderId}`,
      providerSessionId: `demo:${input.paymentId}`,
    }),
    readEvent() {
      throw new PaymentSignatureError('the demo provider has no webhook');
    },
  };
}
