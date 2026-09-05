import type { DashboardResponse } from '@tabletap/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeekBars } from './week-bars';

type Week = DashboardResponse['week'];

/**
 * The API answers seven `YYYY-MM-DD` days, oldest first. Neither the format nor the order is in
 * `DashboardResponseSchema`, so both are pinned here: the labels below are read straight out of
 * the date string, and the array is handed over shuffled so the ordering cannot come for free.
 */
const WEEK: Week = [
  { date: '2026-08-30', orders: 3 },
  { date: '2026-08-31', orders: 0 },
  { date: '2026-09-01', orders: 12 },
  { date: '2026-09-02', orders: 5 },
  { date: '2026-09-03', orders: 8 },
  { date: '2026-09-04', orders: 1 },
  { date: '2026-09-05', orders: 6 },
];
const SHUFFLED: Week = [WEEK[2], WEEK[0], WEEK[6], WEEK[4], WEEK[1], WEEK[5], WEEK[3]].filter(
  (day): day is Week[number] => day !== undefined,
);

const bars = () => screen.getAllByRole('listitem');
const barIn = (item: HTMLElement) => item.querySelector('[data-slot="bar"]') as HTMLElement;

describe('WeekBars', () => {
  it('draws seven days oldest first, whatever order they arrived in', () => {
    render(<WeekBars week={SHUFFLED} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Paid orders, last seven days' }),
    ).toBeInTheDocument();
    expect(bars().map((item) => item.getAttribute('aria-label'))).toEqual([
      'Sun, Aug 30: 3 paid orders',
      'Mon, Aug 31: 0 paid orders',
      'Tue, Sep 1: 12 paid orders',
      'Wed, Sep 2: 5 paid orders',
      'Thu, Sep 3: 8 paid orders',
      'Fri, Sep 4: 1 paid order',
      'Sat, Sep 5: 6 paid orders',
    ]);
  });

  it('scales the busiest day to the full height and the rest against it', () => {
    render(<WeekBars week={WEEK} />);
    const heights = bars().map((item) => barIn(item).style.height);
    expect(heights[2]).toBe('100%');
    expect(heights[0]).toBe('25%');
    expect(heights[6]).toBe('50%');
  });

  it('prints each count on its bar rather than leaving the height to be guessed', () => {
    render(<WeekBars week={WEEK} />);
    // Seven numbers do not need an axis to read against: each one is written where it belongs.
    expect(bars().map((item) => item.textContent)).toEqual([
      '3Sun',
      '0Mon',
      '12Tue',
      '5Wed',
      '8Thu',
      '1Fri',
      '6Sat',
    ]);
  });

  it('keeps a day with no orders on the chart rather than dropping it', () => {
    render(<WeekBars week={WEEK} />);
    const quiet = bars()[1] as HTMLElement;

    expect(quiet).toHaveAttribute('aria-label', 'Mon, Aug 31: 0 paid orders');
    expect(barIn(quiet).style.height).toBe('0%');
    // A baseline of its own, so the day reads as measured-and-empty rather than as missing.
    // `\d+` would also match `min-h-0`, which is the one value that makes the baseline invisible -
    // a test that permits the bug it exists to prevent.
    expect(barIn(quiet).className).toMatch(/(?:^|\s)min-h-[1-9]\d*(?:\s|$)/);
  });

  it('says the week is empty instead of drawing seven flat lines', () => {
    render(<WeekBars week={WEEK.map((day) => ({ ...day, orders: 0 }))} />);

    expect(screen.getByText('No orders yet.')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
