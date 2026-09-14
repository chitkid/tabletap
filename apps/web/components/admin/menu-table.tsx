'use client';
import {
  MenuCategoryDtoSchema,
  type MenuCategoryDto,
  type MenuCategoryWrite,
  type MenuItemDto,
  type MenuResponse,
} from '@tabletap/shared';
import { Button, Input, Label, cn } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { clientFetch } from '../../lib/api';
import { randomUuid } from '../../lib/uuid';
import { MENU_COLUMNS, MenuRow, ROW_LINE } from './menu-row';
import {
  OkResponseSchema,
  PANEL_OPENS,
  RowActions,
  RowNotice,
  asJson,
  invalidAttr,
  useRefusal,
} from './row-editor';

const CategoryResponseSchema = z.object({ category: MenuCategoryDtoSchema });

const HEAD_CELL = 'relative border-l-2 px-3 text-left';

/** The order the API answers in, kept as rows move: sort order first, then the name. */
const bySortOrder = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

const emptyItem = (id: string, categoryId: string, sortOrder: number): MenuItemDto => ({
  id,
  categoryId,
  name: '',
  description: '',
  priceCents: 0,
  allergens: [],
  isAvailable: true,
  imageUrl: null,
  sortOrder,
});

/** Take a never-saved row out of the menu — the price of opening a different one. */
const withoutDraft = (list: MenuCategoryDto[], draftId: string | null): MenuCategoryDto[] =>
  draftId === null
    ? list
    : list
        .filter((category) => category.id !== draftId)
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => item.id !== draftId),
        }));

/**
 * The menu, edited where it is read. One row is open at a time — opening another closes the one
 * before it and drops whatever was typed into it, which is what keeps a table of inputs from
 * becoming a form with forty unsaved fields.
 */
