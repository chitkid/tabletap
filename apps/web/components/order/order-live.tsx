'use client';
import type { OrderDto } from '@tabletap/shared';
import { useEffect, useState } from 'react';
import { createSocket, type AppSocket } from '../../lib/socket';
import { OrderScreen, headlineFor } from './order-screen';

/** The receipt keeps itself current: one socket, one room (the table's), one order to watch. */
export function OrderLive({
  initial,
  currency,
  paidStatus,
  socketFactory = createSocket,
}: {
  initial: OrderDto;
  currency: string;
  /** What the trip back from the terminal claims happened. Never evidence on its own. */
  paidStatus?: 'received' | 'declined';
  socketFactory?: () => AppSocket;
}) {
  const [order, setOrder] = useState(initial);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    const socket = socketFactory();
    const take = (next: OrderDto) => {
      if (next.id !== initial.id) return;
      setOrder((prev) => (Date.parse(next.updatedAt) >= Date.parse(prev.updatedAt) ? next : prev));
    };
    socket.on('connect', () =>
      socket.emit('subscribe', (snapshot) => {
        // The server could not answer this time. Silence is not "your order is gone".
        if (snapshot === null) return;
        const mine = snapshot.orders.find((o) => o.id === initial.id);
        if (mine) take(mine);
        else setCleared(true);
      }),
    );
    socket.on('order:updated', ({ order: next }) => take(next));
    socket.on('demo:reset', () => setCleared(true));
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [initial.id, socketFactory]);
  const notice =
    paidStatus === 'declined'
      ? 'Payment declined. Try again.'
      : paidStatus === 'received' && order.status === 'placed'
        ? 'Payment received. Confirming…'
        : null;
  return (
    <>
      {!cleared && order.status === 'ready' ? (
        <p role="alert" className="sr-only">
          {headlineFor(order)}
        </p>
      ) : null}
      {cleared ? (
        // `OrderScreen` renders its own live region (the elapsed-time clock); once the order is
        // gone that clock is no longer telling the truth, so the cleared notice replaces the
        // whole receipt rather than sitting on top of it.
        <p
          role="status"
          aria-live="polite"
          className="mx-auto w-full max-w-2xl px-4 pt-6 text-muted-foreground"
        >
          This order was cleared by the hourly demo reset.
        </p>
      ) : (
        <>
          {/* The redirect back from a payment page is a claim, not a receipt: only the socket
              delivering a paid order settles it, and the moment it does this notice has nothing
              left to say and goes. A decline needs no such waiting — nothing is in flight — so
              it is a plain line that stays put above the Pay button offering another attempt. */}
          {notice !== null ? (
            <p
              role="status"
              aria-live="polite"
              className={`mx-auto w-full max-w-2xl px-4 pt-6 ${
                paidStatus === 'declined' ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {notice}
            </p>
          ) : null}
          <OrderScreen order={order} currency={currency} />
        </>
      )}
    </>
  );
}
