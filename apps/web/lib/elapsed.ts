/**
 * How long a ticket has been waiting, in the kitchen's own words. A clock that is a few
 * seconds ahead of the server must never read as a negative age, so the gap is clamped at 0.
 */
export function formatElapsed(fromIso: string, nowMs = Date.now()): string {
  const minutes = Math.floor(Math.max(0, nowMs - Date.parse(fromIso)) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`;
}
