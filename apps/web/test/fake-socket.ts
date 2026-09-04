import { vi, type Mock } from 'vitest';
import type { OrderDto } from '@tabletap/shared';

type Handler = (...args: never[]) => void;
type Snapshot = { orders: OrderDto[]; serverTime: string } | null;
/**
 * Annotated because the literal below refers to itself (`on` returns the socket, `emit` stores
 * the ack on it): without the annotation the inferred type is circular.
 */
export interface FakeSocket {
  on(event: string, fn: Handler): FakeSocket;
  off: Mock;
  removeAllListeners: Mock;
  connect: Mock;
  disconnect: Mock;
  emit: Mock;
  io: { on(event: string, fn: Handler): FakeSocket };
  /** Tracks `connect` and `disconnect` the way the real client does; components read it. */
  connected: boolean;
  lastAck: undefined | ((s: Snapshot) => void);
  fire(event: string, ...args: unknown[]): void;
}

/** A minimal stand-in for `AppSocket`, shared by every test that drives a live-updating screen. */
export function fakeSocket(): FakeSocket {
  const handlers = new Map<string, Handler[]>();
  const managerHandlers = new Map<string, Handler[]>();
  const on = (map: Map<string, Handler[]>) => (event: string, fn: Handler) => {
    map.set(event, [...(map.get(event) ?? []), fn]);
    return socket;
  };
  const socket: FakeSocket = {
    on: on(handlers),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    emit: vi.fn((event: string, ack?: (snapshot: Snapshot) => void) => {
      if (event === 'subscribe') socket.lastAck = ack;
    }),
    io: { on: on(managerHandlers) },
    connected: false,
    lastAck: undefined,
    fire(event: string, ...args: unknown[]) {
      if (event === 'connect') socket.connected = true;
      if (event === 'disconnect') socket.connected = false;
      for (const fn of handlers.get(event) ?? []) (fn as (...a: unknown[]) => void)(...args);
    },
  };
  return socket;
}
