import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './uuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns a v4 uuid', () => {
    expect(randomUuid()).toMatch(V4);
  });

  it('still mints a v4 uuid where crypto.randomUUID does not exist', () => {
    // Plain http on a LAN address is an insecure context: `crypto.randomUUID` is undefined
    // there, while `getRandomValues` is not.
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => real.getRandomValues(array),
    });
    expect(crypto.randomUUID).toBeUndefined();
    const first = randomUuid();
    const second = randomUuid();
    expect(first).toMatch(V4);
    expect(second).toMatch(V4);
    expect(first).not.toBe(second);
  });
});
