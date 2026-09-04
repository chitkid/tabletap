import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderScreen } from './order-screen';
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
      name: 'Margherita Flatbread',
      unitPriceCents: 1200,
      quantity: 2,
      lineTotalCents: 2400,
    },
  ],
  subtotalCents: 2400,
  totalCents: 2400,
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
    render(<OrderScreen order={order} currency="USD" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Order #42 is waiting for payment.',
    );
    expect(screen.getByText('Table 7')).toBeInTheDocument();
    expect(screen.getByText('Placed')).toBeInTheDocument();
    expect(screen.getByText('2 × Margherita Flatbread')).toBeInTheDocument();
    expect(screen.getByText('$24.00')).toBeInTheDocument();
    expect(screen.getByText('No basil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to menu' })).toHaveAttribute('href', '/menu');
  });
  it.each([
    ['placed', 'Order #42 is waiting for payment.'],
    ['paid', 'Order #42 sent to the kitchen.'],
    ['cooking', 'Order #42 is being made.'],
    ['ready', 'Order #42 is ready.'],
    ['served', 'Order #42 was served. Enjoy.'],
    ['cancelled', 'Order #42 was cancelled.'],
  ] as const)('headline for %s', (status, text) => {
    render(<OrderScreen order={{ ...order, status }} currency="USD" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(text);
  });
  it('offers to pay while the order is waiting for payment', () => {
    render(<OrderScreen order={{ ...order, totalCents: 2800 }} currency="USD" />);
    expect(screen.getByRole('button', { name: 'Pay $28.00' })).toBeInTheDocument();
  });
  it('does not offer to pay once the money has arrived', () => {
    render(<OrderScreen order={{ ...order, status: 'paid', totalCents: 2800 }} currency="USD" />);
    expect(screen.queryByRole('button', { name: /^Pay/ })).toBeNull();
  });
});
