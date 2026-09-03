import { createHash } from 'node:crypto';

/**
 * Fixed for the life of the demo tenant: changing it changes every seeded id, which is exactly
 * the churn this module exists to stop.
 */
const NAMESPACE = 'tabletap:seed:v1';

/**
 * A deterministic uuid for a seeded row, in the shape of a name-based (version 5) uuid.
 *
 * `seed --reset` deletes and re-inserts every demo row. With random ids that also invalidates
 * everything pointing at them: a printed QR token resolves to a table that no longer exists
 * (ADR 0002 promises the opposite), and a basket keyed on the table id is orphaned. Hashing the
 * row's natural key instead — the restaurant slug, the table number, the dish name — gives the
 * same id back after every reset.
 *
 * `kind` is one of a closed set of literals used by the seed (`restaurant`, `table`, `category`,
 * `item`), none of which contains a colon, so the two parts cannot run together.
 */
export function stableId(kind: string, key: string): string {
  const bytes = createHash('sha1')
    .update(`${NAMESPACE}:${kind}:${key}`, 'utf8')
    .digest()
    .subarray(0, 16);
  // RFC 4122 §4.3: version 5 in the top nibble of byte 6, variant 10x in the top bits of byte 8.
  // The slice above is 16 bytes long, so the `?? 0` fallbacks — which only exist because
  // `noUncheckedIndexedAccess` types an indexed read as possibly undefined — are unreachable.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}
