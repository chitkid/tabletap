import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('QuantityStepper', () => {
  it('labels both buttons with the dish name and shows the value', async () => {
    const onChange = vi.fn();
    render(
      withProvider(<QuantityStepper name="Margherita Flatbread" value={2} onChange={onChange} />),
    );
    // The dish name is an appositive in ёлочки rather than an inflected object, so a name the
    // dictionary cannot decline still reads as Russian.
    await userEvent.click(
      screen.getByRole('button', { name: 'Добавить ещё одну порцию «Margherita Flatbread»' }),
    );
    expect(onChange).toHaveBeenCalledWith(3);
    await userEvent.click(
      screen.getByRole('button', { name: 'Убрать одну порцию «Margherita Flatbread»' }),
    );
    expect(onChange).toHaveBeenCalledWith(1);
    // The basket bar announces the totals; a live count on every card would make one tap
    // speak twice.
    expect(screen.getByText('2')).not.toHaveAttribute('aria-live');
  });
  it('disables plus at the maximum', () => {
    render(withProvider(<QuantityStepper name="x" value={20} onChange={() => undefined} />));
    expect(screen.getByRole('button', { name: 'Добавить ещё одну порцию «x»' })).toBeDisabled();
  });
});
