import { describe, expect, it } from 'vitest';
import { formatCents } from './money';

// `Intl.NumberFormat('ru-RU', ...)` on this project's Node build (v24.16.0, bundled ICU) emits
// U+00A0 NO-BREAK SPACE for both the thousands-group separator and the gap before the currency
// symbol - not U+202F NARROW NO-BREAK SPACE, which newer CLDR data uses for the group separator
// in some locales. Built from its code point (0xa0) instead of pasted as an invisible literal, so
// the character is unambiguous in source and survives edits/diffs unchanged. Verified directly
// against this Node's actual Intl output - not assumed from the brief, though the brief's own
// literal bytes turned out to already be U+00A0 too.
const NBSP = String.fromCharCode(0xa0);

describe('formatCents', () => {
  it('puts the symbol after the number, in Russian order', () => {
    expect(formatCents(125_000, 'RUB')).toBe(`1${NBSP}250${NBSP}₽`);
  });

  it('drops kopecks, because a menu price is never 1 250,00 ₽', () => {
    expect(formatCents(125_050, 'RUB')).toBe(`1${NBSP}251${NBSP}₽`);
    expect(formatCents(25_000, 'RUB')).toBe(`250${NBSP}₽`);
  });

  it('still honours a currency that is not the default one', () => {
    expect(formatCents(125_000, 'USD')).toContain('$');
  });
});
