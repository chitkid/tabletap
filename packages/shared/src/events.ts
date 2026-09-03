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
  subscribe: (ack: (snapshot: BoardSnapshot) => void) => void;
}

/** Rooms are assigned by the server from the socket's principal; clients never name one. */
export const SOCKET_ROOMS = {
  kitchen: 'kitchen',
  table: (tableId: string) => `table:${tableId}`,
} as const;
