import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import ru from '../../messages/ru.json';
import { SoundToggle } from './sound-toggle';

describe('SoundToggle', () => {
  it('is a pressed button that reports its state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="ru" messages={ru}>
        <SoundToggle enabled={false} onChange={onChange} />
      </NextIntlClientProvider>,
    );
    const button = screen.getByRole('button', { name: ru.kitchen.sound.off });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('says the state it is in, not the state a press would reach', async () => {
    render(
      <NextIntlClientProvider locale="ru" messages={ru}>
        <SoundToggle enabled onChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('button', { name: ru.kitchen.sound.on })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
