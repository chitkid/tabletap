import Stripe from 'stripe';
import type { Config } from '../config';
import { createDemoProvider } from './demo';
import { createStripeProvider } from './stripe';
import type { PaymentProvider } from './types';

export function createPaymentProvider(config: Config): PaymentProvider {
  if (config.paymentProvider === 'demo') return createDemoProvider();
  // Both keys are present: `loadConfig` is what decides the provider.
  return createStripeProvider({
    client: new Stripe(config.STRIPE_SECRET_KEY!),
    webhookSecret: config.STRIPE_WEBHOOK_SECRET!,
    webOrigin: config.WEB_ORIGIN,
  });
}
export * from './types';
