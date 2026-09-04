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
