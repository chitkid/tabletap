import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { restoreFromBackForwardCache } from '../../test/bfcache';
import { DemoTerminal } from './demo-terminal';

const order: OrderDto = {
  id: 'o1',
  number: 42,
  status: 'placed',
  tableId: 't',
  tableNumber: 7,
  items: [],
  subtotalCents: 2800,
  totalCents: 2800,
  note: null,
  placedAt: '2026-09-03T10:00:00Z',
  paidAt: null,
  cookingAt: null,
  readyAt: null,
  servedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-03T10:00:00Z',
  updatedAt: '2026-09-03T10:00:00Z',
};

function bodyOf(call: unknown): unknown {
  const opts = call as { init?: { body?: string } };
  return JSON.parse(opts.init?.body ?? 'null');
}

describe('DemoTerminal', () => {
  it('shows the table, the order, the amount and says plainly what it is', () => {
    render(<DemoTerminal order={order} currency="USD" fetcher={vi.fn()} navigate={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Table 7 · Order #42');
    expect(screen.getByText('$28.00')).toBeInTheDocument();
    expect(screen.getByText('This is a demo. No card, no money.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay $28.00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('settles the attempt as paid and returns to the order', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    render(<DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/payments/demo/complete',
      expect.objectContaining({ init: expect.objectContaining({ method: 'POST' }) }),
    );
    expect(bodyOf(fetcher.mock.calls[0]?.[1])).toEqual({ orderId: 'o1', outcome: 'paid' });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=1'));
  });

  it('settles the attempt as declined, says so, and returns to the order', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    render(<DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    expect(bodyOf(fetcher.mock.calls[0]?.[1])).toEqual({ orderId: 'o1', outcome: 'declined' });
    expect(await screen.findByText('Payment declined.')).toHaveAttribute('role', 'status');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=0'));
  });

  it('opens a fresh attempt when the one this terminal was drawn for is closed', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, 'PAYMENT_REQUIRED', 'no payment to complete'))
      .mockResolvedValueOnce({ url: '/pay/o1' })
      .mockResolvedValueOnce({ ok: true });
    const navigate = vi.fn();
    render(<DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=1'));
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/orders/o1/payment');
    expect(fetcher.mock.calls[2]?.[0]).toBe('/api/payments/demo/complete');
  });

  it('says so when the terminal could not be reached, and leaves both buttons usable', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'));
    const navigate = vi.fn();
    render(<DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    expect(await screen.findByText("Couldn't reach the terminal. Try again.")).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.getByRole('button', { name: 'Pay $28.00' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('says an attempt is under way while both buttons are quiet', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    expect(await screen.findByText('Taking the payment…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay $28.00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
  });

  it('comes back usable when the browser hands the page back', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    const navigate = vi.fn();
    render(<DemoTerminal order={order} currency="USD" fetcher={fetcher} navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: 'Pay $28.00' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/orders/o1?paid=1'));
    // Back from the receipt restores the terminal exactly as it left: quiet, and still claiming
    // to be taking a payment that finished. Both are stale, and both have to go.
    restoreFromBackForwardCache();
    expect(screen.getByRole('button', { name: 'Pay $28.00' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled();
    expect(screen.queryByText('Taking the payment…')).toBeNull();
  });

  it('does not offer a keypad key to anyone reading the page', () => {
    render(<DemoTerminal order={order} currency="USD" fetcher={vi.fn()} navigate={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
