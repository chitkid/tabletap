import { describe, expect, it } from 'vitest';
import { elapsedSince } from './elapsed';
const t0 = Date.parse('2026-09-03T10:00:00Z');
describe('elapsedSince', () => {
  it('speaks in honest minutes, and in units rather than in words', () => {
    expect(elapsedSince('2026-09-03T10:00:00Z', t0 + 30_000)).toEqual({ unit: 'now' });
    expect(elapsedSince('2026-09-03T10:00:00Z', t0 + 60_000)).toEqual({
      unit: 'minutes',
      minutes: 1,
    });
    expect(elapsedSince('2026-09-03T10:00:00Z', t0 + 12 * 60_000 + 5_000)).toEqual({
      unit: 'minutes',
      minutes: 12,
    });
    expect(elapsedSince('2026-09-03T10:00:00Z', t0 + 60 * 60_000)).toEqual({
      unit: 'hours',
      hours: 1,
    });
    expect(elapsedSince('2026-09-03T10:00:00Z', t0 + 65 * 60_000)).toEqual({
      unit: 'hoursMinutes',
      hours: 1,
      minutes: 5,
    });
    // A clock a few seconds ahead of the server must never read as a negative age.
    expect(elapsedSince('2026-09-03T10:00:00Z', t0 - 5_000)).toEqual({ unit: 'now' });
  });
});
