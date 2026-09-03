import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { RushButton } from './rush-button';

describe('RushButton', () => {
  it('starts a rush and reports it, then refuses a second click for a minute', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockResolvedValue({ started: true, durationSeconds: 60, ordersPlanned: 12 });
    render(<RushButton fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: 'Simulate rush' }));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/demo/rush',
      expect.objectContaining({ init: expect.objectContaining({ method: 'POST' }) }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('12 orders over the next minute.');
    expect(screen.getByRole('button', { name: 'Simulate rush' })).toBeDisabled();
  });
  it('says when a rush is already running', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockRejectedValue(new ApiError(409, 'CONFLICT', 'busy'));
    render(<RushButton fetcher={fetcher} />);
    await user.click(screen.getByRole('button', { name: 'Simulate rush' }));
    expect(await screen.findByRole('status')).toHaveTextContent('A rush is already running.');
  });
});
