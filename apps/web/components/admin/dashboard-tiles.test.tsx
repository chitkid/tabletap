import type { DashboardResponse } from '@tabletap/shared';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import { DashboardTiles } from './dashboard-tiles';

/**
 * Every label comes from `messages/ru.json`. `useTranslations` resolves through
 * `NextIntlClientProvider` in every environment vitest runs in — unlike the real app, where this
 * Server Component reads the request config directly, the file has no server/client split under
 * Vite, so the provider is required here.
 */
const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

/**
 * `getByText` and `toHaveTextContent` collapse U+00A0 before matching, so every fixture read
 * through them is the dictionary's string with its bound spaces flattened — never a string typed
 * here, which would drift from the dictionary by a character and stop asserting anything.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const T = ru.admin.today;

const today: DashboardResponse['today'] = {
  orders: 42,
  revenueCents: 128_450,
  averageReadyMs: 432_000,
  openTickets: 3,
};

const tileFor = (label: string) => screen.getByText(plain(label)).closest('div') as HTMLElement;

describe('DashboardTiles', () => {
  it('shows the four figures the day is judged on', () => {
    render(<DashboardTiles today={today} currency="RUB" />);

    expect(screen.getByRole('heading', { level: 1, name: T.heading })).toBeInTheDocument();
    expect(within(tileFor(T.orders)).getByText('42')).toBeInTheDocument();
    expect(within(tileFor(T.revenue)).getByText('1 285 ₽')).toBeInTheDocument();
    expect(
      within(tileFor(T.averageReady)).getByText(plain(fill(T.minutesSeconds, { m: 7, s: 12 }))),
    ).toBeInTheDocument();
    expect(within(tileFor(T.openTickets)).getByText('3')).toBeInTheDocument();
  });

  it("counts the money in the restaurant's own currency, not in roubles by default", () => {
    render(<DashboardTiles today={today} currency="EUR" />);
    expect(within(tileFor(T.revenue)).getByText('1 285 €')).toBeInTheDocument();
    expect(screen.queryByText('1 285 ₽')).toBeNull();
  });

  it('reads a sub-minute average in seconds alone', () => {
    render(<DashboardTiles today={{ ...today, averageReadyMs: 47_400 }} currency="RUB" />);
    expect(
      within(tileFor(T.averageReady)).getByText(plain(fill(T.seconds, { s: 47 }))),
    ).toBeInTheDocument();
  });

  it('says in words that nothing reached ready, rather than printing a zero', () => {
    render(<DashboardTiles today={{ ...today, averageReadyMs: null }} currency="RUB" />);

    const tile = tileFor(T.averageReady);
    const dash = within(tile).getByText('—');
    expect(dash).toHaveAttribute('aria-hidden', 'true');
    expect(within(tile).getByText(plain(T.nothingReady))).toBeInTheDocument();
    expect(within(tile).queryByText(plain(fill(T.seconds, { s: 0 })))).toBeNull();
  });
});
