import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BasketSheet } from './basket-sheet';

const line = (name: string, quantity: number, cents: number, available = true) => ({
  menuItemId: name,
  quantity,
  item: {
    id: name,
    categoryId: 'c',
    name,
    description: '',
    priceCents: cents,
    allergens: [],
    isAvailable: available,
    imageUrl: null,
    sortOrder: 0,
  },
  lineTotalCents: available ? cents * quantity : 0,
  available,
});

describe('BasketSheet', () => {
  it('lists lines, removes one and links to checkout', async () => {
    const onRemove = vi.fn();
    render(
      <BasketSheet
        open
        onOpenChange={() => undefined}
        lines={[line('House Lemonade', 2, 400)]}
        currency="USD"
        onSetQuantity={() => undefined}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Your basket' })).toBeInTheDocument();
    expect(screen.getByText('$8.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove House Lemonade' }));
    expect(onRemove).toHaveBeenCalledWith('House Lemonade');
    expect(screen.getByRole('link', { name: 'Go to checkout' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });
  it('shows the empty state and flags a sold-out line', () => {
    const { rerender } = render(
      <BasketSheet
        open
        onOpenChange={() => undefined}
        lines={[]}
        currency="USD"
        onSetQuantity={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('Nothing in the basket yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to checkout' })).toBeNull();
    rerender(
      <BasketSheet
        open
        onOpenChange={() => undefined}
        lines={[line('Burrata & Peaches', 1, 1100, false)]}
        currency="USD"
        onSetQuantity={() => undefined}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByText('Sold out today. Remove it to continue.')).toBeInTheDocument();
  });
});
