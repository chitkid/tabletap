import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { DishCard } from './dish-card';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

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
      withProvider(
        <DishCard
          item={{ ...item, allergens: [...item.allergens] }}
          category="Flatbreads"
          quantity={0}
          currency="USD"
          onAdd={onAdd}
          onSetQuantity={() => undefined}
        />,
      ),
    );
    // `getByText` collapses the U+00A0 Intl puts before the symbol, so this fixture is a plain
    // space on purpose.
    expect(screen.getByText('12 $')).toBeInTheDocument();
    // The nine allergen names come from the shared `allergens` namespace, the same one the admin's
    // menu editor reads. `item.allergens` holds the enum — nine English identifiers — and printing
    // it directly is what «Содержит gluten, dairy» was.
    const list = [ru.allergens.gluten, ru.allergens.dairy].join(', ');
    expect(screen.getByText(ru.guest.menu.allergens.replace('{list}', list))).toBeInTheDocument();
    expect(screen.queryByText(/gluten/)).toBeNull();
    // The plate repeats the heading beside it, so it is decoration, not an image worth naming.
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Добавить «Margherita Flatbread»' }));
    expect(onAdd).toHaveBeenCalled();
    rerender(
      withProvider(
        <DishCard
          item={{ ...item, allergens: [...item.allergens] }}
          category="Flatbreads"
          quantity={1}
          currency="USD"
          onAdd={onAdd}
          onSetQuantity={() => undefined}
        />,
      ),
    );
    expect(
      screen.getByRole('button', { name: 'Добавить ещё одну порцию «Margherita Flatbread»' }),
    ).toBeInTheDocument();
  });
  it('marks a sold-out dish and offers no button', () => {
    render(
      withProvider(
        <DishCard
          item={{ ...item, allergens: [], isAvailable: false }}
          category="Sides"
          quantity={0}
          currency="USD"
          onAdd={() => undefined}
          onSetQuantity={() => undefined}
        />,
      ),
    );
    expect(screen.getByText('Сегодня закончилось')).toBeInTheDocument();
    expect(screen.getByText('Аллергены не указаны')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
