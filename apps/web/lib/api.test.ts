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

import { ERROR_MESSAGE_KEYS } from '@tabletap/shared';
import ru from '../messages/ru.json';

/**
 * The server's refusals, and the one rule that makes a Russian interface stay Russian when the
 * sentence arrives over the wire: **the web renders from the key and never from the sentence.**
 *
 * `apps/web/i18n/no-orphan-strings.test.ts` cannot see any of this, and says so in its own header:
 * these strings are not in the web's source. This file is the half of that gate that can only be
 * written here.
 */
describe('a refusal the server sent', () => {
  afterEach(() => vi.unstubAllGlobals());
  const refuse = async (error: Record<string, unknown>): Promise<ApiError> => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(409, { error })),
    );
    try {
      await clientFetch('/api/x', { schema: z.unknown() });
    } catch (err) {
      if (err instanceof ApiError) return err;
      throw err;
    }
    throw new Error('the request resolved, so there is no refusal to inspect');
  };

  it('carries the key, and the dictionary answers it in Russian', async () => {
    const err = await refuse({
      code: 'CONFLICT',
      messageKey: 'itemChanged',
      message: 'This item changed while you were editing it. Reload and try again.',
    });
    expect(err.messageKey).toBe('itemChanged');
    // Derived, not transcribed: what matters here is that the key reaches a Russian sentence at
    // all, and that the English one is not it.
    const russian = err.messageKey === null ? '' : ru.errors[err.messageKey];
    expect(russian).toBeTruthy();
    expect(russian).not.toContain('Reload');
  });

  /** Deploy skew, or an API that grew a refusal this build has never heard of. */
  it('drops a key the dictionary does not know, and keeps the code', async () => {
    const err = await refuse({
      code: 'CONFLICT',
      messageKey: 'aRefusalThisBuildHasNeverHeardOf',
      message: 'This item changed while you were editing it. Reload and try again.',
    });
    expect(err.messageKey).toBeNull();
    expect(err.code).toBe('CONFLICT');
  });

  /** An API older than this build sends no key at all. Same answer: fall back, keep the code. */
  it('treats an envelope with no key as one whose key it does not know', async () => {
    const err = await refuse({ code: 'IN_USE', message: 'This table has orders.' });
    expect(err.messageKey).toBeNull();
    expect(err.code).toBe('IN_USE');
  });

  /**
   * The sentence is still carried, because a developer reading a browser console or a server log
   * needs it. Nothing renders it - that is the business of the two call sites that used to, and of
   * `landing-content.test.tsx` and the four admin refusal tests that now prove they do not.
   */
  it('still carries the English sentence for the log', async () => {
    const err = await refuse({
      code: 'CONFLICT',
      messageKey: 'itemChanged',
      message: 'This item changed while you were editing it. Reload and try again.',
    });
    expect(err.message).toBe('This item changed while you were editing it. Reload and try again.');
  });

  it('has a Russian sentence for every key the API can send', () => {
    // Set equality in both directions: a key the API can send with nothing to say for it renders
    // its own name, and a dictionary entry no key reaches is dead copy nobody will maintain.
    expect(Object.keys(ru.errors).sort()).toEqual([...ERROR_MESSAGE_KEYS].sort());
  });
});
