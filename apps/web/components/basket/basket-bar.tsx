'use client';
import { Button } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import { formatCents } from '../../lib/money';

/**
 * The bar is the basket's only running total, so it is a live region: a guest who taps Add three
 * rows down the menu hears the new count without moving focus.
 *
 * `openerRef` is how the sheet finds its way back here when it closes. The button is not a
 * `SheetTrigger` — the sheet is a sibling, not a child — so Radix has no trigger to restore focus
 * to and would drop it on `<body>`.
 */
export function BasketBar({
  count,
  totalCents,
  currency,
  onOpen,
  openerRef,
}: {
  count: number;
  totalCents: number;
  currency: string;
  onOpen: () => void;
  openerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations('guest');
  return (
    <section
      role="region"
      aria-label="Basket"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-4"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
        <span className="font-semibold">
          {`${t('basketItems', { n: count })} · ${formatCents(totalCents, currency)}`}
        </span>
        <Button type="button" ref={openerRef} onClick={onOpen}>
          View basket
        </Button>
      </div>
    </section>
  );
}
