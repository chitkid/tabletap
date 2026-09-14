import { cn } from '@tabletap/ui';
import { useTranslations } from 'next-intl';
import { formatTimer, thresholdFor, type Threshold } from '../../lib/timer-threshold';

const COLOUR: Record<Threshold, string> = {
  ok: 'text-timer-ok',
  warn: 'text-timer-warn',
  late: 'text-timer-late',
};

/**
 * The mark's box is drawn at every threshold and filled at two of them. It used to be `null`
 * below the warning, so five minutes into a shift a `size-5` box appeared inside the ticket's
 * header, widened it, and pushed every card under it down the column — minutes after the page
 * loaded, which is long past the window Lighthouse watches.
 *
 * A triangle for warning, a circle for late: the shape carries the meaning when the colour cannot.
 */
function Mark({ threshold }: { threshold: Threshold }) {
  return (
    <svg aria-hidden data-timer="mark" viewBox="0 0 16 16" className="size-5 fill-current">
      {threshold === 'warn' ? <path d="M8 1 15 14H1z" /> : null}
      {threshold === 'late' ? <circle cx="8" cy="8" r="7" /> : null}
    </svg>
  );
}

/** `mm:ss` — the widest time inside an hour, and the one 9:59 → 10:00 would otherwise widen. */
const DIGITS = 5;
/**
 * One character of slack on every reservation, and it is not a fudge.
 *
 * `ch` is the advance of the digit zero, and Chrome rounds it independently of the advances it
 * lays text out with: measured in this app's own stylesheet, a monospace character comes out a
 * shade wider than one `ch`, enough that eleven of them overflow `11ch` and the slot ends up
 * sized by its content rather than by its reservation. The overflow is far too small to see, but
 * a reservation the content can exceed is not a reservation. A whole character is three orders
 * of magnitude more than the gap — the numbers are in task-6-report.md §3, which is also where
 * they have to live, because `validate-tokens` reads a px measurement in a comment as a
 * hardcoded length. It costs one character of blank on a box meant to be blank most of a
 * ticket's life.
 */
const SLACK = 1;

/**
 * The ticket's headline after the table number (spec §3): big, mono, and never colour alone.
 *
 * Every part of it is a reserved box, so the badge is the same width from first paint to the end
 * of the ticket's life and nothing it does moves the board:
 *
 * - the mark's box, above;
 * - the digits. Past an hour `formatTimer` goes to `h:mm:ss` and the slot grows once; no ticket
 *   on this board lives that long, and reserving for it would cost two characters on every
 *   ticket that does not;
 * - the suffix, in as many `ch` as the longest word the dictionary has for a threshold. The
 *   badge is monospace, so a character is a `ch` and the character count is the width — and
 *   taking it from the dictionary rather than from a number typed here means a translator who
 *   writes a longer word than «опоздание» widens the slot instead of breaking the promise.
 */
export function TimerBadge({ elapsedMs }: { elapsedMs: number }) {
  const t = useTranslations('kitchen.timer');
  const threshold = thresholdFor(elapsedMs);
  const suffix = threshold === 'ok' ? '' : t(threshold);
  const longest = Math.max(t('warn').length, t('late').length);
  return (
    <span
      role="timer"
      aria-live="off"
      data-threshold={threshold}
      className={cn(
        'inline-flex items-center gap-2 font-mono text-xl font-medium whitespace-nowrap tabular-nums',
        COLOUR[threshold],
      )}
    >
      <Mark threshold={threshold} />
      {/* Left in the slot rather than right: every timer on the board then starts at the same
          distance from its mark whatever the digit count, and the slack sits where the suffix's
          own gap already is. */}
      <span data-timer="digits" style={{ minWidth: `${DIGITS + SLACK}ch` }}>
        {formatTimer(elapsedMs)}
      </span>
      {/* A whitespace-only run between two flex items is not rendered, so this changes no
          geometry — it is here so the badge's own `textContent` reads "11:00 · опоздание"
          rather than running the two boxes together for anything reading the text. */}{' '}
      <span data-timer="suffix" className="text-sm" style={{ minWidth: `${longest + SLACK}ch` }}>
        {suffix}
      </span>
    </span>
  );
}
