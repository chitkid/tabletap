'use client';
import {
  OrderResponseSchema,
  type BoardSnapshot,
  type OrderDto,
  type OrderStatus,
} from '@tabletap/shared';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ApiError, clientFetch } from '../../lib/api';
import {
  COLUMNS,
  applyEvent,
  applySnapshot,
  clockOffsetOf,
  columnsOf,
  inNewColumn,
  mergeSnapshot,
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

type Action =
  | { type: 'snapshot'; snapshot: BoardSnapshot }
  | { type: 'cleared' }
  | { type: 'event'; order: OrderDto };
const reducer = (state: BoardState, action: Action): BoardState => {
  if (action.type === 'cleared') return applySnapshot([]);
  if (action.type === 'snapshot') return mergeSnapshot(state, action.snapshot);
  return applyEvent(state, action.order);
};
/** A refused snapshot is retried, backing off so a struggling API is not asked once a second. */
const RETRY_FIRST_MS = 2_000;
const RETRY_MAX_MS = 10_000;
const STALE_NOTICE = "Couldn't refresh the board. Retrying…";
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
  serverNow,
  demoMode,
  socketFactory = createSocket,
  fetcher = clientFetch,
}: {
  initialOrders: OrderDto[];
  staffName: string;
  /** The API's clock at render time. The server's HTML then paints real ages, not 0:00. */
  serverNow: number;
  demoMode: boolean;
  socketFactory?: () => AppSocket;
  fetcher?: Fetcher;
}) {
  const [state, dispatch] = useReducer(reducer, initialOrders, applySnapshot);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [offset, setOffset] = useState(0);
  const [stale, setStale] = useState(false);
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
  // What the board holds, as the socket handlers see it: they are registered once, so they cannot
  // read today's state through the closure they were built with. Written by the handler that
  // dispatches - two events can land in one tick, before any render - and re-synced after each.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const chime = useRef<ReturnType<typeof createChime> | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  // Bumped by every demo reset. A transition that resolves after one belongs to orders the
  // reset deleted, and dispatching it would put a ghost ticket back on a cleared board.
  const generation = useRef(0);
  const retry = useRef<{ timer: ReturnType<typeof setTimeout> | null; delayMs: number }>({
    timer: null,
    delayMs: RETRY_FIRST_MS,
  });
  // Every timer on the board is the kitchen's answer, corrected for whatever this screen's own
  // clock believes.
  const now = useNow(1_000, serverNow) + offset;

  const visible = ordersOf(state).map((o) =>
    optimistic[o.id] ? { ...o, status: optimistic[o.id]! } : o,
  );
  const columns = columnsOf(visible);
  // `fresh` only records what arrived on this screen; the board says what is still new. A ticket
  // another screen started, or one a guest cancelled, stops being new here too — so the mark and
  // the tab counter are the intersection, not the raw set.
  const freshIds = new Set(columns.new.filter((o) => fresh.has(o.id)).map((o) => o.id));

  const resync = useCallback(function run() {
    socketRef.current?.emit('subscribe', (snapshot) => {
      if (retry.current.timer !== null) clearTimeout(retry.current.timer);
      if (snapshot === null) {
        // The board keeps every ticket it holds: the server said "not now", not "nothing left".
        setStale(true);
        retry.current.timer = setTimeout(run, retry.current.delayMs);
        retry.current.delayMs = Math.min(retry.current.delayMs * 2, RETRY_MAX_MS);
        return;
      }
      retry.current = { timer: null, delayMs: RETRY_FIRST_MS };
      setStale(false);
      setOffset(clockOffsetOf(snapshot, Date.now()));
      dispatch({ type: 'snapshot', snapshot });
    });
  }, []);

  useEffect(() => {
    const socket = socketFactory();
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnection('online');
      resync();
    });
    socket.on('disconnect', () => setConnection('offline'));
    // A ticket is new to the kitchen when it *enters* the New column, whichever event carries it
    // there. A guest placing an order is `order:created` and is not yet paid, so the board draws
    // nothing and says nothing; the settlement that follows is an `order:updated`, and that is
    // the moment the cook has a ticket to see.
    const receive = (order: OrderDto) => {
      const before = stateRef.current;
      const after = applyEvent(before, order);
      stateRef.current = after;
      dispatch({ type: 'event', order });
      if (inNewColumn(before, order.id) || !inNewColumn(after, order.id)) return;
      setFresh((prev) => new Set(prev).add(order.id));
      if (soundRef.current) chime.current?.play();
    };
    socket.on('order:created', ({ order }) => receive(order));
    socket.on('order:updated', ({ order }) => receive(order));
    socket.on('demo:reset', () => {
      generation.current += 1;
      dispatch({ type: 'cleared' });
      setFresh(new Set());
      setPending(new Set());
      setOptimistic({});
      resync();
    });
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      if (retry.current.timer !== null) clearTimeout(retry.current.timer);
      retry.current = { timer: null, delayMs: RETRY_FIRST_MS };
    };
  }, [socketFactory, resync]);

  // The heartbeat is the backstop; the browser knows first. A board that keeps showing tickets
  // it can no longer be told about is worse than one that admits it.
  useEffect(() => {
    const lost = () => setConnection('offline');
    const back = () => {
      const socket = socketRef.current;
      if (!socket) return;
      // A short blip never closes an established socket, so there is nothing to reconnect: the
      // board only has to stop apologising, and ask for a snapshot in case it missed anything.
      if (socket.connected) {
        setConnection('online');
        resync();
        return;
      }
      socket.connect();
    };
    window.addEventListener('offline', lost);
    window.addEventListener('online', back);
    return () => {
      window.removeEventListener('offline', lost);
      window.removeEventListener('online', back);
    };
  }, [resync]);

  // A remembered "Sound on" is a label the board has to honour. The AudioContext still needs a
  // gesture, so take the first one anywhere on the page rather than waiting for this toggle to
  // be pressed again - otherwise the button says on and the room hears nothing.
  useEffect(() => {
    if (!sound || chime.current !== null) return;
    const build = () => {
      chime.current ??= createChime();
      document.removeEventListener('pointerdown', build);
      document.removeEventListener('keydown', build);
    };
    document.addEventListener('pointerdown', build);
    document.addEventListener('keydown', build);
    return () => {
      document.removeEventListener('pointerdown', build);
      document.removeEventListener('keydown', build);
    };
  }, [sound]);

  const freshCount = freshIds.size;
  useEffect(() => {
    document.title = freshCount > 0 ? `(${freshCount}) Kitchen · TableTap` : 'Kitchen · TableTap';
  }, [freshCount]);

  const touch = (id: string) =>
    setFresh((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  const move = async (order: OrderDto, to: OrderStatus) => {
    // Everything this move touches afterwards is about a board that may no longer exist.
    const started = generation.current;
    const sameBoard = () => generation.current === started;
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
      if (sameBoard()) dispatch({ type: 'event', order: updated });
    } catch (err) {
      if (!sameBoard()) return;
      // A 403 is about who asked, not about where the ticket is. Telling a waiter the ticket "is
      // Placed now" reads as a lost race and invites them to press again.
      if (err instanceof ApiError && err.code === 'FORBIDDEN') {
        setNotice(`You can't move #${order.number}.`);
        return;
      }
      const current =
        err instanceof ApiError &&
        err.code === 'INVALID_TRANSITION' &&
        isStatus((err.details as { current?: unknown } | undefined)?.current)
          ? (err.details as { current: OrderStatus }).current
          : order.status;
      setNotice(`Couldn't move #${order.number}. It is ${STATUS_WORD[current]} now.`);
      resync();
    } finally {
      // The reset already emptied both; re-clearing here would only churn a render.
      if (sameBoard()) {
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
    }
  };
  const onSound = (enabled: boolean) => {
    if (enabled && !chime.current) chime.current = createChime();
    if (enabled) chime.current?.play();
    setSound(enabled);
  };

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
      {stale ? (
        <p role="status" aria-live="polite" className="px-6 py-2 text-timer-warn">
          {STALE_NOTICE}
        </p>
      ) : null}
      {notice ? (
        <p role="status" aria-live="polite" className="px-6 py-2 text-timer-warn">
          {notice}
        </p>
      ) : null}
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <section key={col.key} aria-label={col.title} className="flex flex-col gap-4">
            {/* Focusable only by script: where focus lands when the ticket it was in is gone. */}
            <h2
              tabIndex={-1}
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >{`${col.title} · ${columns[col.key].length}`}</h2>
            {columns[col.key].length === 0 ? (
              <p className="text-muted-foreground">Nothing here.</p>
            ) : null}
            <ul className="flex flex-col gap-4">
              {columns[col.key].map((order) => (
                <li key={order.id}>
                  <TicketCard
                    order={order}
                    now={now}
                    fresh={freshIds.has(order.id)}
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
