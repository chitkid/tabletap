import { ErrorEnvelopeSchema, type ErrorCode } from '@tabletap/shared';
import type { ZodType } from 'zod';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const GUEST_COOKIE = 'tt_guest';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'UNKNOWN',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseResponse<T>(res: Response, schema: ZodType<T>): Promise<T> {
  if (res.ok) return schema.parse(await res.json());
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const env = ErrorEnvelopeSchema.safeParse(body);
  if (env.success)
    throw new ApiError(
      res.status,
      env.data.error.code,
      env.data.error.message,
      env.data.error.details,
    );
  throw new ApiError(res.status, 'UNKNOWN', `Request failed with status ${res.status}`);
}

/** Server components: talk to the API directly and forward the guest cookie. */
export async function apiFetch<T>(
  path: string,
  opts: { schema: ZodType<T>; cookie?: string | null; init?: RequestInit },
): Promise<T> {
  const headers = new Headers(opts.init?.headers);
  if (opts.cookie) headers.set('cookie', `${GUEST_COOKIE}=${encodeURIComponent(opts.cookie)}`);
  // A plain record, not the Headers object: `Headers` normalises the casing for us, but a page
  // rendered on the server has no request context to inherit, so the outgoing headers stay
  // inspectable — by a test, and by anyone reading a log of what the web tier actually sent.
  const res = await fetch(`${API_URL}${path}`, {
    ...opts.init,
    headers: Object.fromEntries(headers),
    cache: 'no-store',
  });
  return parseResponse(res, opts.schema);
}

/** Browser: same origin, the rewrite proxies /api/* and the browser sends the cookies. */
export async function clientFetch<T>(
  path: string,
  opts: { schema: ZodType<T>; init?: RequestInit },
): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...opts.init });
  return parseResponse(res, opts.schema);
}
