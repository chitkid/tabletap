'use client';
import type { MenuItemDto, PlateKind } from '@tabletap/shared';
import { Button, Plate, cn } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import { formatCents } from '../../lib/money';
import { QuantityStepper } from './quantity-stepper';

export function DishCard({
  item,
  plateKind,
  quantity,
  currency,
  onAdd,
  onSetQuantity,
}: {
  item: MenuItemDto;
  /**
   * The category's own declared kind, off `MenuCategoryDto`. It used to be the category's display
   * name, which the plate planner then matched against English words — so every category named in
   * Russian drew the same fallback shape for every dish, and no test could see it, because the
   * category names live in seed data.
   */
  plateKind: PlateKind;
  quantity: number;
  currency: string;
  onAdd: () => void;
  onSetQuantity: (q: number) => void;
}) {
  const t = useTranslations('guest.menu');
  // The nine allergen names are a shared namespace, not the guest's: the admin's menu editor
  // prints the same words. `item.allergens` carries the enum from @tabletap/shared, which is nine
  // English identifiers and is a key — «Содержит gluten, dairy» is what printing it looks like.
  const allergen = useTranslations('allergens');
  // «Аллергены не указаны» rather than «аллергенов нет»: the menu says nothing about this dish,
  // which is not the same promise as the dish containing nothing.
  const allergens =
    item.allergens.length > 0
      ? t('allergens', { list: item.allergens.map((name) => allergen(name)).join(', ') })
      : t('noAllergens');
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
        // The heading right beside it says the name, so the plate is decoration.
        <Plate name={item.name} kind={plateKind} decorative size={96} className="size-24" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-display text-lg leading-tight font-semibold">{item.name}</h3>
        {item.description ? <p className={cn('text-sm', secondary)}>{item.description}</p> : null}
        <p className={cn('text-xs', secondary)}>{allergens}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="font-semibold">{formatCents(item.priceCents, currency)}</span>
          {!item.isAvailable ? (
            <span className="text-sm font-semibold">{t('soldOut')}</span>
          ) : quantity === 0 ? (
            // The dish name rides in ёлочки as an appositive, so a name the dictionary cannot
            // decline still reads as Russian: «Добавить «Салат Цезарь»».
            <Button type="button" aria-label={t('addDish', { name: item.name })} onClick={onAdd}>
              {t('add')}
            </Button>
          ) : (
            <QuantityStepper name={item.name} value={quantity} onChange={onSetQuantity} />
          )}
        </div>
      </div>
    </article>
  );
}
