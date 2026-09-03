import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { AppSocket } from '../../lib/socket';
import { KitchenBoard } from './kitchen-board';

type Handler = (...args: never[]) => void;
type Snapshot = { orders: OrderDto[]; serverTime: string };
/**
 * Annotated because the literal below refers to itself (`on` returns the socket, `emit` stores
 * the ack on it): without the annotation the inferred type is circular.
 */
interface FakeSocket {
  on(event: string, fn: Handler): FakeSocket;
  off: Mock;
  removeAllListeners: Mock;
  connect: Mock;
  disconnect: Mock;
  emit: Mock;
  io: { on(event: string, fn: Handler): FakeSocket };
  lastAck: undefined | ((s: Snapshot) => void);
  fire(event: string, ...args: unknown[]): void;
}

function fakeSocket() {
  const handlers = new Map<string, Handler[]>();
  const managerHandlers = new Map<string, Handler[]>();
  const on = (map: Map<string, Handler[]>) => (event: string, fn: Handler) => {
    map.set(event, [...(map.get(event) ?? []), fn]);
    return socket;
  };
  const socket: FakeSocket = {
    on: on(handlers),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn((event: string, ack?: (snapshot: Snapshot) => void) => {
      if (event === 'subscribe') socket.lastAck = ack;
    }),
    io: { on: on(managerHandlers) },
    lastAck: undefined,
    fire(event: string, ...args: unknown[]) {
      for (const fn of handlers.get(event) ?? []) (fn as (...a: unknown[]) => void)(...args);
    },
  };
  return socket;
}
const order = (id: string, patch: Partial<OrderDto> = {}): OrderDto => ({
  id,
  number: Number(id.replace('o', '')),
  status: 'placed',
  tableId: 't',
  tableNumber: 7,
  items: [],
  subtotalCents: 0,
  totalCents: 0,
  note: null,
  placedAt: '2026-09-03T10:00:00Z',
  cookingAt: null,
  readyAt: null,
  servedAt: null,
  cancelledAt: null,
  createdAt: '2026-09-03T10:00:00Z',
  updatedAt: '2026-09-03T10:00:00Z',
  ...patch,
});

describe('KitchenBoard', () => {
  it('renders the first snapshot from the server, subscribes on connect and applies events', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[order('o1')]}
        staffName="Theo"
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={vi.fn()}
      />,
    );
    expect(
      within(screen.getByRole('region', { name: 'New' })).getByRole('heading', {
        name: 'Table 7 · #1',
      }),
    ).toBeInTheDocument();
    expect(socket.connect).toHaveBeenCalled();
    act(() => socket.fire('connect'));
    expect(socket.emit).toHaveBeenCalledWith('subscribe', expect.any(Function));
    act(() =>
      socket.lastAck?.({
        orders: [order('o1', { status: 'cooking', updatedAt: '2026-09-03T10:01:00Z' })],
        serverTime: '2026-09-03T10:01:00Z',
      }),
    );
    expect(
      within(screen.getByRole('region', { name: 'Cooking' })).getByRole('heading', {
        name: 'Table 7 · #1',
      }),
    ).toBeInTheDocument();
    act(() => socket.fire('order:created', { order: order('o2') }));
    expect(
      within(screen.getByRole('region', { name: 'New' })).getByRole('article'),
    ).toHaveAttribute('data-fresh', 'true');
    expect(document.title).toBe('(1) Kitchen · TableTap');
  });
  it('shows the banner while offline and clears the fresh mark when a ticket is touched', async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    const fetcher = vi.fn().mockResolvedValue({
      order: order('o1', { status: 'cooking', updatedAt: '2026-09-03T10:02:00Z' }),
    });
    render(
      <KitchenBoard
        initialOrders={[]}
        staffName="Theo"
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={fetcher}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to the kitchen feed…');
    act(() => socket.fire('connect'));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => socket.fire('disconnect'));
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting… the board will catch up.');
    act(() => socket.fire('order:created', { order: order('o1') }));
    await user.click(screen.getByRole('button', { name: 'Start #1' }));
    expect(fetcher).toHaveBeenCalledWith(
      '/api/orders/o1/transition',
      expect.objectContaining({
        init: expect.objectContaining({ method: 'POST', body: JSON.stringify({ to: 'cooking' }) }),
      }),
    );
    expect(
      within(screen.getByRole('region', { name: 'Cooking' })).getByRole('article'),
    ).not.toHaveAttribute('data-fresh');
  });
  it("rolls back a lost race with the server's word and resubscribes", async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    const { ApiError } = await import('../../lib/api');
    const fetcher = vi.fn().mockRejectedValue(
      new ApiError(409, 'INVALID_TRANSITION', 'This order is cooking now.', {
        from: 'placed',
        to: 'cooking',
        current: 'cooking',
      }),
    );
    render(
      <KitchenBoard
        initialOrders={[order('o1')]}
        staffName="Theo"
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={fetcher}
      />,
    );
    act(() => socket.fire('connect'));
    socket.emit.mockClear();
    await user.click(screen.getByRole('button', { name: 'Start #1' }));
    expect(await screen.findByText("Couldn't move #1. It is Cooking now.")).toBeInTheDocument();
    expect(socket.emit).toHaveBeenCalledWith('subscribe', expect.any(Function));
  });
  it('drops everything and resubscribes on demo:reset', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[order('o1')]}
        staffName="Theo"
        demoMode
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={vi.fn()}
      />,
    );
    act(() => socket.fire('connect'));
    socket.emit.mockClear();
    act(() => socket.fire('demo:reset'));
    expect(screen.queryByRole('article')).toBeNull();
    expect(socket.emit).toHaveBeenCalledWith('subscribe', expect.any(Function));
    expect(screen.getByRole('button', { name: 'Simulate rush' })).toBeInTheDocument();
  });
});
