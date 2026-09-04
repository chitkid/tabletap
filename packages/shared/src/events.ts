import type { OrderDto } from './api';

/** What a client receives right after `subscribe`: everything it should currently show. */
export interface BoardSnapshot {
  orders: OrderDto[];
  serverTime: string;
}

export interface ServerToClientEvents {
  'order:created': (payload: { order: OrderDto }) => void;
  'order:updated': (payload: { order: OrderDto }) => void;
  /** The hourly demo reset wiped the orders: drop local state and subscribe again. */
  'demo:reset': () => void;
}

export interface ClientToServerEvents {
  /**
   * `null` means the server could not answer this time — a failed read, or a resubscribe loop
   * being throttled. It is deliberately not an empty snapshot: every client reads a snapshot as
   * the whole truth, so `{ orders: [] }` would clear every open board at once. On `null` a client
   * keeps what it holds and asks again.
   */
  subscribe: (ack: (snapshot: BoardSnapshot | null) => void) => void;
}

/**
 * Rooms are assigned by the server from the socket's principal; clients never name one.
 *
 * A guest's room is its session, not its table: a table changes hands, and a tab left open on the
 * old sitting must not keep receiving the next party's orders.
 */
export const SOCKET_ROOMS = {
  kitchen: 'kitchen',
  session: (guestSessionId: string) => `session:${guestSessionId}`,
} as const;
