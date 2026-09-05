import { render } from '@testing-library/react';
import type { MenuResponse } from '@tabletap/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './page';

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
  ],
};

vi.mock('../../lib/guest-cookie', () => ({ guestCookie: vi.fn(() => Promise.resolve('cookie')) }));
vi.mock('../../lib/guest-menu', () => ({
  loadGuestMenu: vi.fn(() => Promise.resolve({ menu, tableId: 't1', tableNumber: 7 })),
}));

describe('the menu page', () => {
  beforeEach(() => localStorage.clear());
  it('hands the menu screen a first-paint entrance, so its sections arrive one after another', async () => {
    const { container } = render(await MenuPage());
    const entrance = container.querySelector('[data-entrance="menu"]');
    expect(entrance).not.toBeNull();
    // The cascade lands on the wrapper's grandchildren; the screen owns the element between.
    expect(entrance?.firstElementChild?.tagName).toBe('MAIN');
  });
});
