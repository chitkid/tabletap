import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';
describe('safeNext', () => {
  it('keeps a same-origin path and falls back on anything else', () => {
    expect(safeNext('/kitchen')).toBe('/kitchen');
    expect(safeNext('/orders/abc?x=1')).toBe('/orders/abc?x=1');
    expect(safeNext(undefined)).toBe('/kitchen');
    expect(safeNext('//evil.example')).toBe('/kitchen');
    expect(safeNext('https://evil.example/x')).toBe('/kitchen');
    expect(safeNext('kitchen')).toBe('/kitchen');
  });
  it('falls back on a backslash trick that a URL parser would normalise into a host change', () => {
    // Browsers and Node's URL parser treat a backslash as a forward slash when resolving a
    // relative URL, so `/\evil.example` would otherwise resolve to `//evil.example` and then to
    // `https://evil.example/` — an open redirect straight out of a successful staff sign-in.
    expect(safeNext('/\\evil.example')).toBe('/kitchen');
    expect(safeNext('/foo\\bar')).toBe('/kitchen');
    expect(safeNext('/\\\\evil.example')).toBe('/kitchen');
    // The same payload as it would actually arrive on the wire, once Next.js decodes the query
    // string for `?next=%2F%5Cevil.example`.
    expect(safeNext(decodeURIComponent('%2F%5Cevil.example'))).toBe('/kitchen');
  });
  it('falls back on a control character rather than trust the URL parser to strip it safely', () => {
    // The WHATWG URL parser silently deletes ASCII tabs and newlines while resolving a relative
    // URL, so letting one through and hoping the parser neutralises it is the same class of bug
    // as the backslash trick: reject it outright instead.
    expect(safeNext('/\tevil.example')).toBe('/kitchen');
  });
});
