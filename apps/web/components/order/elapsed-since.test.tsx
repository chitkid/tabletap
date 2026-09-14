import { render, screen } from '@testing-library/react';
import { IntlMessageFormat } from 'intl-messageformat';
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

/**
 * `placedAgo` wraps whichever `elapsed` phrase applies, and both come from the dictionary: the
 * figure is bound to «мин» and «ч» with U+00A0, which `toHaveTextContent` collapses in the element
 * and not in the expected string.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const placedAgo = (elapsed: string) => plain(fill(ru.guest.order.placedAgo, { elapsed }));
const E = ru.guest.elapsed;

describe('ElapsedSince', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-03T10:02:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('shows and updates the elapsed time in a live region', () => {
    render(withProvider(<ElapsedSince iso="2026-09-03T10:00:00.000Z" intervalMs={1000} />));
    expect(screen.getByRole('status')).toHaveTextContent(placedAgo(fill(E.minutes, { n: 2 })));
    vi.advanceTimersByTime(60_000);
    expect(screen.getByRole('status')).toHaveTextContent(placedAgo(fill(E.minutes, { n: 3 })));
  });
  it('says «только что» under a minute, and counts hours above one', () => {
    render(withProvider(<ElapsedSince iso="2026-09-03T10:01:45.000Z" intervalMs={1000} />));
    expect(screen.getByRole('status')).toHaveTextContent(placedAgo(E.now));
  });
  it('reads an hour and a remainder as one phrase', () => {
    vi.setSystemTime(new Date('2026-09-03T11:05:00Z'));
    render(withProvider(<ElapsedSince iso="2026-09-03T10:00:00.000Z" intervalMs={1000} />));
    expect(screen.getByRole('status')).toHaveTextContent(
      placedAgo(fill(E.hoursMinutes, { h: 1, m: 5 })),
    );
  });
});
