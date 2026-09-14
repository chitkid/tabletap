import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
 * `toHaveTextContent` collapse that byte, which is why every other fixture here holds a plain
 * space.
 */
const PAY_28 = ru.guest.pay.pay.replace('{amount}', formatCents(2800, 'USD'));

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
      'Заказ № 42 ожидает оплаты.',
    );
    expect(screen.getByText('Стол 7')).toBeInTheDocument();
    // The badge takes the glossary's guest column: what happens to the guest, not what the order
    // is - docs/design/02b-copy-ru.md.
    expect(screen.getByText('Ожидает оплаты')).toBeInTheDocument();
    expect(screen.getByText('2 × Хачапури по-аджарски')).toBeInTheDocument();
    expect(screen.getByText('24 $')).toBeInTheDocument();
    expect(screen.getByText('No basil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: ru.guest.order.backToMenu })).toHaveAttribute(
      'href',
      '/menu',
    );
  });
  it.each([
    ['placed', 'Заказ № 42 ожидает оплаты.'],
    ['paid', 'Заказ № 42 отправлен на кухню.'],
    ['cooking', 'Заказ № 42 готовится.'],
    ['ready', 'Заказ № 42 готов — сейчас принесут.'],
    ['served', 'Заказ № 42 подан. Приятного аппетита.'],
    ['cancelled', 'Заказ № 42 отменён.'],
  ] as const)('headline for %s', (status, text) => {
    render(withProvider(<OrderScreen order={{ ...order, status }} currency="USD" />));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
  });
  it.each([
    ['paid', 'Отправлен на кухню'],
    ['cooking', 'Готовится'],
    ['ready', 'Готов — сейчас принесут'],
    ['served', 'Подан'],
    ['cancelled', 'Отменён'],
  ] as const)('badges %s with the guest column, not the kitchen one', (status, label) => {
    render(withProvider(<OrderScreen order={{ ...order, status }} currency="USD" />));
    expect(screen.getByText(label)).toBeInTheDocument();
  });
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
    expect(screen.queryByRole('button', { name: /^Оплатить/ })).toBeNull();
  });
  it('does not offer to pay once the money has arrived', () => {
    render(
      withProvider(
        <OrderScreen order={{ ...order, status: 'paid', totalCents: 2800 }} currency="USD" />,
      ),
    );
    expect(screen.queryByRole('button', { name: /^Оплатить/ })).toBeNull();
  });
});
