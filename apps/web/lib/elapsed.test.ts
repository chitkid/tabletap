import { describe, expect, it } from 'vitest';
import { formatElapsed } from './elapsed';
const t0 = Date.parse('2026-09-03T10:00:00Z');
describe('formatElapsed', () => {
  it('speaks in honest minutes', () => {
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 30_000)).toBe('Just now');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 60_000)).toBe('1 min ago');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 12 * 60_000 + 5_000)).toBe('12 min ago');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 + 65 * 60_000)).toBe('1 h 5 min ago');
    expect(formatElapsed('2026-09-03T10:00:00Z', t0 - 5_000)).toBe('Just now');
  });
});
