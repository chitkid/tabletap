import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PLATE_KIND, type MenuResponse, type PlateKind } from '@tabletap/shared';
import { Plate } from '@tabletap/ui';
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
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'RUB' },
  categories: [
    {
      id: U(2),
      name: 'Из печи',
      plateKind: 'flatbread',
      sortOrder: 0,
      items: [
        {
          id: U(3),
          categoryId: U(2),
          name: 'Хачапури по-аджарски',
          description: '',
          priceCents: 69_000,
          allergens: ['gluten'],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 0,
        },
      ],
    },
    {
      id: U(4),
      name: 'Напитки',
      plateKind: 'drink',
      sortOrder: 3,
      items: [
        {
          id: U(5),
          categoryId: U(4),
          name: 'Морс из клюквы',
          description: '',
          priceCents: 26_000,
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
    expect(screen.getByRole('link', { name: 'Напитки' })).toHaveAttribute(
      'href',
      '#category-' + U(4),
    );
    expect(screen.queryByRole('region', { name: 'Корзина' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «Хачапури по-аджарски»' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Добавить ещё одну порцию «Хачапури по-аджарски»' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «Морс из клюквы»' }));
    // `basketItems` binds the count to its noun with a non-breaking space, but `toHaveTextContent`
    // collapses U+00A0 to a plain space - this plain space is correct as is.
    expect(screen.getByRole('region', { name: 'Корзина' })).toHaveTextContent(
      '3 позиции · 1 640 ₽',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Открыть корзину' }));
    expect(screen.getByRole('dialog', { name: 'Ваша корзина' })).toBeInTheDocument();
  });

  /**
   * The last link in the chain, and the one the original defect lived on: a category's identity
   * becoming a dish's plate. `kindFromCategory(category.name)` used to sit on this line, which is
   * why the whole Russian menu would have come out as one shape.
   *
   * Asserted against what `Plate` itself draws for that dish at that category's declared kind, and
   * against what it draws at the wrong ones. `innerHTML` rather than `outerHTML`: the shapes are a
   * function of the seed and the kind alone, while size and class belong to the card, so this
   * catches a wrong kind without breaking when a card is restyled.
   */
  it('hands every card its own category’s plate kind, not the fallback and not its neighbour’s', () => {
    const drawnBy = (name: string, kind: PlateKind) => {
      const { container, unmount } = render(<Plate name={name} kind={kind} />);
      const shapes = container.querySelector('svg')!.innerHTML;
      unmount();
      return shapes;
    };
    // Every reference plate is taken before the screen is on the page, so nothing here is ever
    // queried out of the rendered menu by accident.
    const references = {
      khachapuri: {
        own: drawnBy('Хачапури по-аджарски', 'flatbread'),
        fallback: drawnBy('Хачапури по-аджарски', DEFAULT_PLATE_KIND),
        neighbour: drawnBy('Хачапури по-аджарски', 'drink'),
      },
      mors: {
        own: drawnBy('Морс из клюквы', 'drink'),
        fallback: drawnBy('Морс из клюквы', DEFAULT_PLATE_KIND),
        neighbour: drawnBy('Морс из клюквы', 'flatbread'),
      },
    };

    render(withProvider(<MenuScreen menu={menu} tableId="t1" tableNumber={7} />));
    const plateOn = (dish: string) =>
      screen.getByRole('heading', { name: dish }).closest('article')!.querySelector('svg')!
        .innerHTML;

    for (const [dish, reference] of [
      ['Хачапури по-аджарски', references.khachapuri],
      ['Морс из клюквы', references.mors],
    ] as const) {
      // First that this test can tell the three apart at all. If the planner ever stopped giving
      // each kind its own composition, the assertion below would pass while drawing the fallback,
      // and the guard would be a guard over nothing.
      expect(new Set([reference.own, reference.fallback, reference.neighbour]).size, dish).toBe(3);
      // Then the mapping itself. Whole-string equality against the plate this dish's own category
      // declares: the fallback and the other section's kind are two of the values this refuses.
      expect(plateOn(dish), dish).toBe(reference.own);
    }
  });

  it('returns focus to the basket bar however the sheet is closed', async () => {
    render(withProvider(<MenuScreen menu={menu} tableId="t1" tableNumber={7} />));
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «Морс из клюквы»' }));
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
