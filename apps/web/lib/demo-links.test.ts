import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LINKS = {
  guest: { tableNumber: 7, url: 'http://localhost:3000/t/token' },
  staff: [
    { role: 'admin', email: 'admin@littlefurnace.demo', name: 'Mara Quinn', password: 'demo' },
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
