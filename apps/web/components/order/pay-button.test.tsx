import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { formatCents } from '../../lib/money';
import ru from '../../messages/ru.json';
import { restoreFromBackForwardCache } from '../../test/bfcache';
import { PayButton } from './pay-button';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/**
 * `getByRole`'s name matcher normalises with the identity function, so the accessible name has to
 * carry the real U+00A0 `Intl.NumberFormat` puts before the currency symbol. Composed rather than
 * typed, because an invisible byte in a hand-written fixture drifts silently.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const P = ru.guest.pay;
const PAY_28 = P.pay.replace('{amount}', formatCents(2800, 'USD'));

describe('PayButton', () => {
  it('opens a payment session and follows the url the API answers with', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ url: '/pay/o1' });
    const navigate = vi.fn();
    render(
      withProvider(
        <PayButton
          orderId="o1"
          totalCents={2800}
          currency="USD"
          fetcher={fetcher}
          navigate={navigate}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/orders/o1/payment',
      expect.objectContaining({ init: expect.objectContaining({ method: 'POST' }) }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/pay/o1'));
  });

  it('follows an absolute provider url just as readily', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test' });
    const navigate = vi.fn();
    render(
      withProvider(
        <PayButton
          orderId="o1"
          totalCents={2800}
          currency="USD"
          fetcher={fetcher}
          navigate={navigate}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test'),
    );
  });

  it('says it is opening the payment and refuses a second press while it is', async () => {
    const user = userEvent.setup();
    let release: (value: { url: string }) => void = () => {};
    const fetcher = vi.fn().mockReturnValue(
      new Promise<{ url: string }>((resolve) => {
        release = resolve;
      }),
    );
    const navigate = vi.fn();
    render(
      withProvider(
        <PayButton
          orderId="o1"
          totalCents={2800}
          currency="USD"
          fetcher={fetcher}
          navigate={navigate}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    const busy = await screen.findByRole('button', { name: P.opening });
    expect(busy).toBeDisabled();
    // The second press the name promises. fireEvent rather than user-event, which refuses to
    // click through `pointer-events: none`: the point here is that the disabled button itself
    // swallows the press, not that a real thumb could never land on it.
    fireEvent.click(busy);
    release({ url: '/pay/o1' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/pay/o1'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('comes back pressable when the browser hands the page back', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ url: '/pay/o1' });
    const navigate = vi.fn();
    render(
      withProvider(
        <PayButton
          orderId="o1"
          totalCents={2800}
          currency="USD"
          fetcher={fetcher}
          navigate={navigate}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/pay/o1'));
    // Pressing Back from the terminal restores this page with the state it left with, which is
    // mid-navigation. Without the reset the only way to pay is disabled, for good.
    restoreFromBackForwardCache();
    const pay = screen.getByRole('button', { name: PAY_28 });
    expect(pay).toBeEnabled();
    await user.click(pay);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('says so when the session could not be opened, and stays pressable', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          409,
          'PAYMENT_REQUIRED',
          'orderNotAwaitingPayment',
          'This order is not waiting for payment.',
        ),
      );
    const navigate = vi.fn();
    render(
      withProvider(
        <PayButton
          orderId="o1"
          totalCents={2800}
          currency="USD"
          fetcher={fetcher}
          navigate={navigate}
        />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    expect(await screen.findByRole('status')).toHaveTextContent(plain(P.failed));
    expect(screen.getByRole('button', { name: PAY_28 })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
