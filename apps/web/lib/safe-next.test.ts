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
});
