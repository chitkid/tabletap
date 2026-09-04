import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { restoreFromBackForwardCache } from '../../test/bfcache';
import { PayButton } from './pay-button';

describe('PayButton', () => {
  it('opens a payment session and follows the url the API answers with', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ url: '/pay/o1' });
    const navigate = vi.fn();
    render(
      <PayButton
        orderId="o1"
        totalCents={2800}
        currency="USD"
        fetcher={fetcher}
        navigate={navigate}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
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
      <PayButton
        orderId="o1"
        totalCents={2800}
        currency="USD"
        fetcher={fetcher}
        navigate={navigate}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
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
      <PayButton
        orderId="o1"
        totalCents={2800}
        currency="USD"
        fetcher={fetcher}
        navigate={navigate}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    const busy = await screen.findByRole('button', { name: 'Opening payment…' });
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
      <PayButton
        orderId="o1"
        totalCents={2800}
        currency="USD"
        fetcher={fetcher}
        navigate={navigate}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/pay/o1'));
    // Pressing Back from the terminal restores this page with the state it left with, which is
    // mid-navigation. Without the reset the only way to pay is disabled, for good.
    restoreFromBackForwardCache();
    const pay = screen.getByRole('button', { name: 'Pay $28.00' });
    expect(pay).toBeEnabled();
    await user.click(pay);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('says so when the session could not be opened, and stays pressable', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockRejectedValue(new ApiError(409, 'PAYMENT_REQUIRED', 'not waiting'));
    const navigate = vi.fn();
    render(
      <PayButton
        orderId="o1"
        totalCents={2800}
        currency="USD"
        fetcher={fetcher}
        navigate={navigate}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      "Couldn't start the payment. Try again.",
    );
    expect(screen.getByRole('button', { name: 'Pay $28.00' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
