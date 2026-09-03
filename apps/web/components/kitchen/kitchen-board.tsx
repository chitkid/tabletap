'use client';
import { OrderResponseSchema, type OrderDto, type OrderStatus } from '@tabletap/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, clientFetch } from '../../lib/api';
import {
  COLUMNS,
  applyEvent,
  applySnapshot,
  columnsOf,
  ordersOf,
  type BoardState,
} from '../../lib/board-store';
import { createChime } from '../../lib/chime';
import { createSocket, type AppSocket } from '../../lib/socket';
import { ConnectionBanner, type ConnectionState } from './connection-banner';
import { RushButton } from './rush-button';
import { SignOutButton } from './sign-out-button';
import { SoundToggle, useSoundPreference } from './sound-toggle';
import { TicketCard } from './ticket-card';
import { useNow } from './use-now';

type Action = { type: 'snapshot'; orders: OrderDto[] } | { type: 'event'; order: OrderDto };
const reducer = (state: BoardState, action: Action): BoardState =>
  action.type === 'snapshot' ? applySnapshot(action.orders) : applyEvent(state, action.order);
const STATUS_WORD: Record<OrderStatus, string> = {
  draft: 'Draft',
  placed: 'Placed',
  paid: 'Paid',
  cooking: 'Cooking',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};
const isStatus = (v: unknown): v is OrderStatus => typeof v === 'string' && v in STATUS_WORD;
type Fetcher = typeof clientFetch;

export function KitchenBoard({
  initialOrders,
  staffName,
  demoMode,
  socketFactory = createSocket,
  fetcher = clientFetch,
}: {
  initialOrders: OrderDto[];
  staffName: string;
  demoMode: boolean;
  socketFactory?: () => AppSocket;
  fetcher?: Fetcher;
}) {
  const [state, dispatch] = useReducer(reducer, initialOrders, applySnapshot);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [optimistic, setOptimistic] = useState<Readonly<Record<string, OrderStatus>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [sound, setSound] = useSoundPreference();
  // The socket handlers are registered once and must read today's preference, not the one that
  // was current when they were bound. Mirrored through an effect: a ref written during render
  // is a render side effect, and React is free to throw that render away.
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const chime = useRef<ReturnType<typeof createChime> | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  const now = useNow(1_000);

  const resync = useCallback(() => {
    socketRef.current?.emit('subscribe', (snapshot) =>
      dispatch({ type: 'snapshot', orders: snapshot.orders }),
    );
  }, []);

  useEffect(() => {
    const socket = socketFactory();
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnection('online');
      resync();
    });
    socket.on('disconnect', () => setConnection('offline'));
    socket.on('order:created', ({ order }) => {
      dispatch({ type: 'event', order });
      setFresh((prev) => new Set(prev).add(order.id));
      if (soundRef.current) chime.current?.play();
    });
    socket.on('order:updated', ({ order }) => dispatch({ type: 'event', order }));
    socket.on('demo:reset', () => {
      dispatch({ type: 'snapshot', orders: [] });
      setFresh(new Set());
      resync();
    });
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketFactory, resync]);

  useEffect(() => {
    document.title = fresh.size > 0 ? `(${fresh.size}) Kitchen · TableTap` : 'Kitchen · TableTap';
  }, [fresh]);

  const touch = (id: string) =>
    setFresh((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const move = async (order: OrderDto, to: OrderStatus) => {
    // The last refusal was about the last ticket. Clearing it here means the notice lives
    // exactly as long as it is true, without a timer that fires into an unmounted board.
    setNotice(null);
    touch(order.id);
    setPending((p) => new Set(p).add(order.id));
    setOptimistic((o) => ({ ...o, [order.id]: to }));
    try {
      const { order: updated } = await fetcher(`/api/orders/${order.id}/transition`, {
        schema: OrderResponseSchema,
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to }),
        },
      });
      dispatch({ type: 'event', order: updated });
    } catch (err) {
      const current =
        err instanceof ApiError &&
        err.code === 'INVALID_TRANSITION' &&
        isStatus((err.details as { current?: unknown } | undefined)?.current)
          ? (err.details as { current: OrderStatus }).current
          : order.status;
      setNotice(`Couldn't move #${order.number}. It is ${STATUS_WORD[current]} now.`);
      resync();
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(order.id);
        return next;
      });
      setOptimistic((o) => {
        const next = { ...o };
        delete next[order.id];
        return next;
      });
    }
  };
  const onSound = (enabled: boolean) => {
    if (enabled && !chime.current) chime.current = createChime();
    if (enabled) chime.current?.play();
    setSound(enabled);
  };

  const visible = ordersOf(state).map((o) =>
    optimistic[o.id] ? { ...o, status: optimistic[o.id]! } : o,
  );
  const columns = columnsOf(visible);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-3">
        <h1 className="font-display text-xl font-semibold">Kitchen</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">{staffName}</span>
          {demoMode ? <RushButton fetcher={fetcher} /> : null}
          <SoundToggle enabled={sound} onChange={onSound} />
          <SignOutButton />
        </div>
      </header>
      <ConnectionBanner state={connection} />
      {notice ? (
        <p role="status" aria-live="polite" className="px-6 py-2 text-timer-warn">
          {notice}
        </p>
      ) : null}
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <section key={col.key} aria-label={col.title} className="flex flex-col gap-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{`${col.title} · ${columns[col.key].length}`}</h2>
            {columns[col.key].length === 0 ? (
              <p className="text-muted-foreground">Nothing here.</p>
            ) : null}
            <ul className="flex flex-col gap-4">
              {columns[col.key].map((order) => (
                <li key={order.id}>
                  <TicketCard
                    order={order}
                    now={now}
                    fresh={fresh.has(order.id)}
                    pending={pending.has(order.id)}
                    onBump={(o, to) => void move(o, to)}
                    onCancel={(o) => void move(o, 'cancelled')}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
