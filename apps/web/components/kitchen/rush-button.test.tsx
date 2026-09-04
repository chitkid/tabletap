import { act, fireEvent, render, screen } from '@testing-library/react';
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
  it('clears a failure the way it clears every other message, and stays pressable', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
      render(<RushButton fetcher={fetcher} />);
      // fireEvent rather than user-event: this test drives the clock itself.
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Simulate rush' }));
      });
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't start a rush.");
      // Nothing is running, so nothing stops the next attempt.
      expect(screen.getByRole('button', { name: 'Simulate rush' })).toBeEnabled();
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
