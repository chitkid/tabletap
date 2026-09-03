import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SoundToggle } from './sound-toggle';

describe('SoundToggle', () => {
  it('is a pressed button that reports its state', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SoundToggle enabled={false} onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Sound off' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
