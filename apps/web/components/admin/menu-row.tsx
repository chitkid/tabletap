'use client';
import {
  ALLERGENS,
  MenuItemDtoSchema,
  type Allergen,
  type MenuItemDto,
  type MenuItemWrite,
} from '@tabletap/shared';
import { Badge, Button, Input, Label, Textarea, cn } from '@tabletap/ui';
import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { clientFetch } from '../../lib/api';
import { formatCents } from '../../lib/money';
import { PhotoField } from './photo-field';
import {
  OkResponseSchema,
  PANEL_OPENS,
  RowActions,
  RowNotice,
  asJson,
  deleteRefusal,
  invalidAttr,
  refusal,
} from './row-editor';

const ItemResponseSchema = z.object({ item: MenuItemDtoSchema });

export const MENU_COLUMNS = 4;
/**
 * The row line is one height in both modes. That is the whole mitigation for §3's risk: a table
 * whose lines change size when a cell becomes an input jumps under the hand that pressed Edit.
 * Both modes apply this string first, so neither can drift from the other.
 */
export const ROW_LINE = 'h-14 border-b border-border/50';
/** The first cell carries the accent that marks the open row, transparent when it is closed, so
 * the text in every row starts at the same x whichever mode the row is in. Exported beside
 * `ROW_LINE` for the same reason: the tables screen has to be able to match it rather than keep a
 * copy that nothing stops from drifting. */
export const ROW_HEAD = 'relative max-w-0 border-l-2 px-3 text-left font-normal';

const IN_USE = 'This dish is on an order. Mark it sold out instead.';
const INCOMPLETE = "Couldn't save. Give the dish a name and a price.";

/**
 * What `save` refuses about the price, so the message and the mark on the input cannot disagree.
 * The empty string is tested first and on purpose: `Number('')` is `0`, which is finite, so a check
 * that only asks whether the text parses calls an emptied field valid at the exact moment the save
 * is refused for it.
 */
const badPrice = (text: string) => {
  const cents = Math.round(Number(text) * 100);
  return text.trim() === '' || !Number.isFinite(cents) || cents < 0;
};

type Draft = {
  name: string;
  price: string;
  description: string;
  allergens: Allergen[];
  isAvailable: boolean;
  sortOrder: string;
};

const draftOf = (item: MenuItemDto): Draft => ({
  name: item.name,
  price: (item.priceCents / 100).toFixed(2),
  description: item.description,
  allergens: item.allergens,
  isAvailable: item.isAvailable,
  sortOrder: String(item.sortOrder),
});

