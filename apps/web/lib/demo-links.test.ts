import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LINKS = {
  guest: { tableNumber: 7, url: 'http://localhost:3000/t/token' },
  staff: [
    { role: 'admin', email: 'admin@littlefurnace.demo', name: 'Марина Ковалёва', password: 'demo' },
  ],
  resetsEveryMinutes: null,
  payments: { provider: 'demo', testCard: null },
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The cache is module state, so every test gets its own copy of the module. */
async function load() {
  vi.resetModules();
  return (await import('./demo-links')).fetchDemoLinks;
}
async function loadResult() {
  vi.resetModules();
  return (await import('./demo-links')).loadDemoLinks;
}

describe('fetchDemoLinks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks the API once inside the cache window and again after it', async () => {
    const f = vi.fn(async () => json(200, LINKS));
    vi.stubGlobal('fetch', f);
    const fetchDemoLinks = await load();
    expect(await fetchDemoLinks()).toEqual(LINKS);
    expect(await fetchDemoLinks()).toEqual(LINKS);
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(31_000);
    expect(await fetchDemoLinks()).toEqual(LINKS);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not cache the 404 that means demo mode is off', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json(404, { error: { code: 'NOT_FOUND', message: 'x' } }))
      .mockResolvedValueOnce(json(200, LINKS));
    vi.stubGlobal('fetch', f);
    const fetchDemoLinks = await load();
    expect(await fetchDemoLinks()).toBeNull();
    expect(await fetchDemoLinks()).toEqual(LINKS);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('loadDemoLinks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('says nothing when the 404 means demo mode is off or the data was never seeded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(404, { error: { code: 'NOT_FOUND', message: 'Not found.' } })),
    );
    const loadDemoLinks = await loadResult();
    // The plain product page is the right answer here, and a notice on it would be noise.
    expect(await loadDemoLinks()).toEqual({ links: null, notice: null });
  });

  it('passes on what the API said when demo mode is on but the links cannot be built', async () => {
    // An admin renumbering or deactivating table 7 reaches this in one press. Reading it as
    // "demo mode is off" would strip the landing of its cards, its QR and its sign-in buttons
    // with nothing said about why.
    const said = 'The demo landing needs an active table 7. Restore it in the admin.';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(409, {
          error: { code: 'CONFLICT', messageKey: 'demoTableMissing', message: said },
        }),
      ),
    );
    const loadDemoLinks = await loadResult();
    // The key, not the sentence: the landing has the words for it and this module has no request
    // context to look them up in. The English goes to the server log and no further.
    expect(await loadDemoLinks()).toEqual({ links: null, notice: 'demoTableMissing' });
  });

  it('says the links are unavailable when the API cannot be reached at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const loadDemoLinks = await loadResult();
    const result = await loadDemoLinks();
    expect(result.links).toBeNull();
    // The one key the API never sends, because an API that cannot be reached names nothing.
    expect(result.notice).toBe('unreachable');
  });
});