export function MenuTable({
  initial,
  fetcher = clientFetch,
  upload,
}: {
  initial: MenuResponse;
  fetcher?: typeof clientFetch;
  upload?: (url: string, file: File) => Promise<void>;
}) {
  const t = useTranslations('admin.menu');
  const admin = useTranslations('admin');
  const [categories, setCategories] = useState(initial.categories);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  // The row that has just closed, so it can take its focus back from the controls that vanished.
  const [closed, setClosed] = useState<string | null>(null);
  const currency = initial.restaurant.currency;

  const open = (id: string) => {
    const stale = draftId === id ? null : draftId;
    setCategories((list) => withoutDraft(list, stale));
    if (stale !== null) setDraftId(null);
    setClosed(null);
    setEditing(id);
  };
  const close = () => {
    setCategories((list) => withoutDraft(list, draftId));
    setDraftId(null);
    setEditing(null);
    setClosed(editing);
  };

  /**
   * Past the last row, never at the count of rows. Sort orders have gaps in them - 0 and 5 is an
   * ordinary menu - and a count would open the new row in the middle of the ones it was meant to
   * follow. Both computed over the list with any abandoned draft already removed, so pressing Add
   * twice numbers the second draft against what is on the menu rather than against the row that is
   * being thrown away.
   */
  const after = (orders: readonly { sortOrder: number }[]) =>
    orders.reduce((top, row) => Math.max(top, row.sortOrder), -1) + 1;

  const addCategory = () => {
    const id = randomUuid();
    setCategories((list) => {
      const saved = withoutDraft(list, draftId);
      return [...saved, { id, name: '', sortOrder: after(saved), items: [] }];
    });
    setDraftId(id);
    setEditing(id);
  };

  const addDish = (categoryId: string) => {
    const id = randomUuid();
    setCategories((list) =>
      withoutDraft(list, draftId).map((category) =>
        category.id === categoryId
          ? {
              ...category,
              items: [...category.items, emptyItem(id, categoryId, after(category.items))],
            }
          : category,
      ),
    );
    setDraftId(id);
    setEditing(id);
  };

  const replaceItem = (previousId: string, saved: MenuItemDto) =>
    setCategories((list) =>
      list.map((category) =>
        category.id === saved.categoryId
          ? {
              ...category,
              items: category.items.map((item) => (item.id === previousId ? saved : item)),
            }
          : category,
      ),
    );

  const ordered = [...categories]
    .sort(bySortOrder)
    .map((category) => ({ ...category, items: [...category.items].sort(bySortOrder) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">{t('heading')}</h1>
        <Button type="button" onClick={addCategory}>
          {t('addCategory')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-sm">
        {/* Narrow enough and the table scrolls inside its own panel rather than squeezing the dish
              column down to an ellipsis; the page itself never scrolls sideways. */}
        <table className="w-full min-w-2xl border-collapse text-sm">
          <caption className="sr-only">{t('caption')}</caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="w-full px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {t('columns.dish')}
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-right text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {t('columns.price')}
              </th>
              <th
                scope="col"
                className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {t('columns.availability')}
              </th>
              <th scope="col" className="relative px-3 py-2">
                <span className="sr-only">{admin('rowControls')}</span>
              </th>
            </tr>
          </thead>
          {ordered.map((category) => (
            <tbody key={category.id} aria-label={category.name}>
              <CategoryRow
                category={category}
                editing={editing === category.id}
                isNew={draftId === category.id}
                fetcher={fetcher}
                onEdit={() => open(category.id)}
                onCancel={close}
                focusOnRead={closed === category.id}
                onSaved={(saved) => {
                  setCategories((list) =>
                    list.map((current) => (current.id === category.id ? saved : current)),
                  );
                  setDraftId(null);
                  setEditing(null);
                  setClosed(saved.id);
                }}
                onDeleted={() => {
                  setCategories((list) => list.filter((current) => current.id !== category.id));
                  setDraftId(null);
                  setEditing(null);
                  setClosed(null);
                }}
              />
              {category.items.map((item) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  currency={currency}
                  editing={editing === item.id}
                  isNew={draftId === item.id}
                  fetcher={fetcher}
                  upload={upload}
                  onEdit={() => open(item.id)}
                  onCancel={close}
                  focusOnRead={closed === item.id}
                  onSaved={(saved) => {
                    replaceItem(item.id, saved);
                    setDraftId(null);
                    setEditing(null);
                    setClosed(saved.id);
                  }}
                  onPhotoChanged={(saved) => replaceItem(item.id, saved)}
                  onDeleted={() => {
                    setCategories((list) =>
                      list.map((current) => ({
                        ...current,
                        items: current.items.filter((current2) => current2.id !== item.id),
                      })),
                    );
                    setEditing(null);
                    setClosed(null);
                  }}
                />
              ))}
              {draftId === category.id ? null : (
                <tr className={ROW_LINE}>
                  <td colSpan={MENU_COLUMNS} className="px-3">
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" onClick={() => addDish(category.id)}>
                        {t('addDish')}
                      </Button>
                      {/* An invitation rather than a statement of absence: the control that fills
                          the category is right beside the line, so the line points at it. */}
                      {category.items.length === 0 ? (
                        <span className="text-sm text-muted-foreground">{t('noDishes')}</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  editing,
  isNew,
  fetcher,
  focusOnRead,
  onEdit,
  onCancel,
  onSaved,
  onDeleted,
}: {
  category: MenuCategoryDto;
  editing: boolean;
  isNew: boolean;
  fetcher: typeof clientFetch;
  focusOnRead: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (category: MenuCategoryDto) => void;
  onDeleted: () => void;
}) {
  if (!editing)
    return <CategoryHeader category={category} focusOnRead={focusOnRead} onEdit={onEdit} />;
  return (
    <CategoryEditor
      category={category}
      isNew={isNew}
      fetcher={fetcher}
      onCancel={onCancel}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  );
}

function CategoryHeader({
  category,
  focusOnRead,
  onEdit,
}: {
  category: MenuCategoryDto;
  focusOnRead: boolean;
  onEdit: () => void;
}) {
  const actions = useTranslations('admin.actions');
  const edit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnRead) edit.current?.focus();
  }, [focusOnRead]);
  return (
    <tr className={cn(ROW_LINE, 'border-t border-border')}>
      <th
        scope="rowgroup"
        colSpan={MENU_COLUMNS - 1}
        className={cn(HEAD_CELL, 'border-transparent')}
      >
        <span className="font-display text-base font-semibold">{category.name}</span>
      </th>
      <td className="px-3 text-right">
        <Button type="button" ref={edit} variant="ghost" onClick={onEdit}>
          {actions('edit')}
        </Button>
      </td>
    </tr>
  );
}

function CategoryEditor({
  category,
  isNew,
  fetcher,
  onCancel,
  onSaved,
  onDeleted,
}: {
  category: MenuCategoryDto;
  isNew: boolean;
  fetcher: typeof clientFetch;
  onCancel: () => void;
  onSaved: (category: MenuCategoryDto) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations('admin.menu');
  const actions = useTranslations('admin.actions');
  const { refuse, refuseDelete } = useRefusal();
  const nameId = useId();
  const sortId = useId();
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [invalid, setInvalid] = useState(false);

  const restore = () => {
    setName(category.name);
    setSortOrder(String(category.sortOrder));
  };

  const save = async () => {
    const trimmed = name.trim();
    const order = Number(sortOrder);
    if (trimmed === '' || !Number.isFinite(order)) {
      setInvalid(true);
      setNotice(t('categoryIncomplete'));
      return;
    }
    setInvalid(false);
    const body: Partial<MenuCategoryWrite> = {};
    if (isNew || trimmed !== category.name) body.name = trimmed;
    if (isNew || order !== category.sortOrder) body.sortOrder = order;
    if (!isNew && Object.keys(body).length === 0) return onCancel();
    setBusy(true);
    setNotice('');
    try {
      const { category: saved } = await fetcher(
        isNew ? '/api/menu/categories' : `/api/menu/categories/${category.id}`,
        {
          schema: CategoryResponseSchema,
          init: asJson(isNew ? 'POST' : 'PATCH', body),
        },
      );
      onSaved(saved);
    } catch (error) {
      restore();
      setNotice(refuse(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (isNew) return onCancel();
    setBusy(true);
    setNotice('');
    try {
      await fetcher(`/api/menu/categories/${category.id}`, {
        schema: OkResponseSchema,
        init: { method: 'DELETE' },
      });
      onDeleted();
    } catch (error) {
      setNotice(refuseDelete(error, t('categoryInUse')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr className={cn(ROW_LINE, 'border-t border-border bg-secondary/60')}>
        <th scope="rowgroup" colSpan={MENU_COLUMNS - 1} className={cn(HEAD_CELL, 'border-primary')}>
          <Label htmlFor={nameId} className="sr-only">
            {t('name')}
          </Label>
          <Input
            id={nameId}
            autoFocus
            value={name}
            aria-invalid={invalidAttr(invalid && name.trim() === '')}
            className="max-w-sm"
            onChange={(event) => setName(event.target.value)}
          />
        </th>
        <RowActions busy={busy} onSave={() => void save()} onCancel={onCancel} />
      </tr>
      <tr className="border-b border-border/50 bg-secondary/60">
        <td colSpan={MENU_COLUMNS} className="px-3 pb-4">
          <RowNotice notice={notice} />
          <div data-panel className={cn('flex flex-wrap items-end gap-4', PANEL_OPENS)}>
            <div className="flex max-w-xs flex-col gap-2">
              <Label htmlFor={sortId}>{t('sortOrder')}</Label>
              <Input
                id={sortId}
                type="number"
                step="1"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              {actions('delete')}
            </Button>
          </div>
        </td>
      </tr>
    </>
  );
}
