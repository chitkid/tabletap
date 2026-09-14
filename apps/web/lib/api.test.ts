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

import { DEMO_TABLE_NUMBER, ERROR_MESSAGE_KEYS } from '@tabletap/shared';
import en from '../messages/en.json';
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

  /**
   * `en.json` is unreferenced by code — the request config pins the locale to `ru` — and there is
   * no en/ru parity gate anywhere in this repository. That makes it the file a hurried edit
   * forgets, and a fallback file with holes in it is worse than no fallback file. This covers the
   * `errors` block only, which is the block this milestone added; the other ~300 leaf keys still
   * match by care rather than by gate.
   */
  it('has an English sentence for every key too, so the fallback file is whole', () => {
    expect(Object.keys(en.errors).sort()).toEqual([...ERROR_MESSAGE_KEYS].sort());
  });

  /**
   * The one refusal whose Russian carries a number: a message key takes no parameters, so
   * `demoTableMissing` spells out the table the demo landing needs. `routes/demo.test.ts` catches
   * a change to the constant; this catches a change to the sentence, which no test in `apps/api`
   * can see because that app cannot read this dictionary.
   */
  it('names the demo table the API actually looks for', () => {
    expect(ru.errors.demoTableMissing).toContain(String(DEMO_TABLE_NUMBER));
    expect(en.errors.demoTableMissing).toContain(String(DEMO_TABLE_NUMBER));
  });

  /**
   * Three refusals the server can name and the admin surface can also raise on its own. They say
   * the same thing in the same words on purpose — the situation is one situation — and that is
   * exactly why they have to be pinned: they are byte-identical, so a reword of either side leaves
   * the other behind with nothing failing, and a substring assertion cannot tell the two apart at
   * all. (It could not: `menu-row.test.tsx` and `menu-table.test.tsx` both stayed green with
   * `refuseDelete`'s `IN_USE` branch removed, until they were changed to compare whole strings.)
   */
  it('keeps the three IN_USE refusals identical on both sides', () => {
    expect(ru.errors.itemInUse).toBe(ru.admin.menu.dishInUse);
    expect(ru.errors.categoryInUse).toBe(ru.admin.menu.categoryInUse);
    expect(ru.errors.tableInUse).toBe(ru.admin.tables.inUse);
  });
});
