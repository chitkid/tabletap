'use client';
import type { OrderDto, OrderStatus } from '@tabletap/shared';
import { MOTION, cn } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createSocket, type AppSocket } from '../../lib/socket';
import { OrderScreen, useHeadline } from './order-screen';

/**
 * The five stages a guest's order passes through, in the order it passes through them. The label
 * is the status itself, worded by the glossary's guest column — the rail is a picture of the same
 * statuses the badge names, and a second set of words for them would be a second glossary.
 */
const STAGES = ['placed', 'paid', 'cooking', 'ready', 'served'] as const;

/**
 * How far along the rail an order has got. A draft reads as placed: a guest never sees a draft
 * order, and if one ever reached this screen the honest picture is that nothing has happened yet.
 * A cancelled order is missing on purpose — it did not stop somewhere on this rail, so no rail is
 * drawn for it.
 */
const REACHED: Record<Exclude<OrderStatus, 'cancelled'>, number> = {
  draft: 0,
  placed: 0,
  paid: 1,
  cooking: 2,
  ready: 3,
  served: 4,
};

/**
 * The line grows out of the dot behind it. Growing it with `scaleX` from its left edge is what
 * keeps the dots where they are: a scaled line moves no layout, so the rail advancing costs the
 * page nothing. The dot then answers, which is why it waits a beat rather than moving along.
 */
const GROWS =
  'origin-left transition-[scale] duration-[var(--motion-base)] ease-[var(--motion-ease)]';
const POPS = 'transition-[opacity,scale] duration-[var(--motion-base)] ease-[var(--motion-ease)]';

/**
 * Where the order has got to, as five dots on a line. On arrival it is simply drawn at the stage
 * the order is already at — a transition needs a change, and nothing has changed yet. It moves
 * only when the kitchen moves the order on, which is the whole reason it is here.
 */
function OrderProgress({ status }: { status: OrderStatus }) {
  const t = useTranslations('guest.order');
  const stage = useTranslations('status.guest');
  if (status === 'cancelled') return null;
  const reached = REACHED[status];
  return (
    <ol aria-label={t('progress')} className="grid w-full grid-cols-5">
      {STAGES.map((name, index) => {
        const done = index <= reached;
        return (
          <li
            key={name}
            aria-current={index === reached ? 'step' : undefined}
            className="relative flex flex-col items-center gap-2"
          >
            {index > 0 ? (
              <span
                aria-hidden
                className="absolute top-1.5 right-1/2 -left-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border"
              >
                <span
                  data-line
                  className={cn(
                    'block h-full rounded-full bg-primary',
                    GROWS,
                    done ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </span>
            ) : null}
            <span
              data-dot
              aria-hidden
              className={cn(
                'relative size-3 rounded-full bg-primary',
                POPS,
                done ? 'scale-100 opacity-100' : 'scale-75 opacity-30',
              )}
              style={index > 0 ? { transitionDelay: MOTION.base } : undefined}
            />
            <span className={cn('text-xs', done ? 'text-foreground' : 'text-muted-foreground')}>
              {stage(name)}
            </span>
            {/* On screen a stage says where it stands with a filled dot and a lit label. Colour is
                not an answer on its own, so the same fact is here in a word as well. */}
            <span className="sr-only">
              {index < reached
                ? t('stageDone')
                : index === reached
                  ? t('stageNow')
                  : t('stageToCome')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

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
  const t = useTranslations('guest.order');
  const headlineFor = useHeadline();
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
  // Neither notice is about an order that has stopped waiting for payment. A guest who paid in
  // one tab and declined in another would otherwise be told the payment failed, directly above a
  // headline saying the kitchen has the order and a badge reading «Отправлен на кухню».
  const notice =
    order.status !== 'placed'
      ? null
      : paidStatus === 'declined'
        ? t('paymentDeclined')
        : paidStatus === 'received'
          ? t('paymentReceived')
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
        // whole receipt — landmark included — rather than sitting on top of it.
        //
        // This is where the hourly reset is explained now. The landing used to warn about it in
        // advance; a guest reads it here once, when it is true, and it says what to do rather
        // than naming the machinery that did it.
        <main className="mx-auto w-full max-w-2xl px-4 py-6">
          <p role="status" aria-live="polite" className="text-muted-foreground">
            {t('cleared')}
          </p>
        </main>
      ) : (
        <OrderScreen
          order={order}
          currency={currency}
          rail={
            <>
              {/* The redirect back from a payment page is a claim, not a receipt: only the
                  socket delivering a paid order settles it, and the moment it does this notice
                  has nothing left to say and goes. A decline needs no such waiting — nothing is
                  in flight — so it is a plain line that stays put above the Pay button offering
                  another attempt. */}
              {notice !== null ? (
                <p
                  role="status"
                  aria-live="polite"
                  className={
                    paidStatus === 'declined' ? 'text-destructive' : 'text-muted-foreground'
                  }
                >
                  {notice}
                </p>
              ) : null}
              <OrderProgress status={order.status} />
            </>
          }
        />
      )}
    </>
  );
}
