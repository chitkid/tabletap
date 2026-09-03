import type { OrderDto } from '@tabletap/shared';
import { StatusBadge } from '@tabletap/ui';
import Link from 'next/link';
import { formatCents } from '../../lib/money';
import { ElapsedSince } from './elapsed-since';

/**
 * The receipt a guest keeps open on the table. It says the one thing they came for in the first
 * line — the order is with the kitchen — and then answers, in order, the questions that follow:
 * what state is it in, how long has it been, and what did I actually order.
 */
export function OrderScreen({ order, currency }: { order: OrderDto; currency: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold">
          {`Order #${order.number} sent to the kitchen.`}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={order.status} />
          <span className="text-muted-foreground">{`Table ${order.tableNumber}`}</span>
        </div>
        <ElapsedSince iso={order.placedAt ?? order.createdAt} />
      </header>

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
