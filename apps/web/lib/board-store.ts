import { isActiveStatus, type OrderDto, type OrderStatus } from '@tabletap/shared';

/** The board's model: active tickets by id. Pure functions so the socket effect stays thin. */
export interface BoardState {
  byId: Readonly<Record<string, OrderDto>>;
}

export function applySnapshot(orders: OrderDto[]): BoardState {
  return {
    byId: Object.fromEntries(orders.filter((o) => isActiveStatus(o.status)).map((o) => [o.id, o])),
  };
}

/** Events can arrive out of order across a reconnect: only a newer updatedAt may replace a ticket. */
export function applyEvent(state: BoardState, order: OrderDto): BoardState {
  const known = state.byId[order.id];
  if (known && Date.parse(known.updatedAt) > Date.parse(order.updatedAt)) return state;
  if (!isActiveStatus(order.status)) {
    if (!known) return state;
    const byId = { ...state.byId };
    delete byId[order.id];
    return { byId };
  }
  return { byId: { ...state.byId, [order.id]: order } };
}

export const ordersOf = (state: BoardState): OrderDto[] => Object.values(state.byId);

export type Column = 'new' | 'cooking' | 'ready';
export const COLUMNS: readonly { key: Column; title: string; statuses: readonly OrderStatus[] }[] =
  [
    { key: 'new', title: 'New', statuses: ['placed', 'paid'] },
    { key: 'cooking', title: 'Cooking', statuses: ['cooking'] },
    { key: 'ready', title: 'Ready', statuses: ['ready'] },
  ];

const startOf = (o: OrderDto) => Date.parse(o.placedAt ?? o.createdAt);

/** Oldest first: the cook works from the top of each column. */
export function columnsOf(orders: OrderDto[]): Record<Column, OrderDto[]> {
  const sorted = [...orders].sort((a, b) => startOf(a) - startOf(b) || a.number - b.number);
  const pickBy = (statuses: readonly OrderStatus[]) =>
    sorted.filter((o) => statuses.includes(o.status));
  return {
    new: pickBy(COLUMNS[0]!.statuses),
    cooking: pickBy(COLUMNS[1]!.statuses),
    ready: pickBy(COLUMNS[2]!.statuses),
  };
}

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  placed: 'cooking',
  paid: 'cooking',
  cooking: 'ready',
  ready: 'served',
};
export const BUMP_LABEL: Partial<Record<OrderStatus, 'Start' | 'Ready' | 'Served'>> = {
  placed: 'Start',
  paid: 'Start',
  cooking: 'Ready',
  ready: 'Served',
};
