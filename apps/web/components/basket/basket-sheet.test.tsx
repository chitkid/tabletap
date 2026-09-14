import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { BasketSheet } from './basket-sheet';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

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
      withProvider(
        <BasketSheet
          open
          onOpenChange={() => undefined}
          lines={[line('House Lemonade', 2, 400)]}
          currency="USD"
          onSetQuantity={() => undefined}
          onRemove={onRemove}
        />,
      ),
    );
    expect(screen.getByRole('dialog', { name: 'Ваша корзина' })).toBeInTheDocument();
    expect(screen.getByText('8 $')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Убрать «House Lemonade»' }));
    expect(onRemove).toHaveBeenCalledWith('House Lemonade');
    // `getByRole`'s name matcher runs an identity normaliser, so «Перейти к оформлению» has to
    // carry the real U+00A0 the dictionary binds the preposition with. Read from the dictionary
    // rather than retyped, because an invisible byte typed by hand drifts silently.
    expect(screen.getByRole('link', { name: ru.guest.basket.checkout })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });
  it('shows the empty state and flags a sold-out line', () => {
    const { rerender } = render(
      withProvider(
        <BasketSheet
          open
          onOpenChange={() => undefined}
          lines={[]}
          currency="USD"
          onSetQuantity={() => undefined}
          onRemove={() => undefined}
        />,
      ),
    );
    // An empty basket is an invitation, not a statement of absence - docs/design/02b-copy-ru.md.
    expect(screen.getByText('В корзине пока пусто. Выберите блюдо в меню.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: ru.guest.basket.checkout })).toBeNull();
    rerender(
      withProvider(
        <BasketSheet
          open
          onOpenChange={() => undefined}
          lines={[line('Burrata & Peaches', 1, 1100, false)]}
          currency="USD"
          onSetQuantity={() => undefined}
          onRemove={() => undefined}
        />,
      ),
    );
    expect(
      screen.getByText('Сегодня закончилось. Уберите из корзины, чтобы продолжить.'),
    ).toBeInTheDocument();
  });
});
