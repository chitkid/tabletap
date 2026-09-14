import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuResponse } from '@tabletap/shared';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import { MenuScreen } from './menu-screen';

// Every screen on the guest surface reads its words through `useTranslations`, which needs
// `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

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
    render(withProvider(<MenuScreen menu={menu} tableId="t1" tableNumber={7} />));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Little Furnace');
    // `guest.table` binds the number to «Стол» with U+00A0; `getByText` collapses it, so this
    // fixture carries a plain space on purpose.
    expect(screen.getByText('Стол 7')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Разделы меню' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Drinks' })).toHaveAttribute(
      'href',
      '#category-' + U(4),
    );
    expect(screen.queryByRole('region', { name: 'Корзина' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «Margherita Flatbread»' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Добавить ещё одну порцию «Margherita Flatbread»' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «House Lemonade»' }));
    // `basketItems` binds the count to its noun with a non-breaking space, but `toHaveTextContent`
    // collapses U+00A0 to a plain space - this plain space is correct as is.
    expect(screen.getByRole('region', { name: 'Корзина' })).toHaveTextContent('3 позиции · 28 $');
    await userEvent.click(screen.getByRole('button', { name: 'Открыть корзину' }));
    expect(screen.getByRole('dialog', { name: 'Ваша корзина' })).toBeInTheDocument();
  });

  it('returns focus to the basket bar however the sheet is closed', async () => {
    render(withProvider(<MenuScreen menu={menu} tableId="t1" tableNumber={7} />));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «House Lemonade»' }));
    const viewBasket = screen.getByRole('button', { name: 'Открыть корзину' });

    await userEvent.click(viewBasket);
    expect(screen.getByRole('dialog', { name: 'Ваша корзина' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(viewBasket));

    await userEvent.click(viewBasket);
    await userEvent.click(screen.getByRole('button', { name: 'Продолжить выбор' }));
    await waitFor(() => expect(document.activeElement).toBe(viewBasket));
  });
});
