import { act, render, screen } from '@testing-library/react';
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import type { AppSocket } from '../../lib/socket';
import { fakeSocket } from '../../test/fake-socket';
import { OrderLive } from './order-live';

const order: OrderDto = {
  id: 'o1',
  number: 42,
  status: 'placed',
  tableId: 't',
  tableNumber: 7,
  items: [],
  subtotalCents: 0,
  totalCents: 0,
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

describe('OrderLive', () => {
  it('follows its own order and announces ready assertively', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={order}
        currency="USD"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    act(() => socket.fire('connect'));
    act(() =>
      socket.fire('order:updated', {
        order: { ...order, status: 'cooking', updatedAt: '2026-09-03T10:05:00Z' },
      }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order #42 is being made.');
    act(() =>
      socket.fire('order:updated', {
        order: { ...order, id: 'other', status: 'ready', updatedAt: '2026-09-03T10:06:00Z' },
      }),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('is being made.');
    act(() =>
      socket.fire('order:updated', {
        order: {
          ...order,
          status: 'ready',
          readyAt: '2026-09-03T10:07:00Z',
          updatedAt: '2026-09-03T10:07:00Z',
        },
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Order #42 is ready.');
  });
  it('keeps the order when the server could not answer the resync', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={order}
        currency="USD"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    act(() => socket.fire('connect'));
    act(() => socket.lastAck?.(null));
    expect(screen.queryByText(/cleared by the hourly demo reset/)).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Order #42');
  });
  it('waits with the guest for the payment to be confirmed, then stops saying so', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={order}
        currency="USD"
        paidStatus="received"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    // Scoped by text, not by role: the receipt already carries live regions of its own (the
    // elapsed clock, the Pay button's own line), and this asserts the notice is one of them.
    expect(screen.getByText('Payment received. Confirming…')).toHaveAttribute('role', 'status');
    act(() => socket.fire('connect'));
    act(() =>
      socket.fire('order:updated', {
        order: { ...order, status: 'paid', updatedAt: '2026-09-03T10:01:00Z' },
      }),
    );
    expect(screen.queryByText('Payment received. Confirming…')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Order #42 sent to the kitchen.',
    );
  });
  it('reports a declined payment plainly and leaves the order payable', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={order}
        currency="USD"
        paidStatus="declined"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    expect(screen.getByText('Payment declined. Try again.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: /^Pay/ })).toBeInTheDocument();
  });
  it('says so when a resync no longer contains the order', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={order}
        currency="USD"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    act(() => socket.fire('connect'));
    act(() => socket.lastAck?.({ orders: [], serverTime: '2026-09-03T11:00:00Z' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'This order was cleared by the hourly demo reset.',
    );
  });
});
