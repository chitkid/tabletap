'use client';
import type { MenuResponse } from '@tabletap/shared';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { cartLines, cartTotalCents, countItems, useCart } from '../../lib/cart';
import { BasketBar } from '../basket/basket-bar';
import { BasketSheet } from '../basket/basket-sheet';
import { CategoryNav } from './category-nav';
import { DishCard } from './dish-card';

export function MenuScreen({
  menu,
  tableId,
  tableNumber,
}: {
  menu: MenuResponse;
  tableId: string;
  tableNumber: number;
}) {
  const t = useTranslations('guest');
  const { cart, add, setQuantity, remove } = useCart(tableId);
  const [open, setOpen] = useState(false);
  // The bar opens the sheet and the sheet gives focus back to it; the ref is the only thing the
  // two need to share, so they stay siblings rather than a trigger wrapped around a panel.
  const openerRef = useRef<HTMLButtonElement>(null);
  const count = countItems(cart);
  const currency = menu.restaurant.currency;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-28">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">{menu.restaurant.name}</h1>
        <span className="text-muted-foreground">{t('table', { number: tableNumber })}</span>
      </header>
      <CategoryNav categories={menu.categories} />
      {menu.categories.map((category) => (
        <section
          key={category.id}
          id={`category-${category.id}`}
          aria-labelledby={`heading-${category.id}`}
          className="flex scroll-mt-16 flex-col gap-3"
        >
          <h2 id={`heading-${category.id}`} className="font-display text-2xl font-semibold">
            {category.name}
          </h2>
          {category.items.map((item) => (
            <DishCard
              key={item.id}
              item={item}
              plateKind={category.plateKind}
              currency={currency}
              quantity={cart.items[item.id] ?? 0}
              onAdd={() => add(item.id)}
              onSetQuantity={(quantity) => setQuantity(item.id, quantity)}
            />
          ))}
        </section>
      ))}
      {count > 0 ? (
        <BasketBar
          count={count}
          totalCents={cartTotalCents(cart, menu)}
          currency={currency}
          onOpen={() => setOpen(true)}
          openerRef={openerRef}
        />
      ) : null}
      <BasketSheet
        open={open}
        onOpenChange={setOpen}
        lines={cartLines(cart, menu)}
        currency={currency}
        onSetQuantity={setQuantity}
        onRemove={remove}
        returnFocusTo={openerRef}
      />
    </main>
  );
}
