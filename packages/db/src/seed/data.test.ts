import { DEFAULT_PLATE_KIND, PLATE_KINDS } from '@tabletap/shared';
import { describe, expect, it } from 'vitest';
import { DEMO_MENU, DEMO_RESTAURANT, DEMO_STAFF, DEMO_TABLES } from './data';

/**
 * The demo carries no photographs: every dish on the guest menu is drawn as a plate, and the plate
 * is chosen by its category's `plateKind`. Until this milestone that kind was guessed in the browser
 * from the category's display name against a list of English words, so the moment the categories
 * became Russian every dish in the menu fell to one shape — and nothing failed, because category
 * names are seed data and no test read them as pictures.
 *
 * These are the assertions that would have failed. They compare whole values rather than matching
 * patterns: `expect(kinds).toEqual([...])` cannot pass by matching nothing, which is how the three
 * fails-open regexes this milestone has already shipped got through.
 */
describe('the demo menu', () => {
  it('gives every category a kind from the closed set, declared rather than inferred', () => {
    for (const group of DEMO_MENU) {
      expect(PLATE_KINDS).toContain(group.plateKind);
    }
  });

  it('draws a different plate for each category, so the menu is not one shape repeated', () => {
    const kinds = DEMO_MENU.map((group) => group.plateKind);
    // The collapse this guards against is every category resolving to the same kind. Comparing the
    // deduplicated list against the full one names the failure in the diff: a collapsed menu prints
    // `['side'] !== ['side','side','side','side']` rather than a bare `4 !== 1`.
    expect([...new Set(kinds)]).toEqual(kinds);
  });

  it('leaves at most one category on the fallback kind', () => {
    const onFallback = DEMO_MENU.filter((group) => group.plateKind === DEFAULT_PLATE_KIND);
    expect(onFallback.map((group) => group.key)).toEqual(['starters']);
  });

  it('carries a stable key per category that is not the words a guest reads', () => {
    const keys = DEMO_MENU.map((group) => group.key);
    expect(keys).toEqual(['from-the-oven', 'hot-dishes', 'starters', 'drinks']);
    // A key is the row's identity across a re-wording; sharing one would collapse two categories
    // onto a single id at the next reset.
    expect([...new Set(keys)]).toEqual(keys);
    for (const group of DEMO_MENU) expect(group.key).not.toBe(group.name);
  });

  it('prices dishes as a Moscow café does, in whole roubles of integer kopecks', () => {
    const priced = DEMO_MENU.flatMap((group) =>
      group.items.map((item) => [group.key, item.name, item.priceCents] as const),
    );
    for (const [, , priceCents] of priced) {
      expect(Number.isInteger(priceCents)).toBe(true);
      // Whole roubles: the menu never prints kopecks, and `formatCents` rounds them away rather
      // than showing them, so a price that carried any would be a number nobody is ever charged.
      expect(priceCents % 100).toBe(0);
    }
    const roubles = (key: string) =>
      priced.filter(([k]) => k === key).map(([, , priceCents]) => priceCents / 100);
    // The three bands the copy document fixes. Written as sorted extremes rather than a loop of
    // `toBeGreaterThan`, so the failure message prints the price that left the band.
    const band = (values: number[]) => [Math.min(...values), Math.max(...values)];
    expect(band(roubles('hot-dishes'))).toEqual([720, 1180]);
    const coffee = ['Капучино', 'Раф с облепихой'];
    expect(
      band(priced.filter(([, name]) => coffee.includes(name)).map(([, , cents]) => cents / 100)),
    ).toEqual([290, 340]);
    const salads = ['Свёкла из печи с адыгейским сыром', 'Томаты с красным луком'];
    expect(
      band(priced.filter(([, name]) => salads.includes(name)).map(([, , cents]) => cents / 100)),
    ).toEqual([480, 560]);
  });

  it('takes roubles at Moscow time, and keeps the name over the door', () => {
    expect(DEMO_RESTAURANT.currency).toBe('RUB');
    expect(DEMO_RESTAURANT.timezone).toBe('Europe/Moscow');
    // The wordmark, the brand guidelines and every seeded QR token hang off these two.
    expect(DEMO_RESTAURANT.name).toBe('Little Furnace');
    expect(DEMO_RESTAURANT.slug).toBe('little-furnace');
  });

  it('names the tables in Russian with an ordinary space', () => {
    // The bound space first, because it is the mistake that does not show: a diff of «Стол 7»
    // against «Стол 7» renders identically, and the reader is left comparing two identical lines.
    // U+00A0 here would make the admin's table list print the name twice in every row — it hides a
    // label that only repeats the generated one, comparing the two with the whitespace flattened.
    // Built with `fromCharCode` rather than written into the string: prettier rewrites a
    // unicode escape back into the byte, and the byte looks like a space in every editor.
    const NBSP = String.fromCharCode(0xa0);
    for (const table of DEMO_TABLES) expect(table.label.includes(NBSP)).toBe(false);
    expect(DEMO_TABLES[6]).toEqual({ number: 7, label: 'Стол 7', seats: 2 });
  });

  it('keeps the sign-in addresses and translates only what a person is called', () => {
    expect(DEMO_STAFF.map((s) => s.email)).toEqual([
      'admin@littlefurnace.demo',
      'kitchen@littlefurnace.demo',
      'waiter@littlefurnace.demo',
    ]);
    expect(DEMO_STAFF.map((s) => s.name)).toEqual([
      'Марина Ковалёва',
      'Тимофей Басов',
      'Юлия Окулова',
    ]);
  });
});
