'use client';
import { PaymentSessionResponseSchema, type OrderDto } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { z } from 'zod';
import { ApiError, clientFetch } from '../../lib/api';
import { formatCents } from '../../lib/money';
import { usePageRestore } from '../../lib/use-page-restore';

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

/** Which message in `guest.pay` says an attempt of each kind is under way. */
type Outcome = 'paid' | 'declined';
const WORKING: Record<Outcome, 'taking' | 'declining'> = {
  paid: 'taking',
  declined: 'declining',
};

/**
 * The restaurant's own terminal, honestly fake (design spec §3). There is no bank chrome, no
 * card number to type and no payment-network mark, because a portfolio screen that imitates a
 * real bank page is a lie. Decline sits beside Pay at the same size: the unhappy path is part
 * of what this demo is showing, not something to hide.
 *
 * **The disclaimer survives the clean-up that removed every other "this is a demonstration"
 * line, and it survives without the word.** The others announced a demonstration to someone who
 * had not asked; this one prevents a false belief about money. A button reading «Оплатить 1 250 ₽»
 * on a drawn card terminal forms two beliefs in the person pressing it — that they are being
 * charged, and that they will need their card — and this sentence is the only thing that stops
 * both. So it says the two facts and names no demonstration: «Деньги не списываются, карта не
 * нужна.» Ruled by the controller, 2026-09-14. Do not delete it while removing demo notices; a
 * fake card machine that stops saying nothing is charged is the lie the design spec forbids.
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
  const t = useTranslations('guest.pay');
  const [busy, setBusy] = useState<Outcome | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const amount = formatCents(order.totalCents, currency);

  // Back from the receipt restores this terminal exactly as it left: both buttons quiet, and a
  // line still claiming to be taking a payment that has long since finished. Both are stale.
  // Pressing Pay again on a restored terminal is safe — an order that is already paid is told
  // so by the API with a 200, and one that is not gets a fresh attempt.
  usePageRestore(() => {
    setBusy(null);
    setMessage(null);
  });

  const complete = (outcome: Outcome) =>
    fetcher('/api/payments/demo/complete', {
      schema: CompleteResponseSchema,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, outcome }),
      },
    });

  const settle = async (outcome: Outcome) => {
    setBusy(outcome);
    // Both buttons go quiet the moment one is pressed, so without this the terminal would look
    // broken rather than busy for the length of the round trip. The labels stay as they are —
    // a guest who pressed Decline should still be reading the word they pressed.
    setMessage(t(WORKING[outcome]));
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
      if (outcome === 'declined') setMessage(t('declined'));
      navigate(`/orders/${order.id}?paid=${outcome === 'paid' ? '1' : '0'}`);
    } catch {
      // Nothing was settled, so both buttons stay live: this is a retry, not a dead end.
      setBusy(null);
      setMessage(t('unreachable'));
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-4 px-4 py-10">
      <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-md">
        {/* The readout: sunken, the way the screen on a real terminal sits below its shell. */}
        <div className="flex flex-col items-center gap-1 rounded-md bg-secondary px-4 py-5 text-secondary-foreground">
          <h1 className="text-sm font-semibold">
            {t('terminalHeading', { table: order.tableNumber, number: order.number })}
          </h1>
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

        {/* Where a bank page would put the card number, this one puts the truth: nothing is
            charged and no card is needed. See the note above this component for why this line
            outlived every other sentence that said what the deployment is. */}
        <p className="text-center text-sm text-muted-foreground">{t('disclaimer')}</p>

        {/* Two equal columns, and the padding is trimmed from the button default: on the
            narrowest phone a column is barely wider than the label, and a four-figure total
            such as «Оплатить 2 300 ₽» needs more room than `px-4` leaves it. */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="px-3"
            disabled={busy !== null}
            aria-busy={busy === 'paid' || undefined}
            onClick={() => void settle('paid')}
          >
            {t('pay', { amount })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="px-3"
            disabled={busy !== null}
            aria-busy={busy === 'declined' || undefined}
            onClick={() => void settle('declined')}
          >
            {t('decline')}
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
        {t('backToOrder')}
      </Link>
    </main>
  );
}
