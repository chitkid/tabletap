import type { OrderDto, OrderStatus } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  NEXT_STATUS,
  applyEvent,
  applySnapshot,
  clockOffsetOf,
  columnsOf,
  isBumpable,
  mergeSnapshot,
  ordersOf,
} from './board-store';

const at = (iso: string, patch: Partial<OrderDto> = {}): OrderDto => ({
  id: patch.id ?? 'o1',
  number: 1,
  status: 'placed',
  tableId: 't',
  tableNumber: 7,
  items: [],
  subtotalCents: 0,
  totalCents: 0,
  currency: 'USD',
  note: null,
  placedAt: iso,
  paidAt: null,
  cookingAt: null,
  readyAt: null,
  servedAt: null,
  cancelledAt: null,
  createdAt: iso,
  updatedAt: iso,
  ...patch,
});

describe('board store', () => {
  it('a snapshot replaces everything and keeps only active tickets', () => {
    const state = applySnapshot([
      at('2026-09-03T10:00:00Z'),
      at('2026-09-03T10:01:00Z', { id: 'o2', status: 'served' }),
    ]);
    expect(ordersOf(state).map((o) => o.id)).toEqual(['o1']);
  });
  it('an event with an older updatedAt is ignored; a newer one wins; a served ticket leaves', () => {
    let state = applySnapshot([at('2026-09-03T10:00:00Z', { updatedAt: '2026-09-03T10:05:00Z' })]);
    state = applyEvent(
      state,
      at('2026-09-03T10:00:00Z', { status: 'cooking', updatedAt: '2026-09-03T10:04:00Z' }),
    );
    expect(ordersOf(state)[0]!.status).toBe('placed');
    state = applyEvent(
      state,
      at('2026-09-03T10:00:00Z', { status: 'cooking', updatedAt: '2026-09-03T10:06:00Z' }),
    );
    expect(ordersOf(state)[0]!.status).toBe('cooking');
    state = applyEvent(
      state,
      at('2026-09-03T10:00:00Z', { status: 'served', updatedAt: '2026-09-03T10:07:00Z' }),
    );
    expect(ordersOf(state)).toEqual([]);
  });
  it('keeps a ticket the board learned about after the snapshot was read', () => {
    // The order was committed while the snapshot query was running: it reached the board as an
    // event and the snapshot cannot know about it. Wholesale replacement erased it for good.
    let state = applySnapshot([at('2026-09-03T10:00:00Z')]);
    state = applyEvent(
      state,
      at('2026-09-03T10:04:59Z', { id: 'o2', updatedAt: '2026-09-03T10:04:59Z' }),
    );
    const merged = mergeSnapshot(state, {
      orders: [at('2026-09-03T10:00:00Z')],
      serverTime: '2026-09-03T10:04:58Z',
    });
    expect(
      ordersOf(merged)
        .map((o) => o.id)
        .sort(),
    ).toEqual(['o1', 'o2']);
  });
  it('drops a local ticket the snapshot is entitled to have seen', () => {
    let state = applySnapshot([at('2026-09-03T10:00:00Z')]);
    state = applyEvent(
      state,
      at('2026-09-03T10:01:00Z', { id: 'o2', updatedAt: '2026-09-03T10:01:00Z' }),
    );
    // Read after that ticket was written and without it: it is gone, not late.
    const merged = mergeSnapshot(state, {
      orders: [at('2026-09-03T10:00:00Z')],
      serverTime: '2026-09-03T10:02:00Z',
    });
    expect(ordersOf(merged).map((o) => o.id)).toEqual(['o1']);
  });
  it('prefers whichever copy of a known ticket is newer', () => {
    const state = applySnapshot([
      at('2026-09-03T10:00:00Z', { status: 'cooking', updatedAt: '2026-09-03T10:05:30Z' }),
    ]);
    const stale = mergeSnapshot(state, {
      orders: [at('2026-09-03T10:00:00Z', { updatedAt: '2026-09-03T10:00:00Z' })],
      serverTime: '2026-09-03T10:05:00Z',
    });
    expect(ordersOf(stale)[0]!.status).toBe('cooking');
    const fresher = mergeSnapshot(state, {
      orders: [at('2026-09-03T10:00:00Z', { status: 'ready', updatedAt: '2026-09-03T10:06:00Z' })],
      serverTime: '2026-09-03T10:06:00Z',
    });
    expect(ordersOf(fresher)[0]!.status).toBe('ready');
  });
  it('measures how far the server clock is from this display', () => {
    const snapshot = { orders: [], serverTime: '2026-09-03T10:00:05Z' };
    // A display five seconds behind the kitchen adds five seconds to every timer.
    expect(clockOffsetOf(snapshot, Date.parse('2026-09-03T10:00:00Z'))).toBe(5_000);
    expect(clockOffsetOf(snapshot, Date.parse('2026-09-03T10:00:20Z'))).toBe(-15_000);
    expect(clockOffsetOf(snapshot, Date.parse('2026-09-03T10:00:05Z'))).toBe(0);
  });
  it('keeps unpaid tickets off the board and sorts the rest oldest first', () => {
    const cols = columnsOf([
      at('2026-09-03T10:02:00Z', { id: 'b', number: 2, status: 'paid' }),
      at('2026-09-03T10:01:00Z', { id: 'a', number: 1, status: 'paid' }),
      at('2026-09-03T10:00:00Z', { id: 'u', number: 9, status: 'placed' }),
      at('2026-09-03T10:00:30Z', { id: 'c', number: 3, status: 'cooking' }),
      at('2026-09-03T10:03:00Z', { id: 'd', number: 4, status: 'ready' }),
    ]);
    expect(cols.new.map((o) => o.id)).toEqual(['a', 'b']);
    expect(cols.cooking.map((o) => o.id)).toEqual(['c']);
    expect(cols.ready.map((o) => o.id)).toEqual(['d']);
  });
  it('knows the next step, and offers none for a ticket a cook may not bump', () => {
    expect(NEXT_STATUS).toEqual({ paid: 'cooking', cooking: 'ready', ready: 'served' });
    const statuses = (...s: OrderStatus[]) => s;
    expect(statuses('paid', 'cooking', 'ready').every(isBumpable)).toBe(true);
    expect(statuses('draft', 'placed', 'served', 'cancelled').some(isBumpable)).toBe(false);
  });
  /**
   * This module words nothing. Every string the board draws comes from `messages/ru.json`, and a
   * column's `key` is the name of its message — the same move `lib/elapsed.ts` made in Task 5.
   * A `title` back on these objects is an interface's language leaking into its shape.
   */
  it('names its columns by key and carries no words of its own', () => {
    expect(COLUMNS.map((c) => c.key)).toEqual(['new', 'cooking', 'ready']);
    for (const column of COLUMNS) expect(Object.keys(column).sort()).toEqual(['key', 'statuses']);
  });
});
