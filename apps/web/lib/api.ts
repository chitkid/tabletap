import { ErrorEnvelopeSchema, type ErrorCode, type ErrorMessageKey } from '@tabletap/shared';
import type { ZodType } from 'zod';

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const GUEST_COOKIE = 'tt_guest';

export class ApiError extends Error {
  /**
   * `messageKey` is the half the interface renders, through `errors.*` in `messages/ru.json`.
   * `message` is the API's own English sentence and is for a log, a console and a stack: **no
   * surface renders it.** The gate in `apps/web/i18n/no-orphan-strings.test.ts` cannot see this
   * distinction — the sentence is not in this source tree at all — so the two call sites that used
   * to interpolate it (`components/admin/row-editor.tsx`, `lib/demo-links.ts`) carry the proof in
   * their own tests instead.
   *
   * `null` means the envelope named no refusal this build knows: an API older than this web tier,
   * an API newer than it, or a failure that never produced an envelope. Every reader turns that
   * into its own whole Russian sentence rather than into English.
   */
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'UNKNOWN',
    public readonly messageKey: ErrorMessageKey | null,
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
      // `undefined` from the schema (absent, or a key this build does not know - the envelope
      // catches that rather than failing) becomes `null` here, so a reader has one absence to
      // handle rather than two spellings of it.
      env.data.error.messageKey ?? null,
      env.data.error.message,
      env.data.error.details,
    );
  throw new ApiError(res.status, 'UNKNOWN', null, `Request failed with status ${res.status}`);
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
