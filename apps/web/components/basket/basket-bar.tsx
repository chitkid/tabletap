'use client';
import { Button } from '@tabletap/ui';
import { formatCents } from '../../lib/money';

/**
 * The bar is the basket's only running total, so it is a live region: a guest who taps Add three
 * rows down the menu hears the new count without moving focus.
 */
export function BasketBar({
  count,
  totalCents,
  currency,
  onOpen,
}: {
  count: number;
  totalCents: number;
  currency: string;
  onOpen: () => void;
}) {
  return (
    <section
      role="region"
      aria-label="Basket"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background p-4"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
        <span className="font-semibold">
          {`${count} ${count === 1 ? 'item' : 'items'} · ${formatCents(totalCents, currency)}`}
        </span>
        <Button type="button" onClick={onOpen}>
          View basket
        </Button>
      </div>
    </section>
  );
}
