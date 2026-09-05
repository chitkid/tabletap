import { act, render, screen, within } from '@testing-library/react';
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
  currency: 'USD',
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
  it('drops the declined notice once the order turns out to be paid', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={{ ...order, status: 'paid' }}
        currency="USD"
        paidStatus="declined"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    expect(screen.queryByText('Payment declined. Try again.')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Order #42 sent to the kitchen.',
    );
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

/** The five stages, as a list a screen reader can read and a rail a glance can read. */
const stagesOf = () =>
  within(screen.getByRole('list', { name: 'Order progress' })).getAllByRole('listitem');
const lineIn = (stage: HTMLElement) => stage.querySelector('[data-line]');
const dotIn = (stage: HTMLElement) => stage.querySelector('[data-dot]');

describe('the order timeline', () => {
  it('fills the rail up to the stage the order has reached and marks that stage as the current step', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={{ ...order, status: 'paid' }}
        currency="USD"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    const stages = stagesOf();
    // Each stage reads as its label followed by a word only a screen reader gets: on screen the
    // same fact is a filled dot and a lit label, and colour on its own is not an answer.
    expect(stages.map((stage) => stage.textContent)).toEqual([
      'PlacedDone',
      'PaidNow',
      'CookingTo come',
      'ReadyTo come',
      'ServedTo come',
    ]);
    expect(stages[1]).toHaveAttribute('aria-current', 'step');
    expect(lineIn(stages[1]!)?.className).toContain('scale-x-100');
    expect(lineIn(stages[2]!)?.className).toContain('scale-x-0');
    expect(dotIn(stages[1]!)?.className).toContain('scale-100');
    expect(dotIn(stages[2]!)?.className).toContain('scale-75');
  });
  it('advances the rail when the kitchen moves the order on (class-level: jsdom does no layout, so this proves the classes change, not that anything grew)', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={{ ...order, status: 'paid' }}
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
    expect(lineIn(stagesOf()[2]!)?.className).toContain('scale-x-100');
    expect(stagesOf()[2]).toHaveAttribute('aria-current', 'step');
  });
  it('grows the line and then pops the dot, both over token durations and neither touching layout', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={{ ...order, status: 'paid' }}
        currency="USD"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    const line = lineIn(stagesOf()[1]!);
    expect(line?.className).toContain('origin-left');
    expect(line?.className).toContain('transition-[scale]');
    expect(line?.className).toContain('duration-[var(--motion-base)]');
    expect(line?.className).toContain('ease-[var(--motion-ease)]');
    expect(line?.className).not.toMatch(/\d+(?:ms|s)\b/);
    const dot = dotIn(stagesOf()[1]!);
    expect(dot?.className).toContain('transition-[opacity,scale]');
    // The dot waits for the line it sits at the end of rather than moving with it.
    expect(dot?.getAttribute('style')).toContain('var(--motion-base)');
  });
  it('draws no rail for an order that was cancelled, because it did not stop somewhere on it', () => {
    const socket = fakeSocket();
    render(
      <OrderLive
        initial={{ ...order, status: 'cancelled' }}
        currency="USD"
        socketFactory={() => socket as unknown as AppSocket}
      />,
    );
    expect(screen.queryByRole('list', { name: 'Order progress' })).toBeNull();
  });
});
