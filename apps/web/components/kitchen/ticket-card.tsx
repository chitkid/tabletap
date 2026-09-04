'use client';
import type { OrderDto, OrderStatus } from '@tabletap/shared';
import { Button, StatusBadge, cn } from '@tabletap/ui';
import { useEffect, useRef, useState } from 'react';
import { BUMP_LABEL, NEXT_STATUS } from '../../lib/board-store';
import { thresholdFor, timerStartOf } from '../../lib/timer-threshold';
import { TimerBadge } from './timer-badge';

const RULE = {
  ok: 'border-t-timer-ok',
  warn: 'border-t-timer-warn',
  late: 'border-t-timer-late',
} as const;

export function TicketCard({
  order,
  now,
  fresh,
  pending = false,
  onBump,
  onCancel,
}: {
  order: OrderDto;
  now: number;
  fresh: boolean;
  pending?: boolean;
  onBump: (order: OrderDto, to: OrderStatus) => void;
  onCancel: (order: OrderDto) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // Opening and dismissing the confirm unmounts the control that was just pressed, which drops
  // keyboard focus to the document. A cook working a bump bar would land back at the page top.
  const cardRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const restore = useRef<'confirm' | 'cancel' | null>(null);
  useEffect(() => {
    const target = restore.current;
    if (target === null) return;
    restore.current = null;
    (target === 'confirm' ? confirmRef : cancelRef).current?.focus();
  }, [confirming]);
  /**
   * Confirming a cancel takes the whole card off the board, and with it the button that was just
   * pressed. Hand focus on first, while there is still a card to hand it from: the next ticket's
   * bump button, or the column's own heading when this was the last one.
   */
  const handOverFocus = () => {
    const item = cardRef.current?.closest('li');
    const siblings = [...(item?.parentElement?.children ?? [])].filter((el) => el !== item);
    const nextBump = siblings
      .map((el) => el.querySelector<HTMLButtonElement>('button[data-bump]'))
      .find((button) => button !== null);
    const heading = cardRef.current?.closest('section')?.querySelector<HTMLElement>('h2');
    (nextBump ?? heading)?.focus();
  };
  const elapsedMs = Math.max(0, now - Date.parse(timerStartOf(order)));
  const next = NEXT_STATUS[order.status];
  const verb = BUMP_LABEL[order.status];
  const cancellable = order.status === 'placed' || order.status === 'paid';
  return (
    <article
      ref={cardRef}
      aria-labelledby={`ticket-${order.id}`}
      data-fresh={fresh ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border border-t-4 bg-card p-4 text-card-foreground',
        RULE[thresholdFor(elapsedMs)],
        fresh && 'border-l-4 border-l-primary',
      )}
    >
      {/* Wraps as two whole phrases rather than breaking either one: past five minutes the timer
          grows a mark and a suffix, and a three-column board is not wide enough for both on a
          long table number. "Table 12 ·" over "#3" is not a headline. */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3
          id={`ticket-${order.id}`}
          className="font-display text-2xl leading-none font-bold whitespace-nowrap"
        >{`Table ${order.tableNumber} · #${order.number}`}</h3>
        <TimerBadge elapsedMs={elapsedMs} />
      </header>
      <ul className="flex flex-col gap-1 text-lg font-medium">
        {order.items.map((item) => (
          <li key={item.id}>{`${item.quantity} × ${item.name}`}</li>
        ))}
      </ul>
      {order.note ? <p className="text-sm text-muted-foreground">{`Note: ${order.note}`}</p> : null}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <StatusBadge status={order.status} />
        <div className="flex flex-wrap gap-2">
          {cancellable && !confirming ? (
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              onClick={() => {
                restore.current = 'confirm';
                setConfirming(true);
              }}
            >{`Cancel #${order.number}`}</Button>
          ) : null}
          {cancellable && confirming ? (
            <span
              role="group"
              aria-label={`Cancel #${order.number}?`}
              className="flex items-center gap-2"
            >
              <span>{`Cancel #${order.number}?`}</span>
              <Button
                ref={confirmRef}
                type="button"
                variant="destructive"
                onClick={() => {
                  handOverFocus();
                  setConfirming(false);
                  onCancel(order);
                }}
              >
                Yes, cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  restore.current = 'cancel';
                  setConfirming(false);
                }}
              >
                Keep
              </Button>
            </span>
          ) : null}
          {next && verb ? (
            <Button
              type="button"
              data-bump
              disabled={pending}
              aria-busy={pending}
              onClick={() => onBump(order, next)}
            >{`${verb} #${order.number}`}</Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
