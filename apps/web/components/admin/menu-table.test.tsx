import type { MenuItemDto, MenuResponse } from '@tabletap/shared';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import ru from '../../messages/ru.json';
import { MenuTable } from './menu-table';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const dish = (id: string, categoryId: string, name: string, sortOrder: number): MenuItemDto => ({
  id,
  categoryId,
  name,
  description: '',
  priceCents: 900,
  allergens: [],
  isAvailable: true,
  imageUrl: null,
  sortOrder,
});
const SMALL_PLATES = U(2);
const DRINKS = U(4);
const DESSERTS = U(6);
const OLIVES = U(3);
const FOCACCIA = U(5);

/** Deliberately out of order in the array: the screen puts them in sort order, the API's order. */
const menu: MenuResponse = {
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'RUB' },
  categories: [
    { id: DRINKS, name: 'Напитки', plateKind: 'drink', sortOrder: 3, items: [] },
    {
      id: SMALL_PLATES,
      name: 'Закуски',
      plateKind: 'side',
      sortOrder: 0,
      items: [dish(FOCACCIA, SMALL_PLATES, 'Фокачча', 1), dish(OLIVES, SMALL_PLATES, 'Оливки', 0)],
    },
    { id: DESSERTS, name: 'Десерты', plateKind: 'side', sortOrder: 5, items: [] },
  ],
};

const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const M = ru.admin.menu;
const ACT = ru.admin.actions;

const group = (name: string) => screen.getByRole('rowgroup', { name });
const editorFor = (name: string) =>
  within(screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement).getByRole('button', {
    name: ACT.edit,
  });

