import { describe, expect, it } from 'vitest';
import { isPhotoKeyFor } from './types';

const ITEM = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OBJECT = '33333333-3333-4333-8333-333333333333';

/**
 * The one security boundary of the photograph feature, tested at the port rather than only through
 * the route that calls it. Every other check around an upload - the ownership lookup, the signed
 * content type, the size ceiling - is undone if this function accepts a key outside the item's own
 * folder, so the shapes that would get past a `startsWith` test are named here one by one.
 */
describe('isPhotoKeyFor', () => {
  it('accepts exactly what photoKey builds, for each extension and in either case', () => {
    for (const ext of ['jpg', 'png', 'webp']) {
      expect(isPhotoKeyFor(ITEM, `menu/${ITEM}/${OBJECT}.${ext}`)).toBe(true);
    }
    // Both uuids are compared case-insensitively, and the id is compared as a string rather than
    // interpolated into the pattern, so an id carrying regex metacharacters cannot widen it.
    expect(isPhotoKeyFor(ITEM.toUpperCase(), `menu/${ITEM}/${OBJECT}.jpg`)).toBe(true);
    expect(isPhotoKeyFor(ITEM, `menu/${ITEM.toUpperCase()}/${OBJECT}.JPG`)).toBe(true);
  });

  it.each([
    // The whole reason this is not `key.startsWith('menu/<id>/')`: the key begins with this item's
    // prefix and still resolves into another dish's folder.
    ['embedded traversal', `menu/${ITEM}/../${OTHER}/${OBJECT}.jpg`],
    ['multi-segment traversal', `menu/${ITEM}/../../menu/${OTHER}/${OBJECT}.jpg`],
    ['a traversal out of the prefix entirely', `menu/${ITEM}/../../../etc/passwd.jpg`],
    ['another dish’s object', `menu/${OTHER}/${OBJECT}.jpg`],
    ['an extension we do not serve', `menu/${ITEM}/${OBJECT}.html`],
    ['no extension at all', `menu/${ITEM}/${OBJECT}`],
    ['a double extension', `menu/${ITEM}/${OBJECT}.jpg.html`],
    ['a short uuid in the object segment', `menu/${ITEM}/1234.jpg`],
    ['a uuid-shaped but different id', `menu/${OTHER}/${OBJECT}.jpg`],
    ['a query string hung off the key', `menu/${ITEM}/${OBJECT}.jpg?x=1`],
    ['a fragment hung off the key', `menu/${ITEM}/${OBJECT}.jpg#/a.jpg`],
    ['an absolute URL wearing the key as its path', `https://cdn.test/menu/${ITEM}/${OBJECT}.jpg`],
    ['a leading slash', `/menu/${ITEM}/${OBJECT}.jpg`],
    ['a deeper folder under the item', `menu/${ITEM}/nested/${OBJECT}.jpg`],
    ['a different prefix', `private/${ITEM}/${OBJECT}.jpg`],
    [
      'a newline smuggling a valid key past a line-anchored pattern',
      `evil\nmenu/${ITEM}/${OBJECT}.jpg`,
    ],
    ['nothing at all', ''],
  ])('refuses %s', (_name, key) => {
    expect(isPhotoKeyFor(ITEM, key)).toBe(false);
  });
});
