import { SignJWT, errors, jwtVerify } from 'jose';
import { StaffRoleSchema, type StaffRole } from '../roles';

export type SocketPrincipal =
  | { kind: 'staff'; userId: string; role: StaffRole; restaurantId: string }
  | {
      kind: 'guest';
      guestSessionId: string;
      tableId: string;
      tableNumber: number;
      restaurantId: string;
    };
export type SocketTokenErrorCode = 'TOKEN_INVALID' | 'TOKEN_EXPIRED';

export class SocketTokenVerifyError extends Error {
  constructor(public readonly code: SocketTokenErrorCode) {
    super(code);
    this.name = 'SocketTokenVerifyError';
  }
}

/** A distinct typ: a table token from a QR code must never open a socket, nor the reverse. */
const TYP = 'tt-socket';
const ALG = 'HS256';
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSocketToken(
  principal: SocketPrincipal,
  opts: { secret: string; ttlSeconds: number; now?: Date },
): Promise<string> {
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const claims =
    principal.kind === 'staff'
      ? { kind: 'staff', role: principal.role, rid: principal.restaurantId }
      : {
          kind: 'guest',
          tid: principal.tableId,
          tn: principal.tableNumber,
          rid: principal.restaurantId,
        };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG, typ: TYP })
    .setSubject(principal.kind === 'staff' ? principal.userId : principal.guestSessionId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + opts.ttlSeconds)
    .sign(key(opts.secret));
}

export async function verifySocketToken(
  token: string,
  opts: { secret: string; now?: Date },
): Promise<SocketPrincipal> {
  try {
    const { payload } = await jwtVerify(token, key(opts.secret), {
      algorithms: [ALG],
      typ: TYP,
      currentDate: opts.now,
    });
    const { sub, kind, rid } = payload;
    if (typeof sub !== 'string' || typeof rid !== 'string')
      throw new SocketTokenVerifyError('TOKEN_INVALID');
    if (kind === 'staff') {
      const role = StaffRoleSchema.safeParse(payload['role']);
      if (!role.success) throw new SocketTokenVerifyError('TOKEN_INVALID');
      return { kind: 'staff', userId: sub, role: role.data, restaurantId: rid };
    }
    if (kind === 'guest' && typeof payload['tid'] === 'string' && typeof payload['tn'] === 'number')
      return {
        kind: 'guest',
        guestSessionId: sub,
        tableId: payload['tid'],
        tableNumber: payload['tn'],
        restaurantId: rid,
      };
    throw new SocketTokenVerifyError('TOKEN_INVALID');
  } catch (err) {
    if (err instanceof SocketTokenVerifyError) throw err;
    if (err instanceof errors.JWTExpired) throw new SocketTokenVerifyError('TOKEN_EXPIRED');
    throw new SocketTokenVerifyError('TOKEN_INVALID');
  }
}