describe('MenuTable', () => {
  it('lists categories in sort order with their dishes under them', () => {
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: M.heading })).toBeInTheDocument();
    const lines = screen.getAllByRole('row').map((row) => row.textContent ?? '');
    const at = (needle: string) => lines.findIndex((line) => line.includes(needle));
    expect(at('Закуски')).toBeGreaterThan(-1);
    expect(at('Закуски')).toBeLessThan(at('Оливки'));
    expect(at('Оливки')).toBeLessThan(at('Фокачча'));
    expect(at('Фокачча')).toBeLessThan(at('Напитки'));
    expect(at('Напитки')).toBeLessThan(at('Десерты'));
  });

  it('heads its columns in the operator’s language, and names the controls column for a reader', () => {
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);
    /**
     * A table column head names the **field in each row** — one dish, one price — which is why
     * these stay singular where the kitchen board's column headings are plural. That rule is for
     * a heading that names a *group* of tickets; `kitchen-board.tsx` carries the note. Nothing on
     * the admin surface is a status word in a heading position, so the split does not arise here.
     */
    for (const heading of [M.columns.dish, M.columns.price, M.columns.availability])
      expect(screen.getByRole('columnheader', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: ru.admin.rowControls })).toBeInTheDocument();
    expect(screen.getByText(plain(M.caption))).toBeInTheDocument();
  });

  it('gives a category with no dishes a line of its own', () => {
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);
    const desserts = group('Десерты');
    expect(within(desserts).getByText(plain(M.noDishes))).toBeInTheDocument();
    expect(within(desserts).getByRole('button', { name: M.addDish })).toBeInTheDocument();
  });

  it('keeps one row open at a time and throws the closed row’s draft away', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    await user.click(editorFor('Оливки'));
    await user.clear(screen.getByLabelText(M.name));
    await user.type(screen.getByLabelText(M.name), 'Оливки с тимьяном');

    await user.click(editorFor('Фокачча'));
    expect(screen.getAllByLabelText(M.name)).toHaveLength(1);
    expect(screen.getByLabelText(M.name)).toHaveValue('Фокачча');
    expect(screen.getByRole('rowheader', { name: /Оливки/ })).toBeInTheDocument();

    await user.click(editorFor('Оливки'));
    expect(screen.getByLabelText(M.name)).toHaveValue('Оливки');
  });

  it('opens the category panel with the motion the dish panel has, and the row keeps its height', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);
    // The first row of the category's own rowgroup is the category line itself.
    const line = () => within(group('Закуски')).getAllByRole('row')[0]!;
    const heightOf = (row: Element) => row.className.match(/(?:^|\s)h-\d+(?:\s|$)/)?.[0];
    const height = heightOf(line());
    expect(height).toBeDefined();

    await user.click(within(line()).getByRole('button', { name: ACT.edit }));

    // The two editors on this screen open the same way. One that faded while its neighbour
    // appeared read as unfinished. (class-level: jsdom does no layout.)
    const panel = screen.getByLabelText(M.sortOrder).closest('[data-panel]');
    expect(panel?.className).toContain('starting:opacity-0');
    expect(panel?.className).toContain('transition-[opacity,translate]');
    expect(panel?.className).toContain('duration-[var(--motion-base)]');
    expect(panel?.className).not.toMatch(/\d+(?:ms|s)\b/);
    // M5's fixed line, untouched: the panel moves, the row it hangs from does not.
    expect(heightOf(line())).toBe(height);
  });

  it('carries focus into the open row and hands it back when the row closes', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    await user.click(editorFor('Оливки'));
    expect(screen.getByLabelText(M.name)).toHaveFocus();

    await user.click(screen.getByRole('button', { name: ACT.cancel }));
    expect(editorFor('Оливки')).toHaveFocus();
  });

  it('opens a new dish inside the category it was asked for', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    await user.click(within(group('Закуски')).getByRole('button', { name: M.addDish }));

    expect(within(group('Закуски')).getByLabelText(M.name)).toHaveValue('');
    expect(within(group('Напитки')).queryByLabelText(M.name)).toBeNull();
    expect(screen.getAllByLabelText(M.name)).toHaveLength(1);
  });

  it('opens a new category at the end of the menu', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: M.addCategory }));

    expect(screen.getByLabelText(M.name)).toHaveValue('');
    expect(screen.getByRole('button', { name: ACT.save })).toBeInTheDocument();
    // Past the highest sort order on the menu, not at the count of categories: with 0, 3 and 5 in
    // place, a count would open the new one at 3 and land it in the middle.
    expect(screen.getByLabelText(M.sortOrder)).toHaveValue(6);
  });

  it('opens a new dish past the last one rather than at the count of dishes', async () => {
    const user = userEvent.setup();
    // A gap in the orders is the whole case: two dishes at 0 and 5 make a count answer 2, which
    // puts the new dish between them instead of at the end an operator is looking at.
    const gapped: MenuResponse = {
      ...menu,
      categories: [
        {
          id: SMALL_PLATES,
          name: 'Закуски',
          plateKind: 'side',
          sortOrder: 0,
          items: [
            dish(OLIVES, SMALL_PLATES, 'Оливки', 0),
            dish(FOCACCIA, SMALL_PLATES, 'Фокачча', 5),
          ],
        },
      ],
    };
    render(<MenuTable initial={gapped} fetcher={vi.fn()} />);

    await user.click(within(group('Закуски')).getByRole('button', { name: M.addDish }));
    expect(screen.getByLabelText(M.sortOrder)).toHaveValue(6);
  });

  it('does not let a discarded draft push the next one further along', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    // Two presses in a row: the first draft is thrown away unsaved, so the second must be
    // numbered against what is actually on the menu, not against the row that is being discarded.
    await user.click(screen.getByRole('button', { name: M.addCategory }));
    await user.click(screen.getByRole('button', { name: M.addCategory }));
    expect(screen.getAllByLabelText(M.name)).toHaveLength(1);
    expect(screen.getByLabelText(M.sortOrder)).toHaveValue(6);

    await user.click(screen.getByRole('button', { name: ACT.cancel }));
    const plates = within(group('Закуски'));
    await user.click(plates.getByRole('button', { name: M.addDish }));
    await user.click(plates.getByRole('button', { name: M.addDish }));
    expect(screen.getAllByLabelText(M.name)).toHaveLength(1);
    expect(screen.getByLabelText(M.sortOrder)).toHaveValue(2);
  });

  it('refuses an unnamed category in words, before it asks the server anything', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(<MenuTable initial={menu} fetcher={fetcher} />);

    await user.click(screen.getByRole('button', { name: M.addCategory }));
    await user.click(screen.getByRole('button', { name: ACT.save }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(plain(M.categoryIncomplete));
    expect(screen.getByLabelText(M.name)).toHaveAttribute('aria-invalid', 'true');
  });

  it('keeps a category that still holds dishes and says to empty it first', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'IN_USE', 'This category holds items. Empty it first.'));
    render(<MenuTable initial={menu} fetcher={fetcher} />);

    await user.click(editorFor('Закуски'));
    await user.click(screen.getByRole('button', { name: ACT.delete }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(plain(M.categoryInUse)),
    );
    // The way out is the operator's own sentence, so none of the server's English is on screen.
    expect(screen.getByRole('status').textContent).not.toContain('Empty it first.');
    expect(screen.getByLabelText(M.name)).toHaveValue('Закуски');
  });
});
