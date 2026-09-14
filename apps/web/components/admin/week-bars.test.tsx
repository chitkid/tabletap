import type { DashboardResponse } from '@tabletap/shared';
import { render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
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

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs
// in - unlike the real app, where this Server Component reads the request config directly, the
// file has no server/client split under Vite, so the provider is required here.
const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withIntl });

// `dayOrders` binds the count to "заказ…" with a non-breaking space
// (docs/design/02b-copy-ru.md's editorial rule). Every assertion below reads `aria-label` via the
// raw DOM `getAttribute`/`toHaveAttribute`, neither of which is a Testing Library text-content
// query - nothing normalises whitespace on that path, so the fixtures need the real U+00A0, not a
// plain space. Built from its code point rather than pasted as an invisible literal, so it
// survives edits/diffs unchanged - same convention as apps/web/lib/plural.test.ts's NBSP constant.
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string | number>) =>
  message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
const W = ru.admin.week;

/**
 * The dates are the one thing on this surface that no dictionary holds: `Intl` writes them. The
 * expectation is therefore derived from `Intl` — with the locale spelled out here, so the day this
 * component goes back to `en-US` the two disagree and the test says so. `EN` is the value the
 * component printed before this milestone and is asserted **against**, as a whole string rather
 * than as a pattern: a negative assertion written as a regex fails open.
 */
const opts = { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' } as const;
const RU_FULL = new Intl.DateTimeFormat('ru-RU', opts);
const EN_FULL = new Intl.DateTimeFormat('en-US', opts);
const RU_WEEKDAY = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: 'UTC' });
const EN_WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
const utc = (date: string) => {
  const [year, month, day] = date.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

const bars = () => screen.getAllByRole('listitem');
const barIn = (item: HTMLElement) => item.querySelector('[data-slot="bar"]') as HTMLElement;

describe('WeekBars', () => {
  it('draws seven days oldest first, whatever order they arrived in', () => {
    render(<WeekBars week={SHUFFLED} />);

    expect(screen.getByRole('heading', { level: 2, name: W.heading })).toBeInTheDocument();
    // The day counts run 3, 0, 12, 5, 8, 1, 6 - chosen so the week alone exercises all three
    // Russian plural forms: one (1), few (3), many (0, 5, 6, 8, 12, including the 11-14 trap at 12).
    expect(bars().map((item) => item.getAttribute('aria-label'))).toEqual([
      `вс, 30 авг.: 3${NBSP}заказа`,
      `пн, 31 авг.: 0${NBSP}заказов`,
      `вт, 1 сент.: 12${NBSP}заказов`,
      `ср, 2 сент.: 5${NBSP}заказов`,
      `чт, 3 сент.: 8${NBSP}заказов`,
      `пт, 4 сент.: 1${NBSP}заказ`,
      `сб, 5 сент.: 6${NBSP}заказов`,
    ]);
  });

  it('writes its dates in Russian rather than in the locale the surface shipped with', () => {
    render(<WeekBars week={WEEK} />);
    const weekdays = bars().map((item) => item.textContent?.replace(/^\d+/, '') ?? '');

    // Derived from Intl on both sides, so this holds whatever CLDR version Node carries.
    expect(weekdays).toEqual(WEEK.map((day) => RU_WEEKDAY.format(utc(day.date))));
    for (const day of WEEK) {
      const label = bars()
        .map((item) => item.getAttribute('aria-label') ?? '')
        .find((text) => text.startsWith(RU_FULL.format(utc(day.date))));
      expect(label).toBeDefined();
    }
    // And none of it is the English the component printed before: whole-value comparisons, because
    // a negative assertion written as a regex fails open (the milestone has shipped two that did).
    for (const day of WEEK) {
      expect(weekdays).not.toContain(EN_WEEKDAY.format(utc(day.date)));
      for (const label of bars().map((item) => item.getAttribute('aria-label') ?? ''))
        expect(label.startsWith(EN_FULL.format(utc(day.date)))).toBe(false);
    }
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
    expect(bars().map((item) => item.textContent)).toEqual(
      WEEK.map((day) => `${day.orders}${RU_WEEKDAY.format(utc(day.date))}`),
    );
  });

  it('keeps a day with no orders on the chart rather than dropping it', () => {
    render(<WeekBars week={WEEK} />);
    const quiet = bars()[1] as HTMLElement;

    // Composed through `admin.week.day`, so the separator between the date and the count is the
    // dictionary's and not a `: ` written into the component.
    expect(quiet).toHaveAttribute(
      'aria-label',
      fill(W.day, { date: RU_FULL.format(utc('2026-08-31')), orders: `0${NBSP}заказов` }),
    );
    expect(barIn(quiet).style.height).toBe('0%');
    // A baseline of its own, so the day reads as measured-and-empty rather than as missing.
    // `\d+` would also match `min-h-0`, which is the one value that makes the baseline invisible -
    // a test that permits the bug it exists to prevent.
    expect(barIn(quiet).className).toMatch(/(?:^|\s)min-h-[1-9]\d*(?:\s|$)/);
  });

  it('says the week is empty instead of drawing seven flat lines', () => {
    render(<WeekBars week={WEEK.map((day) => ({ ...day, orders: 0 }))} />);

    expect(screen.getByText(plain(W.empty))).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
