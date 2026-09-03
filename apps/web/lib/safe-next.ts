const BACKSLASH_CODE = 0x5c;
const MAX_C0_CONTROL_CODE = 0x1f;
const DEL_CODE = 0x7f;

/**
 * True for a backslash anywhere, or any C0 control character (0x00-0x1f) or DEL (0x7f) anywhere.
 * Browsers and Node's URL parser normalise a backslash to a forward slash, and silently strip
 * tabs/newlines, when resolving a relative URL — either can smuggle a different host past a
 * check that only looks at the raw string, so these are rejected outright rather than relying on
 * the parser to normalise them away.
 */
function hasBackslashOrControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === BACKSLASH_CODE || code <= MAX_C0_CONTROL_CODE || code === DEL_CODE) return true;
  }
  return false;
}

/**
 * Only a same-origin path may be a redirect target: it must start with exactly one `/`, contain
 * no backslash or control character, and — the final, decisive check — resolve against a dummy
 * origin to that same origin (so `//host`, `https://host` and any parser quirk that would smuggle
 * a different host all fall back).
 *
 * The origin check alone is not enough: `new URL` applies WHATWG dot-segment removal to the
 * *path*, which can collapse `/../..//evil.example` down to a `pathname` of `//evil.example`
 * while `url.origin` stays the dummy origin untouched (dot-segments never touch the host). That
 * result is a protocol-relative URL — handed to `window.location.replace`, it navigates the
 * browser off-site exactly like the un-resolved `//evil.example` case above. So the string this
 * function is about to return is checked one more time, after resolution, with the same
 * single-leading-slash rule it started with.
 */
export function safeNext(value: string | undefined, fallback = '/kitchen'): string {
  if (value === undefined) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (hasBackslashOrControlChar(value)) return fallback;
  const probe = 'http://tabletap.invalid';
  try {
    const url = new URL(value, probe);
    if (url.origin !== probe) return fallback;
    const resolved = `${url.pathname}${url.search}${url.hash}`;
    return resolved.startsWith('/') && !resolved.startsWith('//') ? resolved : fallback;
  } catch {
    return fallback;
  }
}
