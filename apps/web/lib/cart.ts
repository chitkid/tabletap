'use client';
import type { MenuItemDto, MenuResponse } from '@tabletap/shared';
import { useCallback, useSyncExternalStore } from 'react';

export interface Cart {
  items: Record<string, number>;
}
export const EMPTY_CART: Cart = { items: {} };
export const MAX_QUANTITY = 20;
export const MAX_LINES = 50;

export function addItem(cart: Cart, menuItemId: string, by = 1): Cart {
  const current = cart.items[menuItemId] ?? 0;
  if (current === 0 && Object.keys(cart.items).length >= MAX_LINES) return cart;
  return { items: { ...cart.items, [menuItemId]: Math.min(MAX_QUANTITY, current + by) } };
}
export function setQuantity(cart: Cart, menuItemId: string, quantity: number): Cart {
  if (quantity <= 0) return removeItem(cart, menuItemId);
  return { items: { ...cart.items, [menuItemId]: Math.min(MAX_QUANTITY, Math.floor(quantity)) } };
}
export function removeItem(cart: Cart, menuItemId: string): Cart {
  const items = { ...cart.items };
  delete items[menuItemId];
  return { items };
}
export function clearCart(): Cart {
  return EMPTY_CART;
}
export function countItems(cart: Cart): number {
  return Object.values(cart.items).reduce((a, b) => a + b, 0);
}

export interface CartLine {
  menuItemId: string;
  quantity: number;
  item: MenuItemDto | null;
  lineTotalCents: number;
  available: boolean;
}
function indexMenu(menu: MenuResponse): Map<string, MenuItemDto> {
  return new Map(menu.categories.flatMap((c) => c.items).map((i) => [i.id, i]));
}
/**
 * A basket outlives the menu it was filled from: an item can sell out, or leave the menu
 * entirely, between the tap and the checkout. A line keeps its price so the guest can see what
 * it would have cost, and carries `available: false` so nothing unorderable reaches the total.
 */
export function cartLines(cart: Cart, menu: MenuResponse): CartLine[] {
  const index = indexMenu(menu);
  return Object.entries(cart.items).map(([menuItemId, quantity]) => {
    const item = index.get(menuItemId) ?? null;
    return {
      menuItemId,
      quantity,
      item,
      lineTotalCents: item === null ? 0 : item.priceCents * quantity,
      available: item !== null && item.isAvailable,
    };
  });
}
export function cartTotalCents(cart: Cart, menu: MenuResponse): number {
  return cartLines(cart, menu)
    .filter((l) => l.available)
    .reduce((sum, l) => sum + l.lineTotalCents, 0);
}
export function toOrderItems(
  cart: Cart,
  menu: MenuResponse,
): { menuItemId: string; quantity: number }[] {
  return cartLines(cart, menu)
    .filter((l) => l.available)
    .map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity }));
}

export const cartStorageKey = (tableId: string) => `tt-cart:${tableId}`;

// --- store -------------------------------------------------------------------------------------
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; cart: Cart }>();

/**
 * `useSyncExternalStore` re-renders forever unless the snapshot is referentially stable, so the
 * parsed cart is cached against the exact string it was parsed from.
 */
function read(key: string): Cart {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.cart;
  let cart = EMPTY_CART;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { items?: Record<string, unknown> };
      const items: Record<string, number> = {};
      for (const [id, q] of Object.entries(parsed.items ?? {})) {
        if (typeof q === 'number' && q > 0) items[id] = Math.min(MAX_QUANTITY, Math.floor(q));
      }
      cart = { items };
    } catch {
      cart = EMPTY_CART;
    }
  }
  cache.set(key, { raw, cart });
  return cart;
}
function write(key: string, cart: Cart) {
  const raw = countItems(cart) === 0 ? null : JSON.stringify(cart);
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    // storage unavailable: keep the in-memory value for this page load
  }
  cache.set(key, { raw, cart });
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useCart(tableId: string) {
  const key = cartStorageKey(tableId);
  const cart = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY_CART,
  );
  const update = useCallback((next: (c: Cart) => Cart) => write(key, next(read(key))), [key]);
  return {
    cart,
    add: useCallback((id: string, by = 1) => update((c) => addItem(c, id, by)), [update]),
    setQuantity: useCallback(
      (id: string, q: number) => update((c) => setQuantity(c, id, q)),
      [update],
    ),
    remove: useCallback((id: string) => update((c) => removeItem(c, id)), [update]),
    clear: useCallback(() => update(() => clearCart()), [update]),
  };
}
