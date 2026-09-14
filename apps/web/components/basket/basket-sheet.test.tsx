import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { formatCents } from '../../lib/money';
import ru from '../../messages/ru.json';
import { BasketSheet } from './basket-sheet';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/**
 * `getByRole(…, { name })` compares an accessible name with an identity normaliser and needs the
 * dictionary's real U+00A0; `getByText` collapses that byte in the element and leaves the expected
 * string alone, so it takes `plain()`.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const B = ru.guest.basket;

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
          lines={[line('Морс из клюквы', 2, 400)]}
          currency="USD"
          onSetQuantity={() => undefined}
          onRemove={onRemove}
        />,
      ),
    );
    expect(screen.getByRole('dialog', { name: B.title })).toBeInTheDocument();
    expect(screen.getByText(plain(formatCents(800, 'USD')))).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: fill(B.removeDish, { name: 'Морс из клюквы' }) }),
    );
    expect(onRemove).toHaveBeenCalledWith('Морс из клюквы');
    expect(screen.getByRole('link', { name: B.checkout })).toHaveAttribute('href', '/checkout');
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
    expect(screen.getByText(plain(B.empty))).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: B.checkout })).toBeNull();
    rerender(
      withProvider(
        <BasketSheet
          open
          onOpenChange={() => undefined}
          lines={[line('Баклажаны с ореховым соусом', 1, 1100, false)]}
          currency="USD"
          onSetQuantity={() => undefined}
          onRemove={() => undefined}
        />,
      ),
    );
    expect(screen.getByText(plain(B.soldOutLine))).toBeInTheDocument();
  });
});
