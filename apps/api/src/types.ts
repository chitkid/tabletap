import type { Db } from '@tabletap/db';
import type { Principal } from '@tabletap/shared';
import type { Config } from './config';
import type { Auth } from './auth';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
    auth: Auth;
  }
  interface FastifyRequest {
    principal: Principal;
  }
  interface FastifyContextConfig {
    /** Set to false on routes that must not resolve a principal (health, auth handler). */
    principal?: boolean;
  }
}
