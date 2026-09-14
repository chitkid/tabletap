import { render, screen } from '@testing-library/react';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { formatCents } from '../../lib/money';
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

/**
 * The bar says one thing: how much is in the basket and what it costs. `summary` builds that whole
 * line - the ICU plural from the dictionary, the money from the same formatter the bar uses - so
 * that the assertions are never a fragment. `toHaveTextContent` is a substring match, and «1
 * позиция» on its own also passes on «21 позиция»: asserting the whole line is what keeps these
 * from being green in the state they are meant to forbid.
 *
 * `plain()` because `basketItems` binds the count to its noun with U+00A0 and `toHaveTextContent`
 * collapses that byte in the element while leaving the expected string alone. See plural.test.ts
 * for the query that does need the real byte.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const B = ru.guest.basket;
const summary = (count: number, totalCents: number, currency: string) =>
  plain(
    `${String(new IntlMessageFormat(ru.guest.basketItems, 'ru-RU').format({ n: count }))} · ${formatCents(totalCents, currency)}`,
  );

describe('BasketBar', () => {
  it('summarises the basket in a live region and offers the sheet', () => {
    render(
      withProvider(
        <BasketBar count={2} totalCents={2600} currency="USD" onOpen={() => undefined} />,
      ),
    );
    const region = screen.getByRole('region', { name: B.region });
    expect(region).toHaveTextContent(summary(2, 2600, 'USD'));
    expect(screen.getByRole('button', { name: B.open })).toBeInTheDocument();
  });
  it('uses the singular for one item', () => {
    render(
      withProvider(
        <BasketBar count={1} totalCents={400} currency="USD" onOpen={() => undefined} />,
      ),
    );
    expect(screen.getByRole('region', { name: B.region })).toHaveTextContent(
      summary(1, 400, 'USD'),
    );
  });
  it('uses the genitive plural from five upward, the form a binary rule would miss', () => {
    render(
      withProvider(
        <BasketBar count={5} totalCents={1000} currency="USD" onOpen={() => undefined} />,
      ),
    );
    expect(screen.getByRole('region', { name: B.region })).toHaveTextContent(
      summary(5, 1000, 'USD'),
    );
  });
});
