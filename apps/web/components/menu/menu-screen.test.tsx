import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuResponse } from '@tabletap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MenuScreen } from './menu-screen';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = {
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' },
  categories: [
    {
      id: U(2),
      name: 'Flatbreads',
      sortOrder: 0,
      items: [
        {
          id: U(3),
          categoryId: U(2),
          name: 'Margherita Flatbread',
          description: '',
          priceCents: 1200,
          allergens: ['gluten'],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 0,
        },
      ],
    },
    {
      id: U(4),
      name: 'Drinks',
      sortOrder: 3,
      items: [
        {
          id: U(5),
          categoryId: U(4),
          name: 'House Lemonade',
          description: '',
          priceCents: 400,
          allergens: [],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 0,
        },
      ],
    },
  ],
};

describe('MenuScreen', () => {
  beforeEach(() => localStorage.clear());
  it('renders sections with navigation, builds a basket and opens the sheet', async () => {
    render(<MenuScreen menu={menu} tableId="t1" tableNumber={7} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Little Furnace');
    expect(screen.getByText('Table 7')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Menu sections' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Drinks' })).toHaveAttribute(
      'href',
      '#category-' + U(4),
    );
    expect(screen.queryByRole('region', { name: 'Basket' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Add Margherita Flatbread' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Add one more Margherita Flatbread' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add House Lemonade' }));
    expect(screen.getByRole('region', { name: 'Basket' })).toHaveTextContent('3 items · $28.00');
    await userEvent.click(screen.getByRole('button', { name: 'View basket' }));
    expect(screen.getByRole('dialog', { name: 'Your basket' })).toBeInTheDocument();
  });
});
