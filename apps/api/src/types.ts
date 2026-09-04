import type { Db } from '@tabletap/db';
import type { Principal } from '@tabletap/shared';
import type { Config } from './config';
import type { Auth } from './auth';
import type { OrderEvents } from './lib/order-events';
import type { Rush } from './lib/rush';
import type { PaymentProvider } from './payments/types';
import type { RealtimeServer } from './realtime/server';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
    auth: Auth;
    orderEvents: OrderEvents;
    io: RealtimeServer;
    rush: Rush;
    payments: PaymentProvider;
  }
  interface FastifyRequest {
    principal: Principal;
  }
  interface FastifyContextConfig {
    /** Set to false on routes that must not resolve a principal (health, auth handler). */
    principal?: boolean;
    /** Opt out of the default-deny route guard: the route is open to everyone on purpose. */
    public?: boolean;
  }
}
