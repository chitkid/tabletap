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
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { RefObject } from 'react';
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
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: CartLine[];
  currency: string;
  onSetQuantity: (menuItemId: string, quantity: number) => void;
  onRemove: (menuItemId: string) => void;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('guest.basket');
  const orderable = lines.filter((line) => line.available);
  const subtotalCents = orderable.reduce((sum, line) => sum + line.lineTotalCents, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={DESCRIPTION_ID}
        className="mx-auto max-w-2xl"
        // Radix restores focus to its own `SheetTrigger`, and this sheet has none: it is opened
        // from the bar it is a sibling of. Without this, Esc, the overlay and Keep browsing all
        // leave focus on <body>, which drops a keyboard guest back at the top of the menu.
        onCloseAutoFocus={(event) => {
          const opener = returnFocusTo?.current;
          if (!opener) return;
          event.preventDefault();
          opener.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription id={DESCRIPTION_ID}>{t('description')}</SheetDescription>
        </SheetHeader>
        {lines.length === 0 ? (
          // An empty state is an invitation, not a statement of absence — the copy contract's
          // editorial rules. So it names the way out as well as the emptiness.
          <p className="px-4 text-muted-foreground">{t('empty')}</p>
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
              "N позиций · X ₽" shape, and nothing else on the page repeats the bare figure. */}
          {lines.length > 0 ? (
            <p className="font-semibold">
              {t('subtotal', { amount: formatCents(subtotalCents, currency) })}
            </p>
          ) : null}
          {orderable.length > 0 ? (
            <Button asChild>
              {/* «Перейти к оформлению», not «Оформить заказ»: this link opens the checkout, and
                  the verb on the button that actually places the order is the one the contract
                  spends — «Оформить заказ» → «Заказ оформлен». */}
              <Link href="/checkout">{t('checkout')}</Link>
            </Button>
          ) : null}
          <SheetClose asChild>
            <Button type="button" variant="ghost">
              {t('keepBrowsing')}
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
  const t = useTranslations('guest.basket');
  const name = line.item?.name ?? null;
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{name ?? t('gone')}</span>
        {line.item !== null ? (
          <span className="font-semibold">{formatCents(line.lineTotalCents, currency)}</span>
        ) : null}
      </div>
      {!line.available && line.item !== null ? <p className="text-sm">{t('soldOutLine')}</p> : null}
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
          aria-label={name === null ? t('removeThis') : t('removeDish', { name })}
          onClick={() => onRemove(line.menuItemId)}
        >
          {t('remove')}
        </Button>
      </div>
    </li>
  );
}
