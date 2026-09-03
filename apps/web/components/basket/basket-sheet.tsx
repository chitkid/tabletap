'use client';
import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@tabletap/ui';
import Link from 'next/link';
import type { CartLine } from '../../lib/cart';
import { formatCents } from '../../lib/money';
import { QuantityStepper } from '../menu/quantity-stepper';

const DESCRIPTION_ID = 'basket-sheet-note';

export function BasketSheet({
  open,
  onOpenChange,
  lines,
  currency,
  onSetQuantity,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartLine[];
  currency: string;
  onSetQuantity: (menuItemId: string, quantity: number) => void;
  onRemove: (menuItemId: string) => void;
}) {
  const orderable = lines.filter((line) => line.available);
  const subtotalCents = orderable.reduce((sum, line) => sum + line.lineTotalCents, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={DESCRIPTION_ID}
        className="mx-auto max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Your basket</SheetTitle>
          <SheetDescription id={DESCRIPTION_ID}>Anything else?</SheetDescription>
        </SheetHeader>
        {lines.length === 0 ? (
          <p className="px-4 text-muted-foreground">Nothing in the basket yet.</p>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto px-4">
            {lines.map((line) => (
              <BasketLine
                key={line.menuItemId}
                line={line}
                currency={currency}
                onSetQuantity={onSetQuantity}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
        <SheetFooter>
          {/* One text node, not a label and an amount side by side: the sheet echoes the bar's
              "N items · $X" shape, and nothing else on the page repeats the bare figure. */}
          {lines.length > 0 ? (
            <p className="font-semibold">{`Subtotal · ${formatCents(subtotalCents, currency)}`}</p>
          ) : null}
          {orderable.length > 0 ? (
            <Button asChild>
              <Link href="/checkout">Go to checkout</Link>
            </Button>
          ) : null}
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              Keep browsing
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function BasketLine({
  line,
  currency,
  onSetQuantity,
  onRemove,
}: {
  line: CartLine;
  currency: string;
  onSetQuantity: (menuItemId: string, quantity: number) => void;
  onRemove: (menuItemId: string) => void;
}) {
  const name = line.item?.name ?? null;
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{name ?? 'No longer on the menu'}</span>
        {line.item !== null ? (
          <span className="font-semibold">{formatCents(line.lineTotalCents, currency)}</span>
        ) : null}
      </div>
      {!line.available && line.item !== null ? (
        <p className="text-sm">Sold out today. Remove it to continue.</p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        {line.available && name !== null ? (
          <QuantityStepper
            name={name}
            value={line.quantity}
            onChange={(quantity) => onSetQuantity(line.menuItemId, quantity)}
          />
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="ghost"
          aria-label={`Remove ${name ?? 'this item'}`}
          onClick={() => onRemove(line.menuItemId)}
        >
          Remove
        </Button>
      </div>
    </li>
  );
}
