import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  type RenderOptions,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { ApiError } from '../../lib/api';
import { RushButton } from './rush-button';

const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: withIntl, ...options });

const NBSP = String.fromCharCode(0xa0);
/** `getByRole(…, { name })` does not collapse U+00A0; `toHaveTextContent` does. */
const plain = (s: string) => s.split(NBSP).join(' ');
const START = ru.kitchen.rush.start;
const planned = (n: number) =>
  String(new IntlMessageFormat(ru.kitchen.rush.planned, 'ru-RU').format({ n }));

describe('the planned-orders count', () => {
  // The one place in this file that states the Russian rather than deriving it, because deriving
  // it here would be the dictionary asserting about itself. Nothing below goes through
  // @testing-library/dom, so nothing normalises whitespace: the ICU message binds the number to
  // its noun with a real U+00A0 and the fixtures say so.
  // 11 and 21 are the pair that catches a naive rule: 21 takes the same form as 1, and 11 does not.
  //
  // **For the closing NBSP sweep.** The trailing «за ближайшую минуту.» below carries an ordinary
  // space after «за», because `kitchen.rush.planned` does — where `guest.checkout.rateLimited`
  // writes «за<NBSP>минуту». Task 10's string, not this file's, and the copy contract's
  // short-preposition rule says it should be non-breaking. When the sweep fixes the dictionary,
  // this line has to be fixed with it. It will say so loudly: the comparison below is a whole
  // string with `toBe`, so a changed byte fails here rather than passing quietly.
  it.each([
    [1, `1${NBSP}заказ`],
    [2, `2${NBSP}заказа`],
    [5, `5${NBSP}заказов`],
    [11, `11${NBSP}заказов`],
    [21, `21${NBSP}заказ`],
    [101, `101${NBSP}заказ`],
  ])('declines the noun after %i', (n, expected) => {
    expect(planned(n)).toBe(`${expected} за ближайшую минуту.`);
  });
});

describe('RushButton', () => {
  it('starts a rush and reports it, then refuses a second click for a minute', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockResolvedValue({ started: true, durationSeconds: 60, ordersPlanned: 12 });
    render(<RushButton fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: START }));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/demo/rush',
      expect.objectContaining({ init: expect.objectContaining({ method: 'POST' }) }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(plain(planned(12)));
    expect(screen.getByRole('button', { name: START })).toBeDisabled();
  });
  it('declines the noun for the count the API actually sent', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockResolvedValue({ started: true, durationSeconds: 60, ordersPlanned: 21 });
    render(<RushButton fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: START }));
    expect(await screen.findByRole('status')).toHaveTextContent(plain(planned(21)));
  });
  it('says when a rush is already running', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockRejectedValue(new ApiError(409, 'CONFLICT', 'busy'));
    render(<RushButton fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: START }));
    expect(await screen.findByRole('status')).toHaveTextContent(plain(ru.kitchen.rush.running));
  });
  it('clears a failure the way it clears every other message, and stays pressable', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
      render(<RushButton fetcher={fetcher} />);
      // fireEvent rather than user-event: this test drives the clock itself.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: START }));
      });
      expect(screen.getByRole('status')).toHaveTextContent(plain(ru.kitchen.rush.failed));
      // Nothing is running, so nothing stops the next attempt.
      expect(screen.getByRole('button', { name: START })).toBeEnabled();
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
