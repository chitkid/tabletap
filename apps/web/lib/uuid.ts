/**
 * `crypto.randomUUID` only exists in a secure context, which plain http on a LAN address is not —
 * exactly how a phone reaches a dev server at the table. `crypto.getRandomValues` is available
 * there, so the fallback builds the same thing by hand rather than letting checkout die.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // RFC 4122 §4.4: version 4 in the top nibble of byte 6, variant 10x in the top bits of byte 8.
  // The array is 16 bytes long by construction, so the `?? 0` fallbacks are unreachable; they are
  // there because `noUncheckedIndexedAccess` types an indexed read as possibly undefined.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
