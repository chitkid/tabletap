/** Only a path on this origin may be a redirect target: `//host` and absolute URLs fall back. */
export function safeNext(value: string | undefined, fallback = '/kitchen'): string {
  return value !== undefined && /^\/(?!\/)/.test(value) ? value : fallback;
}
