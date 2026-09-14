'use client';
import { PaymentSessionResponseSchema } from '@tabletap/shared';
import { Button } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { clientFetch } from '../../lib/api';
import { formatCents } from '../../lib/money';
import { usePageRestore } from '../../lib/use-page-restore';

/** Both providers answer with something the browser can follow, so one helper covers both. */
const goTo = (href: string) => window.location.assign(href);

/**
 * The one control that moves money on the guest surface. It asks the API to open an attempt and
 * follows the URL it gets back — a path to the demo terminal, or Stripe's own absolute checkout
 * URL. The button never learns the amount from anywhere but the order it is rendered beside, and
 * it never claims a payment: only the webhook (or the demo terminal) can do that.
 */
export function PayButton({
  orderId,
  totalCents,
  currency,
  fetcher = clientFetch,
  navigate = goTo,
}: {
  orderId: string;
  totalCents: number;
  currency: string;
  fetcher?: typeof clientFetch;
  navigate?: (href: string) => void;
}) {
  const t = useTranslations('guest.pay');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Back from the terminal restores this page mid-navigation, still busy. The order is whatever
  // it is — a guest who paid sees a receipt with no Pay button at all — but one who came back
  // without paying must be able to press it again.
  usePageRestore(() => setBusy(false));

  const start = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { url } = await fetcher(`/api/orders/${orderId}/payment`, {
        schema: PaymentSessionResponseSchema,
        init: { method: 'POST' },
      });
      // Left busy on purpose: the navigation is already under way, and a button that offers to
      // open a second attempt while the first is loading would open a second attempt.
      navigate(url);
    } catch {
      // Every failure reads the same because every fix is the same. A guest cannot tell a
      // refused session from an unreachable server, and neither answer would help them.
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => void start()}
      >
        {busy ? t('opening') : t('pay', { amount: formatCents(totalCents, currency) })}
      </Button>
      {/* Always in the layout, empty when there is nothing to say: a line that appears only on
          failure moves the button out from under the thumb that just pressed it. */}
      <p role="status" aria-live="polite" className="min-h-6 text-sm">
        {failed ? t('failed') : ''}
      </p>
    </div>
  );
}
