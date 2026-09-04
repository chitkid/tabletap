'use client';
import { PaymentSessionResponseSchema, type OrderDto } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';
import { ApiError, clientFetch } from '../../lib/api';
import { formatCents } from '../../lib/money';

const CompleteResponseSchema = z.object({ ok: z.literal(true) });

/**
 * A keypad with nothing behind it. It is drawn rather than built: no key is a control, none is
 * focusable, and `aria-hidden` keeps the whole grid out of the accessibility tree, because a
 * screen reader announcing twelve dead buttons would be describing a machine that is not here.
 * It earns its place by making the object on screen legible in one glance as a card terminal —
 * which is exactly what the disclaimer underneath then contradicts, on purpose.
 */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''];

const goTo = (href: string) => window.location.assign(href);

/**
 * The restaurant's own terminal, honestly fake (design spec §3). There is no bank chrome, no
 * card number to type and no payment-network mark, because a portfolio screen that imitates a
 * real bank page is a lie. Decline sits beside Pay at the same size: the unhappy path is part
 * of what this demo is showing, not something to hide.
 */
export function DemoTerminal({
  order,
  currency,
  fetcher = clientFetch,
  navigate = goTo,
}: {
  order: OrderDto;
  currency: string;
  fetcher?: typeof clientFetch;
  navigate?: (href: string) => void;
}) {
  const [busy, setBusy] = useState<'paid' | 'declined' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const amount = formatCents(order.totalCents, currency);

  const complete = (outcome: 'paid' | 'declined') =>
    fetcher('/api/payments/demo/complete', {
      schema: CompleteResponseSchema,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, outcome }),
      },
    });

  const settle = async (outcome: 'paid' | 'declined') => {
    setBusy(outcome);
    // Both buttons go quiet the moment one is pressed, so without this the terminal would look
    // broken rather than busy for the length of the round trip. The labels stay as they are —
    // a guest who pressed Decline should still be reading the word they pressed.
    setMessage(outcome === 'paid' ? 'Taking the payment…' : 'Declining the payment…');
    try {
      try {
        await complete(outcome);
      } catch (err) {
        // An attempt is settled once and for all, so a terminal reopened with the back button
        // after a decline is pointing at an attempt that is over. The API says so with a 409;
        // the honest answer is to open a fresh attempt and settle that, rather than to tell a
        // guest standing at the table that the terminal is unreachable. An order that can no
        // longer be paid at all fails this second call too, and falls through to the message.
        if (!(err instanceof ApiError) || err.code !== 'PAYMENT_REQUIRED') throw err;
        await fetcher(`/api/orders/${order.id}/payment`, {
          schema: PaymentSessionResponseSchema,
          init: { method: 'POST' },
        });
        await complete(outcome);
      }
      // Said before the trip back, not after: `/orders/<id>` is server-rendered on every visit,
      // so this line is on screen for the whole of that round trip and the guest is never
      // looking at a terminal that has quietly stopped meaning anything.
      if (outcome === 'declined') setMessage('Payment declined.');
      navigate(`/orders/${order.id}?paid=${outcome === 'paid' ? '1' : '0'}`);
    } catch {
      // Nothing was settled, so both buttons stay live: this is a retry, not a dead end.
      setBusy(null);
      setMessage("Couldn't reach the terminal. Try again.");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 py-10">
      <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md">
        {/* The readout: sunken, the way the screen on a real terminal sits below its shell. */}
        <div className="flex flex-col items-center gap-1 rounded-md bg-secondary px-4 py-5 text-secondary-foreground">
          <h1 className="text-sm font-semibold">{`Table ${order.tableNumber} · Order #${order.number}`}</h1>
          <p className="font-display text-4xl font-semibold tabular-nums">{amount}</p>
        </div>

        <div aria-hidden className="grid grid-cols-3 gap-2 select-none">
          {KEYS.map((key, index) => (
            <div
              key={index}
              className="flex h-11 items-center justify-center rounded-sm border border-border text-muted-foreground tabular-nums"
            >
              {key}
            </div>
          ))}
        </div>

        {/* Where a bank page would put the card number, this one puts the truth. */}
        <p className="text-center text-sm text-muted-foreground">
          This is a demo. No card, no money.
        </p>

        {/* Two equal columns, and the padding is trimmed from the button default: on the
            narrowest phone a column is barely wider than the label, and a four-figure total
            such as `Pay $2,300.00` needs more room than `px-4` leaves it. */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="px-3"
            disabled={busy !== null}
            aria-busy={busy === 'paid' || undefined}
            onClick={() => void settle('paid')}
          >
            {`Pay ${amount}`}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-3"
            disabled={busy !== null}
            aria-busy={busy === 'declined' || undefined}
            onClick={() => void settle('declined')}
          >
            Decline
          </Button>
        </div>

        <p role="status" aria-live="polite" className="min-h-6 text-center text-sm">
          {message ?? ''}
        </p>
      </div>

      {/* The way out of a terminal a guest did not mean to open. It looks like every other link
          on the guest surface, but the padding makes it a thumb-sized target rather than a bare
          line of text — this is the one screen where missing the way out costs money. */}
      <Link href={`/orders/${order.id}`} className="self-center py-3 underline underline-offset-4">
        Back to your order
      </Link>
    </main>
  );
}
