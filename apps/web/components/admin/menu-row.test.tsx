import type { MenuItemDto } from '@tabletap/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { MenuRow } from './menu-row';

const CATEGORY_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f02';
const ITEM_ID = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f03';
const dish: MenuItemDto = {
  id: ITEM_ID,
  categoryId: CATEGORY_ID,
  name: 'Margherita Flatbread',
  description: 'Tomato, mozzarella, basil',
  priceCents: 1200,
  allergens: ['gluten'],
  isAvailable: true,
  imageUrl: null,
  sortOrder: 0,
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <table>
    <tbody>{children}</tbody>
  </table>
);

/** What `MenuTable` does for a row: it owns the dish, and it owns which row is open. */
function Harness({
  initial = dish,
  isNew = false,
  fetcher,
  onDeleted = vi.fn(),
  onSaved = vi.fn(),
}: {
  initial?: MenuItemDto;
  isNew?: boolean;
  fetcher: Parameters<typeof MenuRow>[0]['fetcher'];
  onDeleted?: (id: string) => void;
  onSaved?: (item: MenuItemDto) => void;
}) {
  const [item, setItem] = useState(initial);
  const [editing, setEditing] = useState(isNew);
  const [removed, setRemoved] = useState(false);
  if (removed) return null;
  return (
    <MenuRow
      item={item}
      currency="USD"
      editing={editing}
      isNew={isNew}
      fetcher={fetcher}
      onEdit={() => setEditing(true)}
      onCancel={() => setEditing(false)}
      onSaved={(saved) => {
        setItem(saved);
        setEditing(false);
        onSaved(saved);
      }}
      onDeleted={(id) => {
        setRemoved(true);
        onDeleted(id);
      }}
    />
  );
}

const lineOf = () => screen.getAllByRole('row')[0] as HTMLElement;
/**
 * The row's own notice, which opens the expanded panel; the photo field keeps a second one for
 * its own failures further down, next to the control each of them is about.
 */
const noticeOf = () => screen.getAllByRole('status')[0] as HTMLElement;

describe('MenuRow', () => {
  it('turns the row into inputs without changing the height of the row', async () => {
    const user = userEvent.setup();
    render(<Harness fetcher={vi.fn()} />, { wrapper });
    const height = lineOf().className.match(/(?:^|\s)h-\d+(?:\s|$)/)?.[0];
    expect(height).toBeDefined();
    expect(screen.queryByLabelText('Name')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Name')).toHaveValue('Margherita Flatbread');
    expect(screen.getByLabelText('Price')).toHaveValue(12);
    expect(lineOf().className.match(/(?:^|\s)h-\d+(?:\s|$)/)?.[0]).toBe(height);
  });

  it('saves only the fields that changed and shows what the server answered', async () => {
    const user = userEvent.setup();
    const saved: MenuItemDto = { ...dish, name: 'Margherita', priceCents: 1350 };
    const fetcher = vi.fn().mockResolvedValue({ item: saved });
    render(<Harness fetcher={fetcher} />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Margherita');
    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '13.50');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/menu/items/${ITEM_ID}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: { method: 'PATCH', body: JSON.stringify({ name: 'Margherita', priceCents: 1350 }) },
    });
    expect(await screen.findByText('Margherita')).toBeInTheDocument();
    expect(screen.getByText('$13.50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('posts a new dish whole', async () => {
    const user = userEvent.setup();
    const draft: MenuItemDto = {
      ...dish,
      id: 'draft-1',
      name: '',
      description: '',
      priceCents: 0,
      allergens: [],
      sortOrder: 3,
    };
    const created: MenuItemDto = { ...draft, id: ITEM_ID, name: 'Focaccia', priceCents: 600 };
    const fetcher = vi.fn().mockResolvedValue({ item: created });
    render(<Harness initial={draft} isNew fetcher={fetcher} />, { wrapper });

    await user.type(screen.getByLabelText('Name'), 'Focaccia');
    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '6.00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/menu/items');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      init: {
        method: 'POST',
        body: JSON.stringify({
          categoryId: CATEGORY_ID,
          name: 'Focaccia',
          description: '',
          priceCents: 600,
          allergens: [],
          isAvailable: true,
          sortOrder: 3,
        }),
      },
    });
  });

  it('restores every previous value and names what the server refused', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const fetcher = vi
      .fn()
      .mockRejectedValue(new ApiError(409, 'CONFLICT', 'Someone else changed this dish.'));
    render(<Harness fetcher={fetcher} onSaved={onSaved} />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Marinara');
    await user.click(screen.getByRole('switch', { name: 'Available' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(noticeOf()).toHaveTextContent("Couldn't save. Someone else changed this dish."),
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Margherita Flatbread');
    expect(screen.getByLabelText('Price')).toHaveValue(12);
    expect(screen.getByRole('switch', { name: 'Available' })).toBeChecked();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('names the availability switch for what it switches, not for the state it is in', async () => {
    const user = userEvent.setup();
    render(<Harness fetcher={vi.fn()} />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const toggle = screen.getByRole('switch', { name: 'Available' });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveTextContent('Available');

    await user.click(toggle);

    // The same control under the same name: only the state and the word inside it moved. A name
    // that flipped to "Sold out" would announce an unavailable dish as "Sold out, switch, off".
    expect(screen.getByRole('switch', { name: 'Available' })).toBe(toggle);
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveTextContent('Sold out');
  });

  it('restores on cancel without asking the server anything', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    render(<Harness fetcher={fetcher} />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Marinara');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByText('Margherita Flatbread')).toBeInTheDocument();
    expect(screen.queryByText('Marinara')).toBeNull();
  });

  it('keeps a dish that is on an order and says to mark it sold out instead', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const fetcher = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, 'IN_USE', 'This item appears on an order. Mark it sold out instead.'),
      );
    render(<Harness fetcher={fetcher} onDeleted={onDeleted} />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(noticeOf()).toHaveTextContent('This dish is on an order. Mark it sold out instead.'),
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('Margherita Flatbread');
  });

  it('removes a dish nothing depends on', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    render(<Harness fetcher={fetcher} onDeleted={onDeleted} />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(ITEM_ID));
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/menu/items/${ITEM_ID}`);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ init: { method: 'DELETE' } });
  });
});
