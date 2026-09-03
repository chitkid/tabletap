'use client';
import { Button } from '@tabletap/ui';
import { MAX_QUANTITY } from '../../lib/cart';

/**
 * Both controls carry the dish name, because a guest listening to the page hears the buttons out
 * of context: "Add one more" alone says nothing about which of twenty dishes it would add.
 */
export function QuantityStepper({
  name,
  value,
  onChange,
  max = MAX_QUANTITY,
}: {
  name: string;
  value: number;
  onChange: (next: number) => void;
  max?: number;
}) {
  return (
    <div className="flex touch-manipulation items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Remove one ${name}`}
        onClick={() => onChange(value - 1)}
      >
        <span aria-hidden="true">−</span>
      </Button>
      {/* Not a live region: the basket bar announces the new totals after every tap, and a
          count that also announced itself would say the same change twice. */}
      <span className="min-w-6 text-center font-semibold">{value}</span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Add one more ${name}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        <span aria-hidden="true">+</span>
      </Button>
    </div>
  );
}
