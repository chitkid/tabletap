import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it, vi } from 'vitest';
import { createChime } from '../../lib/chime';
import type { AppSocket } from '../../lib/socket';
import { fakeSocket } from '../../test/fake-socket';
import { KitchenBoard } from './kitchen-board';

// The real one needs an AudioContext, which jsdom does not have; the board's own use of it -
// when it is built, and whether it is built at all - is what these tests are about.
vi.mock('../../lib/chime', () => ({ createChime: vi.fn(() => ({ play: vi.fn() })) }));

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

const SERVER_NOW = Date.parse('2026-09-03T10:00:00Z');

describe('KitchenBoard', () => {
  it('renders the first snapshot from the server, subscribes on connect and applies events', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[order('o1')]}
        staffName="Theo"
        serverNow={SERVER_NOW}
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
        serverNow={SERVER_NOW}
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
        serverNow={SERVER_NOW}
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
        serverNow={SERVER_NOW}
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
  it('drops the new mark when another screen moves the ticket on', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={vi.fn()}
      />,
    );
    act(() => socket.fire('connect'));
    act(() => socket.fire('order:created', { order: order('o12') }));
    expect(
      within(screen.getByRole('region', { name: 'New' })).getByRole('article'),
    ).toHaveAttribute('data-fresh', 'true');
    expect(document.title).toBe('(1) Kitchen · TableTap');
    act(() =>
      socket.fire('order:updated', {
        order: order('o12', {
          status: 'cooking',
          cookingAt: '2026-09-03T10:01:00Z',
          updatedAt: '2026-09-03T10:01:00Z',
        }),
      }),
    );
    expect(
      within(screen.getByRole('region', { name: 'Cooking' })).getByRole('article'),
    ).not.toHaveAttribute('data-fresh');
    expect(document.title).toBe('Kitchen · TableTap');
  });
  it('stops counting a ticket that leaves the board entirely', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={vi.fn()}
      />,
    );
    act(() => socket.fire('connect'));
    act(() => socket.fire('order:created', { order: order('o12') }));
    expect(document.title).toBe('(1) Kitchen · TableTap');
    act(() =>
      socket.fire('order:updated', {
        order: order('o12', {
          status: 'cancelled',
          cancelledAt: '2026-09-03T10:01:00Z',
          updatedAt: '2026-09-03T10:01:00Z',
        }),
      }),
    );
    expect(screen.queryByRole('article')).toBeNull();
    expect(document.title).toBe('Kitchen · TableTap');
  });
  it('keeps a ticket that arrived while the snapshot was being read', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={vi.fn()}
      />,
    );
    act(() => socket.fire('connect'));
    act(() =>
      socket.fire('order:created', { order: order('o2', { updatedAt: '2026-09-03T10:05:00Z' }) }),
    );
    // The snapshot began reading before that order existed, so it cannot carry it.
    act(() => socket.lastAck?.({ orders: [], serverTime: '2026-09-03T10:04:00Z' }));
    expect(screen.getByRole('heading', { name: 'Table 7 · #2' })).toBeInTheDocument();
  });
  it('keeps the board and retries when the server cannot answer', () => {
    vi.useFakeTimers();
    try {
      const socket = fakeSocket();
      render(
        <KitchenBoard
          initialOrders={[order('o1')]}
          staffName="Theo"
          serverNow={SERVER_NOW}
          demoMode={false}
          socketFactory={() => socket as unknown as AppSocket}
          fetcher={vi.fn()}
        />,
      );
      act(() => socket.fire('connect'));
      socket.emit.mockClear();
      act(() => socket.lastAck?.(null));
      expect(screen.getByRole('heading', { name: 'Table 7 · #1' })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent("Couldn't refresh the board. Retrying…");
      expect(socket.emit).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(2_000));
      expect(socket.emit).toHaveBeenCalledWith('subscribe', expect.any(Function));
      act(() => socket.lastAck?.({ orders: [order('o1')], serverTime: '2026-09-03T10:00:00Z' }));
      expect(screen.queryByRole('status')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('times a ticket by the kitchen clock, not the clock of the screen showing it', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(SERVER_NOW);
      const socket = fakeSocket();
      render(
        <KitchenBoard
          initialOrders={[order('o1')]}
          staffName="Theo"
          serverNow={SERVER_NOW}
          demoMode={false}
          socketFactory={() => socket as unknown as AppSocket}
          fetcher={vi.fn()}
        />,
      );
      expect(screen.getByRole('timer')).toHaveTextContent('0:00');
      // This display is a minute and a half behind the kitchen; the ticket is that much older.
      act(() => socket.fire('connect'));
      act(() => socket.lastAck?.({ orders: [order('o1')], serverTime: '2026-09-03T10:01:30Z' }));
      expect(screen.getByRole('timer')).toHaveTextContent('1:30');
    } finally {
      vi.useRealTimers();
    }
  });
  it('says it is offline the moment the browser does, and reconnects when it returns', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={vi.fn()}
      />,
    );
    act(() => socket.fire('connect'));
    expect(screen.queryByRole('status')).toBeNull();
    // Waiting for the heartbeat to time out would leave a dead board looking live for seconds.
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting… the board will catch up.');
    // A short blip leaves the socket believing it is still connected - and it is right, since
    // nothing ever closed it. There is nothing to reconnect, so the board just stops apologising.
    socket.connect.mockClear();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByRole('status')).toBeNull();
    expect(socket.connect).not.toHaveBeenCalled();
  });
  it('reconnects when the connection really did drop while the browser was offline', () => {
    const socket = fakeSocket();
    render(
      <KitchenBoard
        initialOrders={[]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={vi.fn()}
      />,
    );
    act(() => socket.fire('connect'));
    act(() => void window.dispatchEvent(new Event('offline')));
    act(() => socket.fire('disconnect'));
    socket.connect.mockClear();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(socket.connect).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting… the board will catch up.');
  });
  it('ignores a move that resolves after a demo reset', async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    let settle: (value: { order: OrderDto }) => void = () => {};
    const inFlight = new Promise<{ order: OrderDto }>((resolve) => {
      settle = resolve;
    });
    const fetcher = vi.fn().mockReturnValue(inFlight);
    render(
      <KitchenBoard
        initialOrders={[order('o3')]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={fetcher}
      />,
    );
    act(() => socket.fire('connect'));
    await user.click(screen.getByRole('button', { name: 'Start #3' }));
    act(() => socket.fire('demo:reset'));
    expect(screen.queryByRole('article')).toBeNull();
    await act(async () => {
      settle({ order: order('o3', { status: 'cooking', updatedAt: '2026-09-03T10:02:00Z' }) });
      await inFlight;
    });
    expect(screen.queryByRole('article')).toBeNull();
  });
  it('says a refused move is about the role, not about the ticket', async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    const { ApiError } = await import('../../lib/api');
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'A waiter may not start cooking.'));
    render(
      <KitchenBoard
        initialOrders={[order('o1')]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={fetcher}
      />,
    );
    act(() => socket.fire('connect'));
    await user.click(screen.getByRole('button', { name: 'Start #1' }));
    // The ticket is still Placed and the board knows it: the refusal is about who asked.
    expect(await screen.findByText("You can't move #1.")).toBeInTheDocument();
    expect(screen.queryByText(/It is Placed now/)).toBeNull();
  });
  it('builds the chime on the first gesture when sound was left on', () => {
    window.localStorage.setItem('tt-kitchen-sound', 'on');
    try {
      const socket = fakeSocket();
      render(
        <KitchenBoard
          initialOrders={[]}
          staffName="Theo"
          serverNow={SERVER_NOW}
          demoMode={false}
          socketFactory={() => socket as unknown as AppSocket}
          fetcher={vi.fn()}
        />,
      );
      // The label says the sound is on, so it has to be on as soon as the browser allows it -
      // which is the first gesture anywhere on the page, not the next press of this toggle.
      expect(screen.getByRole('button', { name: 'Sound on' })).toBeInTheDocument();
      expect(createChime).not.toHaveBeenCalled();
      act(() => void document.dispatchEvent(new Event('pointerdown')));
      expect(createChime).toHaveBeenCalled();
    } finally {
      window.localStorage.clear();
    }
  });
  it('leaves focus on the board after a cancel is confirmed', async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    const fetcher = vi.fn().mockResolvedValue({
      order: order('o1', { status: 'cancelled', updatedAt: '2026-09-03T10:02:00Z' }),
    });
    render(
      <KitchenBoard
        initialOrders={[order('o1'), order('o2')]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={fetcher}
      />,
    );
    act(() => socket.fire('connect'));
    await user.click(screen.getByRole('button', { name: 'Cancel #1' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    // The card the cook was working in has gone; focus goes to the next ticket, not to <body>.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start #2' }));
  });
  it('falls back to the column heading when the cancelled ticket was the last one', async () => {
    const user = userEvent.setup();
    const socket = fakeSocket();
    const fetcher = vi.fn().mockResolvedValue({
      order: order('o1', { status: 'cancelled', updatedAt: '2026-09-03T10:02:00Z' }),
    });
    render(
      <KitchenBoard
        initialOrders={[order('o1')]}
        staffName="Theo"
        serverNow={SERVER_NOW}
        demoMode={false}
        socketFactory={() => socket as unknown as AppSocket}
        fetcher={fetcher}
      />,
    );
    act(() => socket.fire('connect'));
    await user.click(screen.getByRole('button', { name: 'Cancel #1' }));
    await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /^New/ }));
  });
});
