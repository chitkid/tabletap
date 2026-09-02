import { SignJWT, errors, jwtVerify } from 'jose';

export interface TableTokenInput {
  tableId: string;
  restaurantId: string;
  tableNumber: number;
}
export interface TableTokenClaims extends TableTokenInput {
  issuedAt: number;
  expiresAt: number;
}
export type TableTokenErrorCode = 'TOKEN_INVALID' | 'TOKEN_EXPIRED';

export class TableTokenVerifyError extends Error {
  constructor(public readonly code: TableTokenErrorCode) {
    super(code);
    this.name = 'TableTokenVerifyError';
  }
}

const TYP = 'tt-table';
const ALG = 'HS256';
const key = (secret: string) => new TextEncoder().encode(secret);

export async function signTableToken(
  input: TableTokenInput,
  opts: { secret: string; ttlSeconds: number; now?: Date },
): Promise<string> {
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ rid: input.restaurantId, tn: input.tableNumber })
    .setProtectedHeader({ alg: ALG, typ: TYP })
    .setSubject(input.tableId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + opts.ttlSeconds)
    .sign(key(opts.secret));
}

export async function verifyTableToken(
  token: string,
  opts: { secret: string; now?: Date },
): Promise<TableTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, key(opts.secret), {
      algorithms: [ALG],
      typ: TYP,
      currentDate: opts.now,
    });
    const { sub, rid, tn, iat, exp } = payload;
    if (typeof sub !== 'string' || typeof rid !== 'string' || typeof tn !== 'number' || typeof iat !== 'number' || typeof exp !== 'number') {
      throw new TableTokenVerifyError('TOKEN_INVALID');
    }
    return { tableId: sub, restaurantId: rid, tableNumber: tn, issuedAt: iat, expiresAt: exp };
  } catch (err) {
    if (err instanceof TableTokenVerifyError) throw err;
    if (err instanceof errors.JWTExpired) throw new TableTokenVerifyError('TOKEN_EXPIRED');
    throw new TableTokenVerifyError('TOKEN_INVALID');
  }
}
