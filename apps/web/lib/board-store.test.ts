import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import {
  BUMP_LABEL,
  NEXT_STATUS,
  applyEvent,
  applySnapshot,
  columnsOf,
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
  note: null,
  placedAt: iso,
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
  it('columns are oldest first and follow the status', () => {
    const cols = columnsOf([
      at('2026-09-03T10:02:00Z', { id: 'b', number: 2 }),
      at('2026-09-03T10:01:00Z', { id: 'a', number: 1, status: 'paid' }),
      at('2026-09-03T10:00:00Z', { id: 'c', number: 3, status: 'cooking' }),
      at('2026-09-03T10:03:00Z', { id: 'd', number: 4, status: 'ready' }),
    ]);
    expect(cols.new.map((o) => o.id)).toEqual(['a', 'b']);
    expect(cols.cooking.map((o) => o.id)).toEqual(['c']);
    expect(cols.ready.map((o) => o.id)).toEqual(['d']);
  });
  it('knows the next step and its verb', () => {
    expect(NEXT_STATUS).toEqual({
      placed: 'cooking',
      paid: 'cooking',
      cooking: 'ready',
      ready: 'served',
    });
    expect(BUMP_LABEL).toEqual({
      placed: 'Start',
      paid: 'Start',
      cooking: 'Ready',
      ready: 'Served',
    });
  });
});
