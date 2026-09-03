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
      'Order #42 sent to the kitchen.',
    );
    expect(screen.getByText('Table 7')).toBeInTheDocument();
    expect(screen.getByText('Placed')).toBeInTheDocument();
    expect(screen.getByText('2 × Margherita Flatbread')).toBeInTheDocument();
    expect(screen.getByText('$24.00')).toBeInTheDocument();
    expect(screen.getByText('No basil')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to menu' })).toHaveAttribute('href', '/menu');
  });
});
