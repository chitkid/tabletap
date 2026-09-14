import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import { BasketBar } from './basket-bar';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs
// in - unlike the real app, where a Server Component reads the request config directly, this
// component's file has no server/client split under Vite, so the provider is required here.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

describe('BasketBar', () => {
  it('summarises the basket in a live region and offers the sheet', () => {
    render(
      withProvider(
        <BasketBar count={2} totalCents={2600} currency="USD" onOpen={() => undefined} />,
      ),
    );
    const region = screen.getByRole('region', { name: 'Basket' });
    expect(region).toHaveTextContent('2 позиции · 26 $');
    expect(screen.getByRole('button', { name: 'View basket' })).toBeInTheDocument();
  });
  it('uses the singular for one item', () => {
    render(
      withProvider(
        <BasketBar count={1} totalCents={400} currency="USD" onOpen={() => undefined} />,
      ),
    );
    expect(screen.getByRole('region', { name: 'Basket' })).toHaveTextContent('1 позиция · 4 $');
  });
  it('uses the genitive plural from five upward, the form a binary rule would miss', () => {
    render(
      withProvider(
        <BasketBar count={5} totalCents={1000} currency="USD" onOpen={() => undefined} />,
      ),
    );
    expect(screen.getByRole('region', { name: 'Basket' })).toHaveTextContent('5 позиций · 10 $');
  });
});
