import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { formatCents } from '../../lib/money';
import ru from '../../messages/ru.json';
import { restoreFromBackForwardCache } from '../../test/bfcache';
import { DemoTerminal } from './demo-terminal';

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
const PAY_28 = ru.guest.pay.pay.replace('{amount}', formatCents(2800, 'USD'));

const order: OrderDto = {
  id: 'o1',
  number: 42,
  status: 'placed',
  tableId: 't',
  tableNumber: 7,
  items: [],
  subtotalCents: 2800,
  totalCents: 2800,
  currency: 'USD',
  note: null,
  placedAt: '2026-09-03T10:00:00Z',
  paidAt: null,
  cookingAt: null,
  readyAt: null,
  servedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-03T10:00:00Z',
  updatedAt: '2026-09-03T10:00:00Z',
};

function bodyOf(call: unknown): unknown {
  const opts = call as { init?: { body?: string } };
  return JSON.parse(opts.init?.body ?? 'null');
}

describe('DemoTerminal', () => {
  it('shows the table, the order, the amount and says plainly what it is', () => {
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={vi.fn()} navigate={vi.fn()} />,
      ),
    );
    // `toHaveTextContent` and `getByText` collapse U+00A0, so these fixtures carry plain spaces.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Стол 7 · Заказ № 42');
    expect(screen.getByText('28 $')).toBeInTheDocument();
    // The terminal keeps promising that nothing is charged, which is the one sentence the
    // "read as a real restaurant's" clean-up must not be read to take away: the others announced
    // a demonstration, this one stops a person believing they were charged 28 $. Composed from
    // the dictionary rather than typed, so it cannot drift from it by a character.
    expect(screen.getByText(ru.guest.pay.disclaimer)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PAY_28 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeInTheDocument();
  });

  it('settles the attempt as paid and returns to the order', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/payments/demo/complete',
      expect.objectContaining({ init: expect.objectContaining({ method: 'POST' }) }),
    );
    expect(bodyOf(fetcher.mock.calls[0]?.[1])).toEqual({ orderId: 'o1', outcome: 'paid' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=1'));
  });

  it('settles the attempt as declined, says so, and returns to the order', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Отклонить' }));
    expect(bodyOf(fetcher.mock.calls[0]?.[1])).toEqual({ orderId: 'o1', outcome: 'declined' });
    expect(await screen.findByText('Оплата отклонена.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=0'));
  });

  it('opens a fresh attempt when the one this terminal was drawn for is closed', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, 'PAYMENT_REQUIRED', 'no payment to complete'))
      .mockResolvedValueOnce({ url: '/pay/o1' })
      .mockResolvedValueOnce({ ok: true });
    const navigate = vi.fn();
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=1'));
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/orders/o1/payment');
    expect(fetcher.mock.calls[2]?.[0]).toBe('/api/payments/demo/complete');
  });

  it('says so when the terminal could not be reached, and leaves both buttons usable', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    const navigate = vi.fn();
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    expect(
      await screen.findByText('Не удалось связаться с терминалом. Попробуйте ещё раз.'),
    ).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: PAY_28 })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says an attempt is under way while both buttons are quiet', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={vi.fn()} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    expect(await screen.findByText('Проводим оплату…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PAY_28 })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled();
  });

  it('comes back usable when the browser hands the page back', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />,
      ),
    );
    await user.click(screen.getByRole('button', { name: PAY_28 }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=1'));
    // Back from the receipt restores the terminal exactly as it left: quiet, and still claiming
    // to be taking a payment that finished. Both are stale, and both have to go.
    restoreFromBackForwardCache();
    expect(screen.getByRole('button', { name: PAY_28 })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeEnabled();
    expect(screen.queryByText('Проводим оплату…')).toBeNull();
  });

  it('does not offer a keypad key to anyone reading the page', () => {
    render(
      withProvider(
        <DemoTerminal order={order} currency="USD" fetcher={vi.fn()} navigate={vi.fn()} />,
      ),
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
