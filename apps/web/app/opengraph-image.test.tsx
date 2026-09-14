// @vitest-environment node
// The card is rendered by `next/og`, whose Node build reads its wasm off disk; jsdom is the wrong
// environment for it, and nothing here needs a DOM.
import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';
import { isValidElement, type CSSProperties, type ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

type RegisteredFont = { name: string; data: ArrayBuffer; weight: number; style: string };

// `ImageResponse` is replaced rather than run: what has to be checked is what the card *hands* to
// Satori — the exact font bytes and the exact strings — and rasterising it would only let those be
// inferred back from pixels.
const capture = vi.hoisted(() => ({
  card: undefined as { element: ReactNode; fonts: RegisteredFont[] } | undefined,
}));

vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactNode, options: { fonts?: RegisteredFont[] }) {
      capture.card = { element, fonts: options.fonts ?? [] };
    }
  },
}));

// `vi.mock` is hoisted above this import, so the card under test builds on the stub above.
import OpengraphImage, { alt } from './opengraph-image';

/**
 * Every character a WOFF can draw, read from its `cmap`.
 *
 * A font that is missing a character does not fail and does not draw a box: Satori looks through
 * every other registered font and then through the face `next/og` bundles, and the card returns
 * 200 with the Russian — or the Latin — set in something that is not the brand's face. There is no
 * error to assert on, so the assertion has to be made against the font files themselves.
 */
function glyphCoverage(data: ArrayBuffer): Set<number> {
  const woff = new DataView(data);
  const tagAt = (offset: number) =>
    String.fromCharCode(
      woff.getUint8(offset),
      woff.getUint8(offset + 1),
      woff.getUint8(offset + 2),
      woff.getUint8(offset + 3),
    );
  if (tagAt(0) !== 'wOFF') throw new Error('not a WOFF file');

  let cmap: DataView | undefined;
  const numTables = woff.getUint16(12);
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    if (tagAt(entry) !== 'cmap') continue;
    const offset = woff.getUint32(entry + 4);
    const compressedLength = woff.getUint32(entry + 8);
    const originalLength = woff.getUint32(entry + 12);
    const stored = Buffer.from(data, offset, compressedLength);
    // WOFF stores each table zlib-compressed unless compressing it made it bigger.
    const table = compressedLength < originalLength ? inflateSync(stored) : stored;
    cmap = new DataView(table.buffer, table.byteOffset, table.byteLength);
    break;
  }
  if (!cmap) throw new Error('font has no cmap table');

  const covered = new Set<number>();
  const numSubtables = cmap.getUint16(2);
  for (let i = 0; i < numSubtables; i++) {
    const subtable = cmap.getUint32(4 + i * 8 + 4);
    const format = cmap.getUint16(subtable);
    if (format === 4) {
      // Segment mapping to delta values: the BMP format every subsetted Google font carries.
      const segCount = cmap.getUint16(subtable + 6) / 2;
      const endCodes = subtable + 14;
      const startCodes = endCodes + segCount * 2 + 2;
      const idDeltas = startCodes + segCount * 2;
      const idRangeOffsets = idDeltas + segCount * 2;
      for (let s = 0; s < segCount; s++) {
        const start = cmap.getUint16(startCodes + s * 2);
        const end = cmap.getUint16(endCodes + s * 2);
        if (start === 0xffff) continue;
        const delta = cmap.getInt16(idDeltas + s * 2);
        const rangeOffset = cmap.getUint16(idRangeOffsets + s * 2);
        for (let code = start; code <= end; code++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
          else {
            const at = idRangeOffsets + s * 2 + rangeOffset + (code - start) * 2;
            if (at + 1 >= cmap.byteLength) continue;
            glyph = cmap.getUint16(at);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) covered.add(code);
        }
      }
    } else if (format === 12) {
      // Segmented coverage, for anything above the BMP.
      const numGroups = cmap.getUint32(subtable + 12);
      for (let g = 0; g < numGroups; g++) {
        const group = subtable + 16 + g * 12;
        const start = cmap.getUint32(group);
        const end = cmap.getUint32(group + 4);
        const startGlyph = cmap.getUint32(group + 8);
        for (let code = start; code <= end; code++) {
          if (startGlyph + (code - start) !== 0) covered.add(code);
        }
      }
    }
  }
  return covered;
}

/** Every run of text the card draws, one entry per text node, in layout order. */
function drawnText(node: ReactNode): string[] {
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(drawnText);
  if (isValidElement<{ children?: ReactNode }>(node)) return drawnText(node.props.children);
  return [];
}

let card: { element: ReactNode; fonts: RegisteredFont[] };
let drawn: string[];
let rootStyle: CSSProperties | undefined;

beforeAll(async () => {
  await OpengraphImage();
  if (!capture.card) throw new Error('the card did not construct an ImageResponse');
  card = capture.card;
  drawn = drawnText(card.element);
  rootStyle = isValidElement<{ style?: CSSProperties }>(card.element)
    ? card.element.props.style
    : undefined;
});

describe('the link-preview card', () => {
  it('draws Russian, so there is Cyrillic to get wrong in the first place', () => {
    expect(drawn).toContain('Little Furnace');
    expect(/\p{Script=Cyrillic}/u.test(drawn.join(''))).toBe(true);
    // The card's own claim about `alt`: it is the exhaustive list of what is drawn, which is what
    // makes it the thing a screen reader can be given instead of the picture.
    for (const run of drawn) expect(alt).toContain(run);
  });

  it('registers each font file under its own family name, because Satori keeps one per name', () => {
    // Satori stores fonts in a Map keyed by family name and resolves one file per name, weight and
    // style. Two files under one name is not an error and not a warning: the second is dropped, and
    // every character only it could draw silently goes to the bundled fallback face.
    expect(card.fonts).toHaveLength(2);
    expect(new Set(card.fonts.map((font) => font.name)).size).toBe(card.fonts.length);
    for (const font of card.fonts) expect(font.weight).toBe(700);
  });

  it('asks for a family it actually registered', () => {
    // A family name that matches nothing registered is the same silent fallback by another route.
    expect(card.fonts.map((font) => font.name)).toContain(rootStyle?.fontFamily);
  });

  it('can draw every character it puts on the card', () => {
    // PT Sans Narrow's cyrillic subset is U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1 and U+2116:
    // on its own it cannot draw «Little Furnace», a comma or a full stop, and the latin subset
    // cannot draw a word of the Russian. The card needs the union, and this is where that is
    // enforced rather than assumed.
    const covered = new Set<number>();
    for (const font of card.fonts) for (const code of glyphCoverage(font.data)) covered.add(code);
    const characters = new Set(drawn.join(''));
    const missing = [...characters].filter((char) => !covered.has(char.codePointAt(0) ?? 0));
    expect(missing).toEqual([]);
  });
});
