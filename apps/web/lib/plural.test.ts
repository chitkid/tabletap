import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import { IntlMessageFormat } from 'intl-messageformat';

const format = (n: number) => new IntlMessageFormat(ru.guest.basketItems, 'ru-RU').format({ n });

// This compares the formatter's raw string output directly - nothing here goes through
// @testing-library/dom, so nothing normalises whitespace. The message binds the number to its
// noun with a non-breaking space (docs/design/02b-copy-ru.md's editorial rule, "12 заказов" named
// as its own example), so the fixtures need the real U+00A0, not a plain space. Built from its
// code point rather than pasted as an invisible literal, so it survives edits/diffs unchanged -
// same convention as apps/web/lib/money.test.ts's NBSP constant.
const NBSP = String.fromCharCode(0xa0);

describe('the basket count', () => {
  // 11 and 21 are the pair that catches a naive rule: 21 takes the same form as 1, and 11 does not.
  it.each([
    [1, `1${NBSP}позиция`],
    [2, `2${NBSP}позиции`],
    [5, `5${NBSP}позиций`],
    [11, `11${NBSP}позиций`],
    [21, `21${NBSP}позиция`],
    [101, `101${NBSP}позиция`],
  ])('formats %i', (n, expected) => {
    expect(format(n)).toBe(expected);
  });
});
