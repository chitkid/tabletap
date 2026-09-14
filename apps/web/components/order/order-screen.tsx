import type { OrderDto, OrderStatus } from '@tabletap/shared';
import { StatusBadge } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCents } from '../../lib/money';
import { ElapsedSince } from './elapsed-since';
import { PayButton } from './pay-button';

/**
 * Which sentence in `guest.order.headline` a status earns.
 *
 * 'draft' and 'placed' both read as owing money. A guest never sees 'draft' (the order does not
 * exist for them until it is placed), and since M4 the kitchen only receives an order once it is
 * paid — so the difference a guest must see in the first line is between an order that is waiting
 * for money and one that is already with the kitchen.
 */
const HEADLINE: Record<OrderStatus, string> = {
  draft: 'placed',
  placed: 'placed',
  paid: 'paid',
  cooking: 'cooking',
  ready: 'ready',
  served: 'served',
  cancelled: 'cancelled',
};

/** The one-line status a guest reads first, in the brand voice, for every stage of the order. */
export function useHeadline(): (order: OrderDto) => string {
  const t = useTranslations('guest.order.headline');
  return (order) => t(HEADLINE[order.status], { number: order.number });
}

/**
 * The receipt a guest keeps open on the table. It says the one thing they came for in the first
 * line — the order is with the kitchen — and then answers, in order, the questions that follow:
 * what state is it in, how long has it been, and what did I actually order.
 */
export function OrderScreen({
  order,
  currency,
  onPay,
  rail,
}: {
  order: OrderDto;
  currency: string;
  /**
   * The control offered while the order is waiting for payment. It defaults to the real
   * `PayButton`, so the live receipt needs to say nothing; passing one in is the seam a test
   * uses to drive Pay without a network, and passing `null` renders no control at all.
   */
  onPay?: ReactNode;
  /**
   * Whatever sits above the headline — the live progress rail and the payment notice, for
   * `OrderLive`. Rendered first inside `main`, so it shares the one landmark on the page rather
   * than sitting outside it. Left off entirely, `OrderScreen` renders nothing extra here — the
   * standalone case this component's own test exercises.
   */
  rail?: ReactNode;
}) {
  const t = useTranslations('guest');
  // The badge takes the glossary's guest column: `ready` is «Готов — сейчас принесут» here and
  // «Готов» on the kitchen board, because the guest is told what happens to them and the staff
  // what the order is.
  const status = useTranslations('status.guest');
  const headlineFor = useHeadline();
  // `undefined` rather than a nullish check, so a caller can pass `null` to mean "no control"
  // and still get the default by leaving the prop off.
  const pay =
    onPay === undefined ? (
      <PayButton orderId={order.id} totalCents={order.totalCents} currency={currency} />
    ) : (
      onPay
    );
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      {rail}
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold">{headlineFor(order)}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={order.status} label={status(order.status)} />
          <span className="text-muted-foreground">{t('table', { number: order.tableNumber })}</span>
        </div>
        <ElapsedSince iso={order.placedAt ?? order.createdAt} />
      </header>

      {/* Directly under the headline that says money is owed, and above the lines it is owed
          for: the answer to "waiting for payment" should not be below the fold. */}
      {order.status === 'placed' ? pay : null}

      <section
        aria-labelledby="order-lines-heading"
        className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm"
      >
        <h2 id="order-lines-heading" className="sr-only">
          {t('order.linesHeading')}
        </h2>
        <ul>
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3 border-b border-border py-2 first:pt-0 last:border-b-0 last:pb-0"
            >
              <span>{`${item.quantity} × ${item.name}`}</span>
              <span className="font-semibold">{formatCents(item.lineTotalCents, currency)}</span>
            </li>
          ))}
        </ul>
        {/* One text node, as on the basket bar and in the sheet: a bare figure repeated beside a
            label reads as a second amount to anyone scanning the column. */}
        <p className="pt-3 font-semibold">
          {t('order.total', { amount: formatCents(order.totalCents, currency) })}
        </p>
      </section>

      {order.note !== null && order.note !== '' ? (
        <section aria-labelledby="order-note-heading" className="flex flex-col gap-1">
          <h2 id="order-note-heading" className="font-semibold">
            {t('order.noteHeading')}
          </h2>
          <p>{order.note}</p>
        </section>
      ) : null}

      <Link href="/menu" className="underline underline-offset-4">
        {t('order.backToMenu')}
      </Link>
    </main>
  );
}
