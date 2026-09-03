import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuResponse } from '@tabletap/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import { CheckoutScreen } from './checkout-screen';
import { addItem, cartStorageKey } from '../../lib/cart';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = {
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' },
  categories: [
    {
      id: U(2),
      name: 'Drinks',
      sortOrder: 0,
      items: [
        {
          id: U(3),
          categoryId: U(2),
          name: 'House Lemonade',
          description: '',
          priceCents: 400,
          allergens: [],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 0,
        },
        {
          id: U(4),
          categoryId: U(2),
          name: 'Cold Brew',
          description: '',
          priceCents: 450,
          allergens: [],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 1,
        },
      ],
    },
  ],
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const orderBody = {
  order: {
    id: U(9),
    number: 42,
    status: 'placed',
    tableId: 't1',
    tableNumber: 7,
    items: [],
    subtotalCents: 800,
    totalCents: 800,
    note: null,
    placedAt: '2026-09-03T10:00:00.000Z',
    createdAt: '2026-09-03T10:00:00.000Z',
  },
};

describe('CheckoutScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    replace.mockClear();
    localStorage.setItem(
      cartStorageKey('t1'),
      JSON.stringify(addItem(addItem({ items: {} }, U(3), 2), U(4))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it('posts the basket with an idempotency key and a note, then clears and navigates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(201, orderBody)),
    );
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    expect(screen.getByText('2 × House Lemonade')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Note for the kitchen'), 'No ice');
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/orders/${U(9)}`));
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/orders');
    const headers = new Headers(init?.headers);
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [
        { menuItemId: U(3), quantity: 2 },
        { menuItemId: U(4), quantity: 1 },
      ],
      note: 'No ice',
    });
    expect(localStorage.getItem(cartStorageKey('t1'))).toBeNull();
  });
  it('reuses the same idempotency key on retry and marks sold-out lines', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        json(409, {
          error: {
            code: 'ITEM_UNAVAILABLE',
            message: 'x',
            details: { unavailable: [{ menuItemId: U(4), name: 'Cold Brew' }] },
          },
        }),
      )
      .mockResolvedValueOnce(json(201, orderBody));
    vi.stubGlobal('fetch', f);
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Sold out today. Remove it to continue.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Cold Brew' }));
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    const keys = f.mock.calls.map((c) =>
      new Headers((c[1] as RequestInit).headers).get('idempotency-key'),
    );
    expect(keys[0]).toBe(keys[1]);
  });
  it('sends an ended session back to the start and explains other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } })),
    );
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/session-ended'));
  });
  it('redirects to the menu when the basket is empty', () => {
    localStorage.clear();
    render(<CheckoutScreen menu={menu} tableId="t1" />);
    expect(replace).toHaveBeenCalledWith('/menu');
  });
});
