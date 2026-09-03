import type { IncomingHttpHeaders } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { StaffRoleSchema, type Principal } from '@tabletap/shared';
import { SLIDE_AFTER_MS, findActiveGuestSession, touchGuestSession } from './guest-sessions';

const ANONYMOUS: Principal = { kind: 'anonymous' };

export interface ResolvePrincipalInput {
  headers: IncomingHttpHeaders;
  /** The unsigned tt_guest value, i.e. a guest session id. Omitted when absent or forged. */
  guestCookie?: string;
  now?: Date;
}

export interface ResolvedPrincipal {
  principal: Principal;
  /** Set when the guest session slid: the caller must re-issue the cookie with this expiry. */
  slidTo?: Date;
  clearGuestCookie: boolean;
}

/**
 * Staff session first, then an unexpired guest session, then anonymous. Pure with respect to
 * the request/reply pair so it can be read and tested on its own; the caller owns the cookie jar.
 */
export async function resolvePrincipal(
  app: FastifyInstance,
  input: ResolvePrincipalInput,
): Promise<ResolvedPrincipal> {
  const now = input.now ?? new Date();

  let session: Awaited<ReturnType<typeof app.auth.api.getSession>>;
  try {
    session = await app.auth.api.getSession({ headers: fromNodeHeaders(input.headers) });
  } catch (err) {
    app.log.debug({ err }, 'getSession threw; treating as anonymous');
    return { principal: ANONYMOUS, clearGuestCookie: false };
  }

  if (session) {
    const role = StaffRoleSchema.safeParse(session.user.role);
    if (role.success) {
      return {
        principal: {
          kind: 'staff',
          userId: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: role.data,
        },
        clearGuestCookie: false,
      };
    }
  }

  if (input.guestCookie === undefined) return { principal: ANONYMOUS, clearGuestCookie: false };

  const guest = await findActiveGuestSession(app.db, input.guestCookie, now);
  if (!guest) return { principal: ANONYMOUS, clearGuestCookie: true };

  let expiresAt = guest.expiresAt;
  let slidTo: Date | undefined;
  if (now.getTime() - guest.lastSeenAt.getTime() > SLIDE_AFTER_MS) {
    expiresAt = await touchGuestSession(app.db, guest.id, {
      ttlHours: app.config.GUEST_SESSION_TTL_HOURS,
      now,
    });
    slidTo = expiresAt;
  }
  return {
    principal: {
      kind: 'guest',
      guestSessionId: guest.id,
      tableId: guest.tableId,
      tableNumber: guest.tableNumber,
      expiresAt: expiresAt.toISOString(),
    },
    ...(slidTo === undefined ? {} : { slidTo }),
    clearGuestCookie: false,
  };
}
