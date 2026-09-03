import { EventEmitter } from 'node:events';
import type { InternalOrderDto } from './orders';

/**
 * The seam between the routes and the socket layer. Routes and the rush generator emit here
 * after their transaction commits; realtime/server.ts subscribes and broadcasts. Nothing that
 * writes an order knows a socket exists, and a test can assert on the emitter alone.
 */
export class OrderEvents extends EventEmitter<{
  'order:created': [order: InternalOrderDto];
  'order:updated': [order: InternalOrderDto];
  'demo:reset': [];
}> {}
