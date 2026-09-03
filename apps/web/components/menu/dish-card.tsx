'use client';
import type { MenuItemDto } from '@tabletap/shared';
import { Button, Plate, cn, kindFromCategory } from '@tabletap/ui';
import { formatCents } from '../../lib/money';
import { QuantityStepper } from './quantity-stepper';

export function DishCard({
  item,
  category,
  quantity,
  currency,
  onAdd,
  onSetQuantity,
}: {
  item: MenuItemDto;
  category: string;
  quantity: number;
  currency: string;
  onAdd: () => void;
  onSetQuantity: (q: number) => void;
}) {
  const allergens =
    item.allergens.length > 0 ? `Contains ${item.allergens.join(', ')}` : 'No listed allergens';
  // A sold-out card takes the muted fill from docs/design/components.md, and with it the rule that
  // --muted-foreground must never sit on --muted (4.48:1). Its secondary lines keep their size but
  // take the full-strength ink; hierarchy is carried by type size, not by a failing contrast.
  const secondary = item.isAvailable ? 'text-muted-foreground' : 'text-foreground';
  return (
    <article
      aria-disabled={!item.isAvailable || undefined}
      className={cn(
        'flex gap-4 rounded-lg border border-border p-3 shadow-sm',
        item.isAvailable ? 'bg-card text-card-foreground' : 'bg-muted text-foreground',
      )}
    >
      {item.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- M5 uploads arbitrary hosts; sizes are fixed by the card
        <img src={item.imageUrl} alt="" className="size-24 shrink-0 rounded-md object-cover" />
      ) : (
        <Plate name={item.name} kind={kindFromCategory(category)} size={96} className="size-24" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-display text-lg leading-tight font-semibold">{item.name}</h3>
        {item.description ? <p className={cn('text-sm', secondary)}>{item.description}</p> : null}
        <p className={cn('text-xs', secondary)}>{allergens}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="font-semibold">{formatCents(item.priceCents, currency)}</span>
          {!item.isAvailable ? (
            <span className="text-sm font-semibold">Sold out today</span>
          ) : quantity === 0 ? (
            <Button type="button" aria-label={`Add ${item.name}`} onClick={onAdd}>
              Add
            </Button>
          ) : (
            <QuantityStepper name={item.name} value={quantity} onChange={onSetQuantity} />
          )}
        </div>
      </div>
    </article>
  );
}
