import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, clientFetch } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('api helpers', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('parses a success body with the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, { ok: true })),
    );
    expect(await clientFetch('/api/x', { schema: z.object({ ok: z.boolean() }) })).toEqual({
      ok: true,
    });
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
  });
  it('turns an envelope into an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(409, {
          error: {
            code: 'ITEM_UNAVAILABLE',
            message: 'Some items are sold out today.',
            details: { unavailable: [] },
          },
        }),
      ),
    );
    await expect(clientFetch('/api/x', { schema: z.unknown() })).rejects.toMatchObject({
      status: 409,
      code: 'ITEM_UNAVAILABLE',
      details: { unavailable: [] },
    });
  });
  it('forwards the guest cookie server-side and never caches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(200, {})),
    );
    await apiFetch('/api/menu', { schema: z.object({}), cookie: 'abc.sig+/=' });
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/menu$/);
    expect(init).toMatchObject({
      cache: 'no-store',
      headers: { cookie: `tt_guest=${encodeURIComponent('abc.sig+/=')}` },
    });
  });
  it('maps a non-envelope failure to UNKNOWN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gateway', { status: 502 })),
    );
    await expect(clientFetch('/api/x', { schema: z.unknown() })).rejects.toBeInstanceOf(ApiError);
    await expect(clientFetch('/api/x', { schema: z.unknown() })).rejects.toMatchObject({
      status: 502,
      code: 'UNKNOWN',
    });
  });
});
