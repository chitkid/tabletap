import { cn } from '@tabletap/ui';
import { formatTimer, thresholdFor, type Threshold } from '../../lib/timer-threshold';

const SUFFIX: Record<Threshold, string> = { ok: '', warn: ' · 5 min', late: ' · late' };
const COLOUR: Record<Threshold, string> = {
  ok: 'text-timer-ok',
  warn: 'text-timer-warn',
  late: 'text-timer-late',
};

function Mark({ threshold }: { threshold: Threshold }) {
  if (threshold === 'ok') return null;
  // A triangle for warning, a circle for late: the shape carries the meaning when the colour cannot.
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-5 fill-current">
      {threshold === 'warn' ? <path d="M8 1 15 14H1z" /> : <circle cx="8" cy="8" r="7" />}
    </svg>
  );
}

/** The ticket's headline after the table number (spec §3): big, mono, and never colour alone. */
export function TimerBadge({ elapsedMs }: { elapsedMs: number }) {
  const threshold = thresholdFor(elapsedMs);
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
      {`${formatTimer(elapsedMs)}${SUFFIX[threshold]}`}
    </span>
  );
}
