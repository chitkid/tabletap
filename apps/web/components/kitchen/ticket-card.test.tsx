import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it, vi } from 'vitest';
import { TicketCard } from './ticket-card';

const T0 = Date.parse('2026-09-03T10:00:00Z');
const order = (patch: Partial<OrderDto> = {}): OrderDto => ({
  id: 'o1',
  number: 42,
  status: 'placed',
  tableId: 't',
  tableNumber: 7,
  items: [
    {
      id: 'i1',
      menuItemId: 'm1',
      name: 'Margherita Flatbread',
      unitPriceCents: 1200,
      quantity: 2,
      lineTotalCents: 2400,
    },
  ],
  subtotalCents: 2400,
  totalCents: 2400,
  note: 'No basil',
  placedAt: '2026-09-03T10:00:00Z',
  cookingAt: null,
  readyAt: null,
  servedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-03T10:00:00Z',
  updatedAt: '2026-09-03T10:00:00Z',
  ...patch,
});

describe('TicketCard', () => {
  it('says table, number, lines, note and the next verb', () => {
    render(
      <TicketCard order={order()} now={T0 + 65_000} fresh onBump={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('heading', { name: 'Table 7 · #42' })).toBeInTheDocument();
    expect(screen.getByText('2 × Margherita Flatbread')).toBeInTheDocument();
    expect(screen.getByText('Note: No basil')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    expect(screen.getByRole('button', { name: 'Start #42' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('data-fresh', 'true');
  });
  it('marks a late ticket in words, not only colour, and restarts the clock at cookingAt', () => {
    render(
      <TicketCard
        order={order({ status: 'cooking', cookingAt: '2026-09-03T10:04:00Z' })}
        now={T0 + 15 * 60_000}
        fresh={false}
        onBump={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('timer')).toHaveTextContent('11:00 · late');
    expect(screen.getByRole('timer')).toHaveAttribute('data-threshold', 'late');
    expect(screen.getByRole('button', { name: 'Ready #42' })).toBeInTheDocument();
  });
  it('bumps to the next status and cancels behind a confirm', async () => {
    const user = userEvent.setup();
    const onBump = vi.fn();
    const onCancel = vi.fn();
    render(
      <TicketCard order={order()} now={T0} fresh={false} onBump={onBump} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole('button', { name: 'Start #42' }));
    expect(onBump).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }), 'cooking');
    await user.click(screen.getByRole('button', { name: 'Cancel #42' }));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }));
  });
  it('disables the bump while a move is pending and offers no cancel past New', () => {
    render(
      <TicketCard
        order={order({ status: 'ready', readyAt: '2026-09-03T10:09:00Z' })}
        now={T0}
        fresh={false}
        pending
        onBump={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Served #42' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel #42' })).toBeNull();
  });
});
