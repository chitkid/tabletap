import type { MenuItemDto, MenuResponse } from '@tabletap/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
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
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' },
  categories: [
    { id: DRINKS, name: 'Drinks', sortOrder: 3, items: [] },
    {
      id: SMALL_PLATES,
      name: 'Small plates',
      sortOrder: 0,
      items: [dish(FOCACCIA, SMALL_PLATES, 'Focaccia', 1), dish(OLIVES, SMALL_PLATES, 'Olives', 0)],
    },
    { id: DESSERTS, name: 'Desserts', sortOrder: 5, items: [] },
  ],
};

const group = (name: string) => screen.getByRole('rowgroup', { name });
const editorFor = (name: string) =>
  within(screen.getByRole('rowheader', { name }).closest('tr') as HTMLElement).getByRole('button', {
    name: 'Edit',
  });

describe('MenuTable', () => {
  it('lists categories in sort order with their dishes under them', () => {
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Menu' })).toBeInTheDocument();
    const lines = screen.getAllByRole('row').map((row) => row.textContent ?? '');
    const at = (needle: string) => lines.findIndex((line) => line.includes(needle));
    expect(at('Small plates')).toBeGreaterThan(-1);
    expect(at('Small plates')).toBeLessThan(at('Olives'));
    expect(at('Olives')).toBeLessThan(at('Focaccia'));
    expect(at('Focaccia')).toBeLessThan(at('Drinks'));
    expect(at('Drinks')).toBeLessThan(at('Desserts'));
  });

  it('gives a category with no dishes a line of its own', () => {
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);
    const desserts = group('Desserts');
    expect(within(desserts).getByText('No dishes yet.')).toBeInTheDocument();
    expect(within(desserts).getByRole('button', { name: 'Add dish' })).toBeInTheDocument();
  });

  it('keeps one row open at a time and throws the closed row’s draft away', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    await user.click(editorFor('Olives'));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Marinated olives');

    await user.click(editorFor('Focaccia'));
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
    expect(screen.getByLabelText('Name')).toHaveValue('Focaccia');
    expect(screen.getByRole('rowheader', { name: /Olives/ })).toBeInTheDocument();

    await user.click(editorFor('Olives'));
    expect(screen.getByLabelText('Name')).toHaveValue('Olives');
  });

  it('opens the category panel with the motion the dish panel has, and the row keeps its height', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);
    // The first row of the category's own rowgroup is the category line itself.
    const line = () => within(group('Small plates')).getAllByRole('row')[0]!;
    const heightOf = (row: Element) => row.className.match(/(?:^|\s)h-\d+(?:\s|$)/)?.[0];
    const height = heightOf(line());
    expect(height).toBeDefined();

    await user.click(within(line()).getByRole('button', { name: 'Edit' }));

    // The two editors on this screen open the same way. One that faded while its neighbour
    // appeared read as unfinished. (class-level: jsdom does no layout.)
    const panel = screen.getByLabelText('Sort order').closest('[data-panel]');
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

    await user.click(editorFor('Olives'));
    expect(screen.getByLabelText('Name')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(editorFor('Olives')).toHaveFocus();
  });

  it('opens a new dish inside the category it was asked for', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    await user.click(within(group('Small plates')).getByRole('button', { name: 'Add dish' }));

    expect(within(group('Small plates')).getByLabelText('Name')).toHaveValue('');
    expect(within(group('Drinks')).queryByLabelText('Name')).toBeNull();
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
  });

  it('opens a new category at the end of the menu', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add category' }));

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    // Past the highest sort order on the menu, not at the count of categories: with 0, 3 and 5 in
    // place, a count would open the new one at 3 and land it in the middle.
    expect(screen.getByLabelText('Sort order')).toHaveValue(6);
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
          name: 'Small plates',
          sortOrder: 0,
          items: [
            dish(OLIVES, SMALL_PLATES, 'Olives', 0),
            dish(FOCACCIA, SMALL_PLATES, 'Focaccia', 5),
          ],
        },
      ],
    };
    render(<MenuTable initial={gapped} fetcher={vi.fn()} />);

    await user.click(within(group('Small plates')).getByRole('button', { name: 'Add dish' }));
    expect(screen.getByLabelText('Sort order')).toHaveValue(6);
  });

  it('does not let a discarded draft push the next one further along', async () => {
    const user = userEvent.setup();
    render(<MenuTable initial={menu} fetcher={vi.fn()} />);

    // Two presses in a row: the first draft is thrown away unsaved, so the second must be
    // numbered against what is actually on the menu, not against the row that is being discarded.
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    await user.click(screen.getByRole('button', { name: 'Add category' }));
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
    expect(screen.getByLabelText('Sort order')).toHaveValue(6);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const plates = within(group('Small plates'));
    await user.click(plates.getByRole('button', { name: 'Add dish' }));
    await user.click(plates.getByRole('button', { name: 'Add dish' }));
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
    expect(screen.getByLabelText('Sort order')).toHaveValue(2);
  });

  it('keeps a category that still holds dishes and says to empty it first', async () => {
    const user = userEvent.setup();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'IN_USE', 'This category holds items. Empty it first.'));
    render(<MenuTable initial={menu} fetcher={fetcher} />);

    await user.click(editorFor('Small plates'));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'This category still holds dishes. Empty it first.',
      ),
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Small plates');
  });
});
