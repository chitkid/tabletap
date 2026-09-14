import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { formatCents } from '../../lib/money';
import ru from '../../messages/ru.json';
import { OrderScreen } from './order-screen';
import { PayButton } from './pay-button';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/**
 * `getByRole`'s name matcher normalises with the identity function, so an accessible name has to
 * carry the real U+00A0 - here the one `Intl.NumberFormat` puts before the currency symbol. It is
 * composed from the dictionary and the formatter rather than typed out, because an invisible byte
 * in a hand-written fixture is a failure this project has already paid for once. `getByText` and
 * `toHaveTextContent` collapse that byte, which is why `plain()` exists beside `fill()`.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const HEADLINE = ru.guest.order.headline;
const PAY_28 = fill(ru.guest.pay.pay, { amount: formatCents(2800, 'USD') });

const order = {
  id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
  number: 42,
  status: 'placed' as const,
  tableId: 't',
  tableNumber: 7,
  items: [
    {
      id: 'a',
      menuItemId: 'm',
      name: 'Хачапури по-аджарски',
      unitPriceCents: 1200,
      quantity: 2,
      lineTotalCents: 2400,
    },
  ],
  subtotalCents: 2400,
  totalCents: 2400,
  currency: 'USD',
  note: 'No basil',
  placedAt: '2026-09-03T10:00:00.000Z',
  paidAt: null,
  cookingAt: null,
  readyAt: null,
  servedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-03T10:00:00.000Z',
  updatedAt: '2026-09-03T10:00:00.000Z',
};
describe('OrderScreen', () => {
  it('confirms in the brand voice with the number, lines, note and status', () => {
    render(withProvider(<OrderScreen order={order} currency="USD" />));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      plain(fill(HEADLINE.placed, { number: 42 })),
    );
    expect(screen.getByText(plain(fill(ru.guest.table, { number: 7 })))).toBeInTheDocument();
    // The badge takes the glossary's guest column: what happens to the guest, not what the order
    // is - docs/design/02b-copy-ru.md.
    expect(screen.getByText(plain(ru.status.guest.placed))).toBeInTheDocument();
    expect(screen.getByText('2 × Хачапури по-аджарски')).toBeInTheDocument();
    expect(screen.getByText(plain(formatCents(2400, 'USD')))).toBeInTheDocument();
    expect(screen.getByText('No basil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ru.guest.order.backToMenu })).toHaveAttribute(
      'href',
      '/menu',
    );
  });
  // One row per status the guest can land on, and the sentence for each read out of
  // `guest.order.headline` rather than retyped beside it. A headline is a whole sentence, so
  // `toHaveTextContent` here cannot pass on a prefix of another status's.
  it.each(['placed', 'paid', 'cooking', 'ready', 'served', 'cancelled'] as const)(
    'headline for %s',
    (status) => {
      render(withProvider(<OrderScreen order={{ ...order, status }} currency="USD" />));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        plain(fill(HEADLINE[status], { number: 42 })),
      );
    },
  );
  it.each(['paid', 'cooking', 'ready', 'served', 'cancelled'] as const)(
    'badges %s with the guest column, not the kitchen one',
    (status) => {
      render(withProvider(<OrderScreen order={{ ...order, status }} currency="USD" />));
      expect(screen.getByText(plain(ru.status.guest[status]))).toBeInTheDocument();
      // `ready` is the row where the two columns genuinely differ - «Готов — сейчас принесут» to
      // a guest, «Готов» to the kitchen - and `ticket-card.test.tsx` holds the other half of this
      // pair. `getByText` compares whole normalised text, so the guest's longer sentence is not a
      // match for the kitchen's word and this refuses the swap in both directions.
      if (ru.status.kitchen[status] !== ru.status.guest[status]) {
        expect(screen.queryByText(plain(ru.status.kitchen[status]))).toBeNull();
      }
    },
  );
  it('offers to pay while the order is waiting for payment', () => {
    render(withProvider(<OrderScreen order={{ ...order, totalCents: 2800 }} currency="USD" />));
    expect(screen.getByRole('button', { name: PAY_28 })).toBeInTheDocument();
  });
  it('takes an injected pay control, so a receipt can be driven without a network', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ url: '/pay/o1' });
    const navigate = vi.fn();
    render(
      withProvider(
        <OrderScreen
          order={{ ...order, totalCents: 2800 }}
          currency="USD"
          onPay={
            <PayButton
              orderId="o1"
              totalCents={2800}
              currency="USD"
              fetcher={fetcher}
              navigate={navigate}
            />
          }
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
  it('keeps the slot shut for an order that owes nothing', () => {
    render(
      withProvider(
        <OrderScreen
          order={{ ...order, status: 'paid' }}
          currency="USD"
          onPay={<button type="button">{PAY_28}</button>}
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: PAY_28 })).toBeNull();
  });
  it('does not offer to pay once the money has arrived', () => {
    render(
      withProvider(
        <OrderScreen order={{ ...order, status: 'paid', totalCents: 2800 }} currency="USD" />,
      ),
    );
    expect(screen.queryByRole('button', { name: PAY_28 })).toBeNull();
  });
});
