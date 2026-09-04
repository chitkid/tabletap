import { describe, expect, it } from 'vitest';
import { createDemoProvider } from './demo';

describe('demo provider', () => {
  it('sends the guest to the in-app terminal', async () => {
    const provider = createDemoProvider();
    expect(provider.name).toBe('demo');
    expect(
      await provider.createSession({
        orderId: 'o1',
        paymentId: 'p1',
        number: 42,
        amountCents: 2800,
        currency: 'USD',
        description: 'Order #42',
      }),
    ).toEqual({
      url: '/pay/o1',
      providerSessionId: 'demo:p1',
    });
  });
  it('has no webhook to read', () => {
    expect(() => createDemoProvider().readEvent(Buffer.from('{}'), undefined)).toThrow(
      /no webhook/i,
    );
  });
});
