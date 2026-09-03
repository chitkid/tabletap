import type { OrderDto } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import { formatTimer, thresholdFor, timerStartOf } from './timer-threshold';

describe('timer helpers', () => {
  it('thresholds at 5 and 10 minutes', () => {
    expect(thresholdFor(0)).toBe('ok');
    expect(thresholdFor(299_999)).toBe('ok');
    expect(thresholdFor(300_000)).toBe('warn');
    expect(thresholdFor(600_000)).toBe('late');
  });
  it('formats m:ss and clamps negatives', () => {
    expect(formatTimer(5_000)).toBe('0:05');
    expect(formatTimer(727_000)).toBe('12:07');
    expect(formatTimer(3_723_000)).toBe('1:02:03');
    expect(formatTimer(-4_000)).toBe('0:00');
  });
  it('starts the clock at the timestamp of the current status', () => {
    const base = {
      placedAt: '2026-09-03T10:00:00Z',
      cookingAt: '2026-09-03T10:04:00Z',
      readyAt: '2026-09-03T10:09:00Z',
      createdAt: '2026-09-03T09:59:00Z',
    } as OrderDto;
    expect(timerStartOf({ ...base, status: 'placed' })).toBe(base.placedAt);
    expect(timerStartOf({ ...base, status: 'cooking' })).toBe(base.cookingAt);
    expect(timerStartOf({ ...base, status: 'ready' })).toBe(base.readyAt);
    expect(timerStartOf({ ...base, status: 'cooking', cookingAt: null })).toBe(base.placedAt);
    expect(timerStartOf({ ...base, status: 'placed', placedAt: null })).toBe(base.createdAt);
  });
});
