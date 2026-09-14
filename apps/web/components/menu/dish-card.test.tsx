import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { formatCents } from '../../lib/money';
import ru from '../../messages/ru.json';
import { DishCard } from './dish-card';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/** `getByRole(…, { name })` keeps U+00A0; `getByText` collapses it in the element only. */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const M = ru.guest.menu;

const item = {
  id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
  categoryId: 'c',
  name: 'Хачапури по-аджарски',
  description: 'Лодочка из теста, сулугуни, желток, кусок сливочного масла.',
  priceCents: 69_000,
  allergens: ['gluten', 'dairy'] as const,
  isAvailable: true,
  imageUrl: null,
  sortOrder: 0,
};

describe('DishCard', () => {
  it('shows price, allergens and an Add button that becomes a stepper', async () => {
    const onAdd = vi.fn();
    const { container, rerender } = render(
      withProvider(
        <DishCard
          item={{ ...item, allergens: [...item.allergens] }}
          plateKind="flatbread"
          quantity={0}
          currency="RUB"
          onAdd={onAdd}
          onSetQuantity={() => undefined}
        />,
      ),
    );
    expect(screen.getByText(plain(formatCents(69_000, 'RUB')))).toBeInTheDocument();
    // The nine allergen names come from the shared `allergens` namespace, the same one the admin's
    // menu editor reads. `item.allergens` holds the enum — nine English identifiers — and printing
    // it directly is what «Содержит gluten, dairy» was.
    const list = [ru.allergens.gluten, ru.allergens.dairy].join(', ');
    expect(screen.getByText(plain(fill(M.allergens, { list })))).toBeInTheDocument();
    expect(screen.queryByText(/gluten/)).toBeNull();
    // The plate repeats the heading beside it, so it is decoration, not an image worth naming.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: fill(M.addDish, { name: item.name }) }),
    );
    expect(onAdd).toHaveBeenCalled();
    rerender(
      withProvider(
        <DishCard
          item={{ ...item, allergens: [...item.allergens] }}
          plateKind="flatbread"
          quantity={1}
          currency="RUB"
          onAdd={onAdd}
          onSetQuantity={() => undefined}
        />,
      ),
    );
    expect(
      screen.getByRole('button', { name: fill(M.addOneMore, { name: item.name }) }),
    ).toBeInTheDocument();
  });
  it('marks a sold-out dish and offers no button', () => {
    render(
      withProvider(
        <DishCard
          item={{ ...item, allergens: [], isAvailable: false }}
          plateKind="side"
          quantity={0}
          currency="RUB"
          onAdd={() => undefined}
          onSetQuantity={() => undefined}
        />,
      ),
    );
    expect(screen.getByText(plain(M.soldOut))).toBeInTheDocument();
    expect(screen.getByText(plain(M.noAllergens))).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
  /**
   * The card draws the plate from the kind it is handed, not from the words above it. This used to
   * read the category's display name and match it against English, so the whole Russian menu came
   * out as one shape; the two SVGs below are what "one shape" would look like as a failure.
   */
  it('draws a different plate for a different kind, with nothing read off the dish itself', () => {
    const drawn = (plateKind: 'flatbread' | 'drink') => {
      const { container, unmount } = render(
        withProvider(
          <DishCard
            item={{ ...item, allergens: [] }}
            plateKind={plateKind}
            quantity={0}
            currency="RUB"
            onAdd={() => undefined}
            onSetQuantity={() => undefined}
          />,
        ),
      );
      const svg = container.querySelector('svg')!.outerHTML;
      unmount();
      return svg;
    };
    expect(drawn('flatbread') === drawn('drink')).toBe(false);
    expect(drawn('flatbread') === drawn('flatbread')).toBe(true);
  });
});
