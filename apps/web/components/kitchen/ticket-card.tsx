'use client';
import type { OrderDto, OrderStatus } from '@tabletap/shared';
import { Button, StatusBadge, cn } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { NEXT_STATUS, isBumpable } from '../../lib/board-store';
import { thresholdFor, timerStartOf } from '../../lib/timer-threshold';
import { TimerBadge } from './timer-badge';

const RULE = {
  ok: 'border-t-timer-ok',
  warn: 'border-t-timer-warn',
  late: 'border-t-timer-late',
} as const;

/**
 * How a ticket arrives: it fades and rises into its column. `starting:` is `@starting-style`, so
 * the faded state exists only for the instant the card is inserted — which is also why the same
 * two lines cover a ticket moving between columns, since the card in the new column is a new
 * element, and why nothing is left animating in the column it left. A cook reading the board at a
 * glance must not see a ticket lingering where it no longer is.
 *
 * Only opacity and transform, so an arriving ticket moves nothing else on the board.
 */
const ARRIVING =
  'transition-[opacity,translate] duration-[var(--motion-base)] ease-[var(--motion-ease)] starting:translate-y-2 starting:opacity-0';

export function TicketCard({
  order,
  now,
  fresh,
  pending = false,
  arriving = false,
  onBump,
  onCancel,
}: {
  order: OrderDto;
  now: number;
  fresh: boolean;
  pending?: boolean;
  /** Whether this card is landing on a board that is already on screen, rather than being part of
   * the board's own first paint. The board decides; the card only knows how to arrive. */
  arriving?: boolean;
  onBump: (order: OrderDto, to: OrderStatus) => void;
  onCancel: (order: OrderDto) => void;
}) {
  /**
   * The board's own column of the glossary: the staff are told what the order is, so `ready` here
   * is «Готов» and not the guest's «Готов — сейчас принесут».
   *
   * **Singular, and it does not match the column heading above it.** `status.kitchen` is the word
   * for *one order's* state and belongs on a ticket; `kitchen.columns` names a group of tickets
   * and is plural — «Готов» on this badge, «Готовы» on the heading. Same glossary, two
   * grammatical positions. Do not align them; `kitchen-board.tsx` carries the other half of this
   * note. Ruled by the copy owner, 2026-09-14.
   */
  const status = useTranslations('status.kitchen');
  const t = useTranslations('kitchen.ticket');
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
  // Narrowed here rather than in the JSX: `kitchen.ticket.bump` has a verb for exactly the three
  // statuses a cook may bump on, and this is what makes asking for one type-safe.
  const bump = isBumpable(order.status)
    ? { to: NEXT_STATUS[order.status], label: t(`bump.${order.status}`, { number: order.number }) }
    : null;
  const cancellable = order.status === 'placed' || order.status === 'paid';
  const confirmLabel = t('confirm', { number: order.number });
  return (
    <article
      ref={cardRef}
      aria-labelledby={`ticket-${order.id}`}
      data-fresh={fresh ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border border-t-4 bg-card p-4 text-card-foreground',
        RULE[thresholdFor(elapsedMs)],
        fresh && 'border-l-4 border-l-primary',
        arriving && ARRIVING,
      )}
    >
      {/* Wraps as two whole phrases rather than breaking either one: a three-column board is not
          wide enough for a long table number beside the timer, and «Стол 12 ·» over «№ 3» is not
          a headline. Whether it wraps no longer depends on the ticket's age — the badge reserves
          its widest box from first paint — so a card that wraps wraps for its whole life. */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <h3
          id={`ticket-${order.id}`}
          className="font-display text-2xl leading-none font-bold whitespace-nowrap"
        >
          {t('heading', { table: order.tableNumber, number: order.number })}
        </h3>
        <TimerBadge elapsedMs={elapsedMs} />
      </header>
      <ul className="flex flex-col gap-1 text-lg font-medium">
        {order.items.map((item) => (
          <li key={item.id}>{`${item.quantity} × ${item.name}`}</li>
        ))}
      </ul>
      {order.note ? (
        <p className="text-sm text-muted-foreground">{t('note', { note: order.note })}</p>
      ) : null}
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <StatusBadge status={order.status} label={status(order.status)} />
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
            >
              {t('cancel', { number: order.number })}
            </Button>
          ) : null}
          {cancellable && confirming ? (
            <span role="group" aria-label={confirmLabel} className="flex items-center gap-2">
              <span>{confirmLabel}</span>
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
                {t('confirmYes')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  restore.current = 'cancel';
                  setConfirming(false);
                }}
              >
                {t('confirmKeep')}
              </Button>
            </span>
          ) : null}
          {bump ? (
            <Button
              type="button"
              data-bump
              disabled={pending}
              aria-busy={pending}
              onClick={() => onBump(order, bump.to)}
            >
              {bump.label}
            </Button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
