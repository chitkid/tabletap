import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';
import { IntlMessageFormat } from 'intl-messageformat';

const format = (n: number) => new IntlMessageFormat(ru.guest.basketItems, 'ru-RU').format({ n });

describe('the basket count', () => {
  // 11 and 21 are the pair that catches a naive rule: 21 takes the same form as 1, and 11 does not.
  it.each([
    [1, '1 позиция'],
    [2, '2 позиции'],
    [5, '5 позиций'],
    [11, '11 позиций'],
    [21, '21 позиция'],
    [101, '101 позиция'],
  ])('formats %i', (n, expected) => {
    expect(format(n)).toBe(expected);
  });
});
