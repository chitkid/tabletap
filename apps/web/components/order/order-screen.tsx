import type { OrderDto } from '@tabletap/shared';
import { StatusBadge } from '@tabletap/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCents } from '../../lib/money';
import { ElapsedSince } from './elapsed-since';
import { PayButton } from './pay-button';

/** The one-line status a guest reads first, in the brand voice, for every stage of the order. */
export function headlineFor(order: OrderDto): string {
  switch (order.status) {
    case 'paid':
      return `Order #${order.number} sent to the kitchen.`;
    case 'cooking':
      return `Order #${order.number} is being made.`;
    case 'ready':
      return `Order #${order.number} is ready.`;
    case 'served':
      return `Order #${order.number} was served. Enjoy.`;
    case 'cancelled':
      return `Order #${order.number} was cancelled.`;
    // 'draft' and 'placed' both read as owing money. A guest never sees 'draft' (the order does
    // not exist for them until it is placed), and since M4 the kitchen only receives an order
    // once it is paid — so the difference a guest must see in the first line is between an
    // order that is waiting for money and one that is already with the kitchen.
    default:
      return `Order #${order.number} is waiting for payment.`;
  }
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
}: {
  order: OrderDto;
  currency: string;
  /**
   * The control offered while the order is waiting for payment. It defaults to the real
   * `PayButton`, so the live receipt needs to say nothing; passing one in is the seam a test
   * uses to drive Pay without a network, and passing `null` renders no control at all.
   */
  onPay?: ReactNode;
}) {
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
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold">{headlineFor(order)}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={order.status} />
          <span className="text-muted-foreground">{`Table ${order.tableNumber}`}</span>
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
          What you ordered
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
        <p className="pt-3 font-semibold">{`Total · ${formatCents(order.totalCents, currency)}`}</p>
      </section>

      {order.note !== null && order.note !== '' ? (
        <section aria-labelledby="order-note-heading" className="flex flex-col gap-1">
          <h2 id="order-note-heading" className="font-semibold">
            Note for the kitchen
          </h2>
          <p>{order.note}</p>
        </section>
      ) : null}

      <Link href="/menu" className="underline underline-offset-4">
        Back to menu
      </Link>
    </main>
  );
}
