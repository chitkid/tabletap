import { act, renderHook } from '@testing-library/react';
import type { MenuResponse } from '@tabletap/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_CART,
  addItem,
  cartLines,
  cartStorageKey,
  cartTotalCents,
  countItems,
  removeItem,
  setQuantity,
  toOrderItems,
  useCart,
} from './cart';

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = {
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' },
  categories: [
    {
      id: U(2),
      name: 'Flatbreads',
      sortOrder: 0,
      items: [
        {
          id: U(3),
          categoryId: U(2),
          name: 'Margherita Flatbread',
          description: '',
          priceCents: 1200,
          allergens: [],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 0,
        },
        {
          id: U(4),
          categoryId: U(2),
          name: 'Burrata & Peaches',
          description: '',
          priceCents: 1100,
          allergens: [],
          isAvailable: false,
          imageUrl: null,
          sortOrder: 1,
        },
      ],
    },
  ],
};

describe('cart functions', () => {
  it('adds, clamps, sets and removes', () => {
    let c = addItem(EMPTY_CART, U(3));
    c = addItem(c, U(3));
    expect(c.items[U(3)]).toBe(2);
    c = addItem(c, U(3), 100);
    expect(c.items[U(3)]).toBe(20);
    c = setQuantity(c, U(3), 3);
    expect(countItems(c)).toBe(3);
    c = setQuantity(c, U(3), 0);
    expect(c.items[U(3)]).toBeUndefined();
    c = removeItem(addItem(EMPTY_CART, U(4)), U(4));
    expect(countItems(c)).toBe(0);
  });
  it('prices lines from the menu and skips what is gone', () => {
    const c = addItem(addItem(addItem(EMPTY_CART, U(3), 2), U(4)), U(9));
    const lines = cartLines(c, menu);
    expect(
      lines.map((l) => [l.item?.name ?? null, l.quantity, l.lineTotalCents, l.available]),
    ).toEqual([
      ['Margherita Flatbread', 2, 2400, true],
      ['Burrata & Peaches', 1, 1100, false],
      [null, 1, 0, false],
    ]);
    expect(cartTotalCents(c, menu)).toBe(2400);
    expect(toOrderItems(c, menu)).toEqual([{ menuItemId: U(3), quantity: 2 }]);
  });
});

describe('useCart', () => {
  beforeEach(() => localStorage.clear());
  it('persists per table and survives a remount', () => {
    const { result, unmount } = renderHook(() => useCart('table-a'));
    act(() => result.current.add(U(3)));
    act(() => result.current.add(U(3)));
    expect(result.current.cart.items[U(3)]).toBe(2);
    unmount();
    const again = renderHook(() => useCart('table-a'));
    expect(again.result.current.cart.items[U(3)]).toBe(2);
    expect(renderHook(() => useCart('table-b')).result.current.cart).toEqual(EMPTY_CART);
    expect(localStorage.getItem(cartStorageKey('table-a'))).toContain(U(3));
  });
  it('ignores corrupted storage and clears', () => {
    localStorage.setItem(cartStorageKey('table-c'), '{not json');
    const { result } = renderHook(() => useCart('table-c'));
    expect(result.current.cart).toEqual(EMPTY_CART);
    act(() => result.current.add(U(3)));
    act(() => result.current.clear());
    expect(result.current.cart).toEqual(EMPTY_CART);
  });
});
