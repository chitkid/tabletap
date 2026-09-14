import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DishCard } from './dish-card';

const item = {
  id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
  categoryId: 'c',
  name: 'Margherita Flatbread',
  description: 'Tomato, fior di latte, basil.',
  priceCents: 1200,
  allergens: ['gluten', 'dairy'] as const,
  isAvailable: true,
  imageUrl: null,
  sortOrder: 0,
};

describe('DishCard', () => {
  it('shows price, allergens and an Add button that becomes a stepper', async () => {
    const onAdd = vi.fn();
    const { container, rerender } = render(
      <DishCard
        item={{ ...item, allergens: [...item.allergens] }}
        category="Flatbreads"
        quantity={0}
        currency="USD"
        onAdd={onAdd}
        onSetQuantity={() => undefined}
      />,
    );
    expect(screen.getByText('12 $')).toBeInTheDocument();
    expect(screen.getByText('Contains gluten, dairy')).toBeInTheDocument();
    // The plate repeats the heading beside it, so it is decoration, not an image worth naming.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add Margherita Flatbread' }));
    expect(onAdd).toHaveBeenCalled();
    rerender(
      <DishCard
        item={{ ...item, allergens: [...item.allergens] }}
        category="Flatbreads"
        quantity={1}
        currency="USD"
        onAdd={onAdd}
        onSetQuantity={() => undefined}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Add one more Margherita Flatbread' }),
    ).toBeInTheDocument();
  });
  it('marks a sold-out dish and offers no button', () => {
    render(
      <DishCard
        item={{ ...item, allergens: [], isAvailable: false }}
        category="Sides"
        quantity={0}
        currency="USD"
        onAdd={() => undefined}
        onSetQuantity={() => undefined}
      />,
    );
    expect(screen.getByText('Sold out today')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
