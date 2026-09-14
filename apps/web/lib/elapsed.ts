/**
 * How long ago something happened, decomposed rather than worded.
 *
 * The units used to be baked into this function as English suffixes, which made it a second place
 * the interface's language lived. It now answers with the shape of the age and the numbers in it;
 * which words that becomes is the dictionary's business, and `unit` is deliberately the key of the
 * message in `guest.elapsed` that says it.
 *
 * A clock that is a few seconds ahead of the server must never read as a negative age, so the gap
 * is clamped at 0.
 */
export type Elapsed =
  | { unit: 'now' }
  | { unit: 'minutes'; minutes: number }
  | { unit: 'hours'; hours: number }
  | { unit: 'hoursMinutes'; hours: number; minutes: number };

export function elapsedSince(fromIso: string, nowMs = Date.now()): Elapsed {
  const minutes = Math.floor(Math.max(0, nowMs - Date.parse(fromIso)) / 60_000);
  if (minutes < 1) return { unit: 'now' };
  if (minutes < 60) return { unit: 'minutes', minutes };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? { unit: 'hours', hours } : { unit: 'hoursMinutes', hours, minutes: rest };
}
