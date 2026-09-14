import { render as rtlRender, screen, type RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import { LATE_AFTER_MS, WARN_AFTER_MS } from '../../lib/timer-threshold';
import { TimerBadge } from './timer-badge';

/**
 * **jsdom does no layout**, so nothing in this file measures a pixel. What it pins is the
 * *source* of the badge's geometry: that the mark's box exists at every threshold, that the
 * digits sit in a slot wide enough for the widest time inside an hour, and that the suffix slot
 * is reserved from the longest word the dictionary holds rather than from the one on screen.
 * While those three hold, crossing a threshold cannot change the badge's width.
 *
 * The pixels themselves were measured in Chrome against this component's own server-rendered
 * markup under the app's real stylesheet; the numbers are in
 * `.superpowers/sdd/2026-09-14-russian-localisation/task-6-report.md` §3.
 */
const withIntl = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {children}
  </NextIntlClientProvider>
);
const render = (ui: ReactElement, options?: RenderOptions) =>
  rtlRender(ui, { wrapper: withIntl, ...options });

/** `toHaveTextContent` collapses U+00A0 before matching, so its fixtures carry a plain space. */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
/**
 * What each slot has to hold, in characters, plus the one character of slack the component keeps
 * because `ch` is rounded from the zero glyph and not from the advances text is laid out with -
 * see the component's own `SLACK`, and §3 of the report for the measurement behind it.
 */
const SLACK = 1;
const LONGEST = Math.max(...Object.values(ru.kitchen.timer).map((s) => s.length));
/** `mm:ss`. */
const DIGITS = 5;

const slot = (name: string): Element => {
  const el = screen.getByRole('timer').querySelector(`[data-timer='${name}']`);
  if (el === null) throw new Error(`no [data-timer='${name}'] in the badge`);
  return el;
};
/** `className` on an SVGElement is an SVGAnimatedString, so read the attribute either way. */
const classesOf = (el: Element) => el.getAttribute('class') ?? '';
const minWidthOf = (el: Element) => el.getAttribute('style') ?? '';

const AT = { ok: 65_000, warn: WARN_AFTER_MS, late: LATE_AFTER_MS + 60_000 } as const;

describe('TimerBadge', () => {
  it('says the age, and says nothing more while the ticket is inside its window', () => {
    render(<TimerBadge elapsedMs={AT.ok} />);
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
    expect(screen.getByRole('timer')).toHaveAttribute('data-threshold', 'ok');
    expect(slot('suffix').textContent).toBe('');
  });
  it('takes both threshold words from the dictionary, so colour is never carrying them alone', () => {
    const { unmount } = render(<TimerBadge elapsedMs={AT.warn} />);
    expect(screen.getByRole('timer')).toHaveTextContent(`5:00 ${plain(ru.kitchen.timer.warn)}`);
    expect(screen.getByRole('timer')).toHaveAttribute('data-threshold', 'warn');
    unmount();
    render(<TimerBadge elapsedMs={AT.late} />);
    expect(screen.getByRole('timer')).toHaveTextContent(`11:00 ${plain(ru.kitchen.timer.late)}`);
    expect(screen.getByRole('timer')).toHaveAttribute('data-threshold', 'late');
  });
  /**
   * The defect this replaces: the mark was `null` below the warning threshold, so a `size-5` box
   * appeared minutes after the page loaded and widened the header under a cook's hand.
   */
  it('keeps the mark box at every threshold, and draws a shape only past the warning', () => {
    const markAt = (elapsedMs: number) => {
      const { unmount } = render(<TimerBadge elapsedMs={elapsedMs} />);
      const mark = slot('mark');
      const seen = {
        classes: classesOf(mark),
        path: mark.querySelector('path') !== null,
        circle: mark.querySelector('circle') !== null,
      };
      unmount();
      return seen;
    };
    expect(markAt(AT.ok)).toEqual({
      classes: expect.stringContaining('size-5'),
      path: false,
      circle: false,
    });
    expect(markAt(AT.warn)).toEqual({
      classes: expect.stringContaining('size-5'),
      path: true,
      circle: false,
    });
    expect(markAt(AT.late)).toEqual({
      classes: expect.stringContaining('size-5'),
      path: false,
      circle: true,
    });
  });
  /**
   * Reserved from the dictionary, not from a number typed here: «опоздание» is five characters
   * longer than "late", and the next translation may be longer again. The badge is monospace, so
   * one character is one `ch` and the character count is the width.
   */
  it('reserves the suffix slot from the longest word the dictionary holds', () => {
    for (const elapsedMs of Object.values(AT)) {
      const { unmount } = render(<TimerBadge elapsedMs={elapsedMs} />);
      expect(minWidthOf(slot('suffix'))).toContain(`min-width: ${LONGEST + SLACK}ch`);
      unmount();
    }
  });
  /** 9:59 → 10:00 is one more digit, and it lands inside the late threshold's own window. */
  it('reserves the digits for the widest time inside an hour', () => {
    for (const elapsedMs of Object.values(AT)) {
      const { unmount } = render(<TimerBadge elapsedMs={elapsedMs} />);
      expect(minWidthOf(slot('digits'))).toContain(`min-width: ${DIGITS + SLACK}ch`);
      unmount();
    }
  });
  /** Nothing but the words and the colour may differ between thresholds. */
  it('renders the same three boxes at every threshold', () => {
    const boxes = (elapsedMs: number) => {
      const { unmount } = render(<TimerBadge elapsedMs={elapsedMs} />);
      const seen = [...screen.getByRole('timer').querySelectorAll('[data-timer]')].map((el) => [
        el.getAttribute('data-timer'),
        classesOf(el),
        minWidthOf(el),
      ]);
      unmount();
      return seen;
    };
    expect(boxes(AT.ok)).toHaveLength(3);
    expect(boxes(AT.warn)).toEqual(boxes(AT.ok));
    expect(boxes(AT.late)).toEqual(boxes(AT.ok));
  });
});
