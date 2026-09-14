import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { ElapsedSince } from './elapsed-since';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

describe('ElapsedSince', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T10:02:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('shows and updates the elapsed time in a live region', () => {
    render(withProvider(<ElapsedSince iso="2026-09-03T10:00:00.000Z" intervalMs={1000} />));
    // `toHaveTextContent` collapses the U+00A0 that binds the figure to «мин», so these fixtures
    // carry a plain space.
    expect(screen.getByRole('status')).toHaveTextContent('Оформлен 2 мин назад');
    vi.advanceTimersByTime(60_000);
    expect(screen.getByRole('status')).toHaveTextContent('Оформлен 3 мин назад');
  });
  it('says «только что» under a minute, and counts hours above one', () => {
    render(withProvider(<ElapsedSince iso="2026-09-03T10:01:45.000Z" intervalMs={1000} />));
    expect(screen.getByRole('status')).toHaveTextContent('Оформлен только что');
  });
  it('reads an hour and a remainder as one phrase', () => {
    vi.setSystemTime(new Date('2026-09-03T11:05:00Z'));
    render(withProvider(<ElapsedSince iso="2026-09-03T10:00:00.000Z" intervalMs={1000} />));
    expect(screen.getByRole('status')).toHaveTextContent('Оформлен 1 ч 5 мин назад');
  });
});
