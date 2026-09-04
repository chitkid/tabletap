import type { PaymentProviderName } from '@tabletap/shared';

export interface SessionInput {
  orderId: string;
  paymentId: string;
  number: number;
  amountCents: number;
  currency: string;
  description: string;
}
export interface SessionResult {
  url: string;
  providerSessionId: string | null;
}
export type SettleOutcome = 'succeeded' | 'failed';
export interface SettleInput {
  provider: PaymentProviderName;
  eventId: string;
  type: string;
  outcome: SettleOutcome;
  orderId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  providerSessionId: string | null;
  providerPaymentIntentId: string | null;
  payload: Record<string, unknown>;
}
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createSession(input: SessionInput): Promise<SessionResult>;
  /** Verifies and translates a provider callback. `null` means "understood, nothing to do". */
  readEvent(rawBody: Buffer, signature: string | undefined): SettleInput | null;
}

/** Raised for every rejected callback; the route maps it to a 400 SIGNATURE_INVALID. */
export class PaymentSignatureError extends Error {}