const sameAllergens = (a: readonly Allergen[], b: readonly Allergen[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

type RowProps = {
  item: MenuItemDto;
  currency: string;
  editing: boolean;
  /** A dish that has never been saved: Save creates it, Cancel throws the draft away. */
  isNew?: boolean;
  fetcher?: typeof clientFetch;
  upload?: (url: string, file: File) => Promise<void>;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (item: MenuItemDto) => void;
  onDeleted: (id: string) => void;
  /** The row has just closed and the hand that closed it is a keyboard: take its focus back. */
  focusOnRead?: boolean;
  /** A photograph lands mid-edit: the dish changes, but the row stays open. */
  onPhotoChanged?: (item: MenuItemDto) => void;
};

/**
 * One dish, read or edited in place. No dialog opens: the cells become inputs where they stood,
 * the price stays in the same column at the same width, and Save and Cancel sit in the row.
 */
export function MenuRow(props: RowProps) {
  if (!props.editing) return <ReadRow {...props} />;
  // Mounted only while this row is the open one, so the draft is seeded from the dish every time
  // editing starts and an abandoned draft goes away with the component that held it.
  return <EditRow {...props} />;
}

function ReadRow({ item, currency, focusOnRead, onEdit }: RowProps) {
  const detail = [item.description, item.allergens.join(', ')].filter((part) => part !== '');
  const edit = useRef<HTMLButtonElement>(null);
  // Save and Cancel take the row's controls away with them. Focus goes back to the button that
  // opened the row, so a keyboard hand carries on from where it was instead of at the page top.
  useEffect(() => {
    if (focusOnRead === true) edit.current?.focus();
  }, [focusOnRead]);
  return (
    <tr className={ROW_LINE}>
      <th scope="row" className={cn(ROW_HEAD, 'border-transparent')}>
        <span className="block truncate text-sm font-semibold">{item.name}</span>
        {detail.length > 0 ? (
          <span className="block truncate text-sm text-muted-foreground">{detail.join(' · ')}</span>
        ) : null}
      </th>
      <td className="px-3 text-right font-mono text-sm font-semibold whitespace-nowrap">
        {formatCents(item.priceCents, currency)}
      </td>
      <td className="px-3">
        {/* Available is the quiet case: it reads as a word, not as something to press. Sold out
            is the exception an operator is scanning for, so only that one wears a chip. */}
        {item.isAvailable ? (
          <span className="text-sm text-muted-foreground">Available</span>
        ) : (
          <Badge variant="secondary">Sold out</Badge>
        )}
      </td>
      <td className="px-3 text-right">
        <Button type="button" ref={edit} variant="outline" onClick={onEdit}>
          Edit
        </Button>
      </td>
    </tr>
  );
}

function EditRow({
  item,
  isNew = false,
  fetcher = clientFetch,
  upload,
  onCancel,
  onSaved,
  onDeleted,
  onPhotoChanged,
}: RowProps) {
  const nameId = useId();
  const priceId = useId();
  const descriptionId = useId();
  const sortId = useId();
  const [draft, setDraft] = useState(() => draftOf(item));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [invalid, setInvalid] = useState(false);

  const change = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    const name = draft.name.trim();
    const cents = Math.round(Number(draft.price) * 100);
    const sortOrder = Number(draft.sortOrder);
    if (name === '' || badPrice(draft.price) || !Number.isFinite(sortOrder)) {
      setInvalid(true);
      setNotice(INCOMPLETE);
      return;
    }
    setInvalid(false);
    const body: Partial<MenuItemWrite> = {};
    if (isNew) {
      body.categoryId = item.categoryId;
      body.name = name;
      body.description = draft.description;
      body.priceCents = cents;
      body.allergens = draft.allergens;
      body.isAvailable = draft.isAvailable;
      body.sortOrder = sortOrder;
    } else {
      if (name !== item.name) body.name = name;
      if (cents !== item.priceCents) body.priceCents = cents;
      if (draft.description !== item.description) body.description = draft.description;
      if (!sameAllergens(draft.allergens, item.allergens)) body.allergens = draft.allergens;
      if (draft.isAvailable !== item.isAvailable) body.isAvailable = draft.isAvailable;
      if (sortOrder !== item.sortOrder) body.sortOrder = sortOrder;
      // Nothing moved, so there is nothing to ask the server about: close the row.
      if (Object.keys(body).length === 0) return onCancel();
    }
    setBusy(true);
    setNotice('');
    try {
      const { item: saved } = await fetcher(
        isNew ? '/api/menu/items' : `/api/menu/items/${item.id}`,
        { schema: ItemResponseSchema, init: asJson(isNew ? 'POST' : 'PATCH', body) },
      );
      onSaved(saved);
    } catch (error) {
      // The row must never sit showing values the server does not hold, so the draft goes back to
      // the dish as it stands and the line says what was refused.
      setDraft(draftOf(item));
      setNotice(refusal(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (isNew) return onCancel();
    setBusy(true);
    setNotice('');
    try {
      await fetcher(`/api/menu/items/${item.id}`, {
        schema: OkResponseSchema,
        init: { method: 'DELETE' },
      });
      onDeleted(item.id);
    } catch (error) {
      setNotice(deleteRefusal(error, IN_USE));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr className={cn(ROW_LINE, 'bg-secondary/60')}>
        <th scope="row" className={cn(ROW_HEAD, 'border-primary')}>
          <Label htmlFor={nameId} className="sr-only">
            Name
          </Label>
          <Input
            id={nameId}
            autoFocus
            value={draft.name}
            aria-invalid={invalidAttr(invalid && draft.name.trim() === '')}
            onChange={(event) => change({ name: event.target.value })}
          />
        </th>
        <td className="relative px-3 text-right">
          <Label htmlFor={priceId} className="sr-only">
            Price
          </Label>
          <Input
            id={priceId}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="w-28 text-right font-mono"
            value={draft.price}
            aria-invalid={invalidAttr(invalid && badPrice(draft.price))}
            onChange={(event) => change({ price: event.target.value })}
          />
        </td>
        <td className="px-3">
          {/* The name is the thing being switched and never moves; `aria-checked` carries the
              state. Named from the word inside it, an unavailable dish would announce as
              "Sold out, switch, off" - a double negative, to the operators least able to
              afford one. The visible word still says which way the switch is set. */}
          <Button
            type="button"
            role="switch"
            aria-label="Available"
            variant={draft.isAvailable ? 'outline' : 'secondary'}
            aria-checked={draft.isAvailable}
            onClick={() => change({ isAvailable: !draft.isAvailable })}
          >
            {draft.isAvailable ? 'Available' : 'Sold out'}
          </Button>
        </td>
        <RowActions busy={busy} onSave={() => void save()} onCancel={onCancel} />
      </tr>
      <tr className="border-b border-border/50 bg-secondary/60">
        <td colSpan={MENU_COLUMNS} className="px-3 pb-4">
          <RowNotice notice={notice} />
          <div data-panel className={cn('grid gap-4 md:grid-cols-2', PANEL_OPENS)}>
            <div className="flex flex-col gap-2">
              <Label htmlFor={descriptionId}>Description</Label>
              <Textarea
                id={descriptionId}
                value={draft.description}
                onChange={(event) => change({ description: event.target.value })}
              />
              <fieldset className="mt-2">
                <legend className="mb-2 text-sm font-medium">Allergens</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {ALLERGENS.map((allergen) => (
                    <label
                      key={allergen}
                      className="flex h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-card"
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={draft.allergens.includes(allergen)}
                        onChange={(event) =>
                          change({
                            allergens: event.target.checked
                              ? [...draft.allergens, allergen]
                              : draft.allergens.filter((value) => value !== allergen),
                          })
                        }
                      />
                      {allergen}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="flex flex-col gap-4">
              {isNew ? null : (
                <PhotoField
                  itemId={item.id}
                  itemName={item.name}
                  imageUrl={item.imageUrl}
                  fetcher={fetcher}
                  upload={upload}
                  onUploaded={onPhotoChanged}
                />
              )}
              <div className="flex max-w-xs flex-col gap-2">
                <Label htmlFor={sortId}>Sort order</Label>
                <Input
                  id={sortId}
                  type="number"
                  step="1"
                  value={draft.sortOrder}
                  onChange={(event) => change({ sortOrder: event.target.value })}
                />
              </div>
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
