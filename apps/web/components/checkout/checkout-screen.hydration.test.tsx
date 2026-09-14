import type { MenuResponse } from '@tabletap/shared';
import { NextIntlClientProvider } from 'next-intl';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import ru from '../../messages/ru.json';
import { CheckoutScreen } from './checkout-screen';
import { addItem, cartStorageKey } from '../../lib/cart';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = {
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' },
  categories: [
    {
      id: U(2),
      name: 'Drinks',
      sortOrder: 0,
      items: [
        {
          id: U(3),
          categoryId: U(2),
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

/**
 * `/checkout` is server-rendered, and the basket it prices is not: the store answers "empty" for
 * the length of the hydration commit. A client-only `render()` never sees that window, so this
 * suite hydrates real server markup — the one shape in which the empty-basket redirect can fire
 * at a guest whose basket is full.
 */
describe('CheckoutScreen hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    replace.mockClear();
    localStorage.setItem(cartStorageKey('t1'), JSON.stringify(addItem({ items: {} }, U(3), 2)));
  });
  it('does not bounce a full basket back to the menu while hydrating', async () => {
    const tree = (
      <NextIntlClientProvider locale="ru" messages={ru}>
        <CheckoutScreen menu={menu} tableId="t1" />
      </NextIntlClientProvider>
    );
    const html = renderToString(tree);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    await act(async () => {
      hydrateRoot(container, tree);
    });
    expect(container.textContent).toContain('2 × House Lemonade');
    expect(replace).not.toHaveBeenCalled();
  });
});
