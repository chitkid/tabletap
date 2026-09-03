import {
  SocketTokenResponseSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@tabletap/shared';
import { io, type Socket } from 'socket.io-client';
import { clientFetch } from './api';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
/** The browser-facing API origin: the rewrite cannot carry WebSockets (ADR 0004). Build-time value. */
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

export function createSocket(origin: string = API_ORIGIN): AppSocket {
  return io(origin, {
    autoConnect: false,
    // A fresh 60-second token for every attempt, reconnects included; an empty auth object
    // is refused by the server and the client keeps retrying with its backoff.
    auth: (cb) => {
      clientFetch('/api/socket-token', {
        schema: SocketTokenResponseSchema,
        init: { method: 'POST' },
      })
        .then((res) => cb({ token: res.token }))
        .catch(() => cb({}));
    },
  });
}
