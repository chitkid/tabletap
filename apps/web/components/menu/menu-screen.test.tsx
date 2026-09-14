import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PLATE_KIND, type MenuResponse, type PlateKind } from '@tabletap/shared';
import { Plate } from '@tabletap/ui';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatCents } from '../../lib/money';
import ru from '../../messages/ru.json';
import { MenuScreen } from './menu-screen';

// Every screen on the guest surface reads its words through `useTranslations`, which needs
// `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/**
 * Every word below is read out of `messages/ru.json`. «Стол 7» and the basket's count both bind a
 * number to its noun with U+00A0, and the guest surface is full of the same byte: `getByRole(…,
 * { name })` matches with an identity normaliser and needs it, while `getByText` and
 * `toHaveTextContent` collapse it in the element and leave the expected string alone - hence
 * `plain()`.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const M = ru.guest.menu;
const B = ru.guest.basket;

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
    expect(screen.getByText(plain(fill(ru.guest.table, { number: 7 })))).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: M.sections })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Напитки' })).toHaveAttribute(
      'href',
      '#category-' + U(4),
    );
    expect(screen.queryByRole('region', { name: B.region })).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: fill(M.addDish, { name: 'Хачапури по-аджарски' }) }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: fill(M.addOneMore, { name: 'Хачапури по-аджарски' }) }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: fill(M.addDish, { name: 'Морс из клюквы' }) }),
    );
    // The bar's whole summary, not a fragment of it: `toHaveTextContent` is a substring match, and
    // «3 позиции» alone would also pass on «13 позиций». The count comes through ICU - three forms
    // in Russian, which is the case a binary rule gets wrong - and the money through the same
    // formatter the bar uses, so this asserts the figure rather than re-deciding its shape.
    expect(screen.getByRole('region', { name: B.region })).toHaveTextContent(
      plain(`${fill(ru.guest.basketItems, { n: 3 })} · ${formatCents(164_000, 'RUB')}`),
    );
    await userEvent.click(screen.getByRole('button', { name: B.open }));
    expect(screen.getByRole('dialog', { name: B.title })).toBeInTheDocument();
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
    await userEvent.click(
      screen.getByRole('button', { name: fill(M.addDish, { name: 'Морс из клюквы' }) }),
    );
    const viewBasket = screen.getByRole('button', { name: B.open });

    await userEvent.click(viewBasket);
    expect(screen.getByRole('dialog', { name: B.title })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(viewBasket));

    await userEvent.click(viewBasket);
    await userEvent.click(screen.getByRole('button', { name: B.keepBrowsing }));
    await waitFor(() => expect(document.activeElement).toBe(viewBasket));
  });
});
