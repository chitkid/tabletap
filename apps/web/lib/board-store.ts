import {
  isActiveStatus,
  type BoardSnapshot,
  type OrderDto,
  type OrderStatus,
} from '@tabletap/shared';

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

/**
 * A snapshot is the board's truth as of `serverTime` — the moment the server began reading, not
 * the moment it answered. The socket is already in its room by then, so an order committed during
 * that read reaches the board as an event first and is missing from the snapshot that follows.
 * Replacing the board wholesale erased that ticket and nothing ever brought it back.
 *
 * So: start from the snapshot, then keep whatever the board learned after the read — a ticket the
 * snapshot has never seen, or a newer copy of one it has. Anything the board holds from before
 * `serverTime` and the snapshot does not carry is genuinely gone.
 */
export function mergeSnapshot(state: BoardState, snapshot: BoardSnapshot): BoardState {
  const byId: Record<string, OrderDto> = { ...applySnapshot(snapshot.orders).byId };
  const readAt = Date.parse(snapshot.serverTime);
  for (const local of Object.values(state.byId)) {
    if (!isActiveStatus(local.status)) continue;
    const localAt = Date.parse(local.updatedAt);
    if (localAt <= readAt) continue;
    const known = byId[local.id];
    if (known && Date.parse(known.updatedAt) >= localAt) continue;
    byId[local.id] = local;
  }
  return { byId };
}

/**
 * How far the server's clock is ahead of this display's. A kitchen screen is a machine nobody
 * signs into and nobody notices the clock on; timers add this so a ticket's age is the kitchen's
 * answer rather than the screen's opinion.
 */
export const clockOffsetOf = (snapshot: BoardSnapshot, clientNow: number): number =>
  Date.parse(snapshot.serverTime) - clientNow;

export const ordersOf = (state: BoardState): OrderDto[] => Object.values(state.byId);

export type Column = 'new' | 'cooking' | 'ready';
// An order that is placed but not paid belongs to the guest's phone, not to the pass: the board
// shows work the kitchen may start, and payment is what makes it startable (ADR 0010).
//
// The key is the name of the column's message in `kitchen.columns` and `kitchen.empty`, not a
// word: this module holds the board's shape and the interface's language lives in the dictionary
// (the same move `lib/elapsed.ts` made in Task 5).
export const COLUMNS: readonly { key: Column; statuses: readonly OrderStatus[] }[] = [
  { key: 'new', statuses: ['paid'] },
  { key: 'cooking', statuses: ['cooking'] },
  { key: 'ready', statuses: ['ready'] },
];

/**
 * Does the board hold this ticket in its first column? A ticket the kitchen has not started is
 * new work; one it holds anywhere else — or does not hold at all — is not.
 */
export const inNewColumn = (state: BoardState, id: string): boolean => {
  const order = state.byId[id];
  return order !== undefined && COLUMNS[0]!.statuses.includes(order.status);
};

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

/**
 * The statuses a cook may bump on, and where each one goes. They are also the names of the three
 * messages in `kitchen.ticket.bump`: the verb on the button is a translation, and narrowing to
 * this union is what lets the card ask for one without an index that might not be there.
 */
export const BUMPABLE_STATUSES = ['paid', 'cooking', 'ready'] as const;
export type BumpableStatus = (typeof BUMPABLE_STATUSES)[number];
export const isBumpable = (status: OrderStatus): status is BumpableStatus =>
  (BUMPABLE_STATUSES as readonly OrderStatus[]).includes(status);
export const NEXT_STATUS: Record<BumpableStatus, OrderStatus> = {
  paid: 'cooking',
  cooking: 'ready',
  ready: 'served',
};
