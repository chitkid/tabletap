import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { QuantityStepper } from './quantity-stepper';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs
// in - unlike the real app, where a Server Component reads the request config directly, this
// component's file has no server/client split under Vite, so the provider is required here.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/** Both labels are accessible names, which `getByRole` matches byte for byte - so they are
 *  composed from `guest.menu` rather than retyped with the ёлочки and the spacing by hand. */
const fill = (message: string, values: Record<string, string>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const M = ru.guest.menu;

describe('QuantityStepper', () => {
  it('labels both buttons with the dish name and shows the value', async () => {
    const onChange = vi.fn();
    render(
      withProvider(<QuantityStepper name="Хачапури по-аджарски" value={2} onChange={onChange} />),
    );
    // The dish name is an appositive in ёлочки rather than an inflected object, so a name the
    // dictionary cannot decline still reads as Russian.
    await userEvent.click(
      screen.getByRole('button', { name: fill(M.addOneMore, { name: 'Хачапури по-аджарски' }) }),
    );
    expect(onChange).toHaveBeenCalledWith(3);
    await userEvent.click(
      screen.getByRole('button', { name: fill(M.removeOne, { name: 'Хачапури по-аджарски' }) }),
    );
    expect(onChange).toHaveBeenCalledWith(1);
    // The basket bar announces the totals; a live count on every card would make one tap
    // speak twice.
    expect(screen.getByText('2')).not.toHaveAttribute('aria-live');
  });
  it('disables plus at the maximum', () => {
    render(withProvider(<QuantityStepper name="x" value={20} onChange={() => undefined} />));
    expect(screen.getByRole('button', { name: fill(M.addOneMore, { name: 'x' }) })).toBeDisabled();
  });
});
