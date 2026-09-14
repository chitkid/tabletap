import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import type { TableDto } from '@tabletap/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderQrSheet } from './qr-pdf';

const WEB_ORIGIN = 'http://localhost:3000';

/**
 * The committed faces, read from the directory the module itself reads them from, so a test that
 * corrupts one corrupts the real file rather than a copy that has drifted from it.
 */
const BRAND_FONTS = fileURLToPath(new URL('../../public/fonts/', import.meta.url));
const FACES = ['PT_Sans-Narrow-Web-Regular.ttf', 'PT_Sans-Narrow-Web-Bold.ttf'] as const;

/** Whitespace flattened, so a heading bound with U+00A0 and a typed label compare as one name. */
const NBSP = String.fromCharCode(0xa0);
const flat = (text: string): string => text.split(NBSP).join(' ').trim();

function tablesFor(count: number): TableDto[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    number: i + 1,
    label: `Стол ${i + 1}`,
    seats: 2,
    isActive: true,
  }));
}

/** A stand-in for the signer: the route hands `renderQrSheet` a real signed table token. */
const tokenFor = (table: TableDto) => Promise.resolve(`token-for-table-${table.number}`);

function countMatches(pdf: string, pattern: RegExp): number {
  return pdf.match(pattern)?.length ?? 0;
}

/* -------------------------------------------------------------------------------------------- *
 * Reading the sheet back the way a PDF reader reads it.
 *
 * A test that greps the file for «Стол 7» fails even on a correct document: an embedded subset
 * font writes glyph ids, not characters, so the bytes in the content stream are `<0001000200…>`
 * and mean nothing on their own. What makes them mean something is the font's own `/ToUnicode`
 * CMap, which is the table a reader consults to copy text out of a page or to search it. So these
 * helpers do exactly what a reader does: find the page, find which font each run was drawn with,
 * and map that run's codes back through that font's CMap.
 *
 * The no-CMap branch matters as much as the CMap one. A simple font (`/Subtype /Type1`) carries no
 * `/ToUnicode`, and a reader falls back to its `/Encoding` — `/WinAnsiEncoding`, one byte per
 * character. Decoding that way is what makes this test *show* the defect rather than merely fail
 * against it: run it on a sheet drawn in Helvetica and the extracted text is the mojibake a guest
 * would have read off the card.
 * -------------------------------------------------------------------------------------------- */

/**
 * Every `N 0 obj` body, by number. Objects are cut at the next object header rather than at
 * `endobj`, because an object here may be a deflated font or image whose bytes can spell anything.
 */
function objectsIn(pdf: string): Map<number, string> {
  const headers = [...pdf.matchAll(/(?:^|[\r\n])(\d+) 0 obj/g)];
  const objects = new Map<number, string>();
  headers.forEach((header, i) => {
    const from = (header.index ?? 0) + header[0].length;
    const to = headers[i + 1]?.index ?? pdf.length;
    const number = Number(header[1]);
    if (!objects.has(number)) objects.set(number, pdf.slice(from, to));
  });
  return objects;
}

/** The object number a dictionary key points at, for the `/Key N 0 R` form pdfkit writes. */
function refIn(dictionary: string, key: string): number | null {
  const found = new RegExp(`/${key}\\s+(\\d+) 0 R`).exec(dictionary);
  return found === null ? null : Number(found[1]);
}

/** An object's stream, inflated when it is Flate-compressed, sliced by its declared `/Length`. */
function streamIn(object: string): Buffer | null {
  const at = object.indexOf('stream');
  if (at < 0) return null;
  const dictionary = object.slice(0, at);
  const length = /\/Length\s+(\d+)/.exec(dictionary);
  if (length === null) return null;
  let start = at + 'stream'.length;
  if (object[start] === '\r') start += 1;
  if (object[start] === '\n') start += 1;
  const raw = Buffer.from(object.slice(start, start + Number(length[1])), 'latin1');
  return /\/Filter\s*\/FlateDecode/.test(dictionary) ? inflateSync(raw) : raw;
}

/** One `<hex>` destination of a CMap entry: UTF-16BE, so possibly more than one code unit. */
const utf16be = (hex: string): string => Buffer.from(hex, 'hex').swap16().toString('utf16le');

/** A `/ToUnicode` CMap, as the code → text table a reader builds from it. */
function cmapIn(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const pair of (block[1] ?? '').matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g))
      map.set(parseInt(pair[1] ?? '', 16), utf16be(pair[2] ?? ''));
  for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const range of (block[1] ?? '').matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g,
    )) {
      const low = parseInt(range[1] ?? '', 16);
      const high = parseInt(range[2] ?? '', 16);
      const list = range[4];
      if (list === undefined) {
        // `<lo> <hi> <dst>`: the destinations run on from `dst`.
        const first = parseInt(range[3] ?? '', 16);
        for (let code = low; code <= high; code += 1)
          map.set(code, String.fromCodePoint(first + (code - low)));
      } else {
        // `<lo> <hi> [<dst> <dst> …]`: one destination per code, which is the form pdfkit writes.
        const destinations = [...list.matchAll(/<([0-9A-Fa-f]*)>/g)].map((m) =>
          utf16be(m[1] ?? ''),
        );
        for (let code = low; code <= high; code += 1) {
          const destination = destinations[code - low];
          if (destination !== undefined) map.set(code, destination);
        }
      }
    }
  return map;
}

/** How a reader turns one font's written codes back into characters. */
function decoderFor(objects: Map<number, string>, font: string): (hex: string) => string {
  const toUnicode = refIn(font, 'ToUnicode');
  if (toUnicode !== null) {
    const stream = streamIn(objects.get(toUnicode) ?? '');
    const map = cmapIn(stream === null ? '' : stream.toString('latin1'));
    // Two bytes per code under Identity-H, which is how pdfkit writes every font it embeds.
    const width = /\/Encoding\s*\/Identity-H/.test(font) ? 4 : 2;
    return (hex) => {
      let text = '';
      for (let i = 0; i + width <= hex.length; i += width)
        text += map.get(parseInt(hex.slice(i, i + width), 16)) ?? '�';
      return text;
    };
  }
  // No `/ToUnicode`: a built-in font, which a reader decodes through its declared `/Encoding`,
  // one byte per character. Only WinAnsi is implemented, because that is the encoding pdfkit
  // writes for a built-in face and the one this sheet was defective in; anything else is left
  // visibly unresolved rather than guessed at, so a font this helper does not understand can
  // never be mistaken for a font that drew the right characters.
  if (!/\/Encoding\s*\/WinAnsiEncoding/.test(font)) return (hex) => '\uFFFD'.repeat(hex.length / 2);
  const winAnsi = new TextDecoder('windows-1252');
  return (hex) => winAnsi.decode(Buffer.from(hex, 'hex'));
}

/** Every text run the sheet draws, in the order it draws them, as a reader resolves them. */
function drawnText(pdf: Buffer): string[] {
  const file = pdf.toString('latin1');
  const objects = objectsIn(file);
  const tree = [...objects.values()].find((o) => /\/Type\s*\/Pages\b/.test(o)) ?? '';
  const kids = [...(/\/Kids\s*\[([^\]]*)\]/.exec(tree)?.[1] ?? '').matchAll(/(\d+) 0 R/g)];
  const runs: string[] = [];
  for (const kid of kids) {
    const page = objects.get(Number(kid[1])) ?? '';
    const resources = objects.get(refIn(page, 'Resources') ?? -1) ?? '';
    const decoders = new Map<string, (hex: string) => string>();
    for (const font of (/\/Font\s*<<([^>]*)>>/.exec(resources)?.[1] ?? '').matchAll(
      /\/(F\d+)\s+(\d+) 0 R/g,
    ))
      decoders.set(font[1] ?? '', decoderFor(objects, objects.get(Number(font[2])) ?? ''));
    const contents = streamIn(objects.get(refIn(page, 'Contents') ?? -1) ?? '');
    let decode = (hex: string): string => hex;
    for (const token of (contents === null ? '' : contents.toString('latin1')).matchAll(
      /\/(F\d+)[\s\d.]+Tf|\[([^\]]*)\]\s*TJ|<([0-9A-Fa-f]*)>\s*Tj/g,
    )) {
      const selected = token[1];
      if (selected !== undefined) {
        decode = decoders.get(selected) ?? decode;
        continue;
      }
      const array = token[2];
      const written =
        array === undefined
          ? [token[3] ?? '']
          : [...array.matchAll(/<([0-9A-Fa-f]*)>/g)].map((m) => m[1] ?? '');
      runs.push(written.map((hex) => decode(hex)).join(''));
    }
  }
  return runs;
}

/**
 * The PDF is read as latin1 because a PDF body is bytes, not text: dictionaries (the page,
 * annotation and font objects these assertions read) are plain ASCII, while the image, font and
 * content streams around them are binary.
 */
describe('renderQrSheet', () => {
  it('draws Russian a reader resolves back to the characters it was given', async () => {
    const buffer = await renderQrSheet({
      restaurant: { name: 'Little Furnace' },
      // A label that says something the number does not, so this card draws both of its lines.
      // The plain spaces in it are a person’s, beside a Latin restaurant name and a heading
      // bound with U+00A0: one sheet has to draw both scripts and both spaces, so one face has
      // to cover both and nothing may normalise either.
      tables: [{ id: randomUUID(), number: 7, label: 'Терраса у окна', seats: 2, isActive: true }],
      tokenFor,
      webOrigin: WEB_ORIGIN,
    });
    const drawn = drawnText(buffer);

    // The sentence a guest reads off the card, the heading a waiter reads across the sheet, and
    // the label a person typed into the admin. Pinned as literals rather than imported from the
    // module that writes them: a test comparing the module with itself passes on any wording,
    // English included. The heading binds the number to the noun with U+00A0, as the copy contract
    // asks and as `admin.tables.table` already does on screen, while the label carries the plain
    // space it was typed with - so both spaces have to survive into the file as themselves.
    //
    // Asserted against the runs joined rather than one at a time, so that a failure prints the
    // whole sheet the way a reader shows it: «Стол 7» being absent says far less than whatever
    // mojibake is standing where it should have been.
    const sheet = drawn.join(' | ');
    expect(sheet).toContain('Стол\u00a07');
    expect(sheet).toContain('Терраса у окна');
    expect(sheet).toContain('Little Furnace');
    expect(sheet).toContain('Отсканируйте код камерой телефона, выберите блюда и оформите заказ.');
    // The running head, dated the way a Russian reader writes a date rather than in ISO.
    expect(sheet).toMatch(/QR-коды столов — напечатано \d{2}\.\d{2}\.\d{4}/u);
    // And the heading is a line of its own, not a fragment of some longer one.
    expect(drawn).toContain('Стол\u00a07');

    // What makes the text above resolvable at all, stated as the file's own facts. The measured
    // defect this test exists for was `/BaseFont /Helvetica /Encoding /WinAnsiEncoding`: a built-in
    // face with no Cyrillic in it, which a reader decodes one byte at a time.
    const file = buffer.toString('latin1');
    expect(file).not.toMatch(/\/BaseFont\s*\/Helvetica/);
    expect(file).not.toMatch(/\/WinAnsiEncoding/);
    expect(file).toMatch(/\/Subtype\s*\/Type0/);
    expect(file).toMatch(/\/Encoding\s*\/Identity-H/);
    // Embedded, not merely named: the reader draws these glyphs from bytes inside this file.
    expect(file).toMatch(/\/FontFile2/);
    // The brand face, subset-tagged by pdfkit. A third typeface would read differently here.
    expect(file).toMatch(/\/BaseFont\s*\/[A-Z]{6}\+PTSans-Narrow/);
  });

  it('invites a restaurant with nothing to print to add a table, in Russian', async () => {
    const buffer = await renderQrSheet({
      restaurant: { name: 'Little Furnace' },
      tables: [],
      tokenFor,
      webOrigin: WEB_ORIGIN,
    });
    expect(drawnText(buffer).join(' ')).toContain(
      'Добавьте стол или включите отключённый — и распечатайте QR-коды заново.',
    );
  });

  it('titles the document in Russian, which is what a reader puts in its window', async () => {
    const buffer = await renderQrSheet({
      restaurant: { name: 'Little Furnace' },
      tables: tablesFor(1),
      tokenFor,
      webOrigin: WEB_ORIGIN,
    });
    // Document metadata is a text string, and pdfkit writes a non-ASCII one as UTF-16BE with a
    // byte-order mark — the only encoding of `/Title` a reader is required to understand.
    const title = /\/Title\s+(\d+) 0 R/.exec(buffer.toString('latin1'));
    const object = objectsIn(buffer.toString('latin1')).get(Number(title?.[1])) ?? '';
    const literal = /\(([\s\S]*)\)/.exec(object)?.[1] ?? '';
    const bytes = Buffer.from(literal.replace(/\\([\\()])/g, '$1'), 'latin1');
    const text = bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))
      ? bytes.subarray(2).swap16().toString('utf16le')
      : bytes.toString('latin1');
    expect(text).toBe('Little Furnace — QR-коды столов');
  });

  it('answers a PDF with one card per table, six to a page', async () => {
    const tables = tablesFor(7);
    const signer = vi.fn(tokenFor);
    const buffer = await renderQrSheet({
      restaurant: { name: 'Little Furnace' },
      tables,
      tokenFor: signer,
      webOrigin: WEB_ORIGIN,
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const pdf = buffer.toString('latin1');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);

    // One card per table: each card carries a link annotation over its QR, pointing at the very
    // address the QR encodes, so the count and the addresses are both readable from the file.
    expect(countMatches(pdf, /\/Subtype\s*\/Link/g)).toBe(tables.length);
    for (const table of tables) {
      expect(pdf, `table ${table.number}`).toContain(
        `${WEB_ORIGIN}/t/token-for-table-${table.number}`,
      );
    }
    expect(signer).toHaveBeenCalledTimes(tables.length);

    // Six cards to a page: seven tables need two.
    expect(countMatches(pdf, /\/Type\s*\/Page\b/g)).toBe(2);
    // And every card on both pages reads as the table it is for.
    const drawn = drawnText(buffer);
    for (const table of tables)
      expect(drawn, `table ${table.number}`).toContain(`Стол\u00a0${table.number}`);
  });

  it('fills exactly one page when there are six tables and three when there are thirteen', async () => {
    for (const [count, pages] of [
      [6, 1],
      [13, 3],
    ] as const) {
      const buffer = await renderQrSheet({
        restaurant: { name: 'Little Furnace' },
        tables: tablesFor(count),
        tokenFor,
        webOrigin: WEB_ORIGIN,
      });
      const pdf = buffer.toString('latin1');
      expect(countMatches(pdf, /\/Type\s*\/Page\b/g), `${count} tables`).toBe(pages);
      expect(countMatches(pdf, /\/Subtype\s*\/Link/g), `${count} tables`).toBe(count);
    }
  });

  it('prints a table’s name once when the label only repeats it', async () => {
    // The seed names every table «Стол N», which is exactly what the heading says now that the
    // heading is Russian, so an unguarded card prints the same words twice. Three shapes at once:
    // the seed’s own label, the same label with the heading’s non-breaking space instead of a
    // plain one, and an empty label - none of them may add a second line.
    for (const label of ['Стол 7', 'Стол\u00a07', '']) {
      const buffer = await renderQrSheet({
        restaurant: { name: 'Little Furnace' },
        tables: [{ id: randomUUID(), number: 7, label, seats: 2, isActive: true }],
        tokenFor,
        webOrigin: WEB_ORIGIN,
      });
      const named = drawnText(buffer).filter((run) => flat(run) === flat(`Стол\u00a07`));
      expect(named, JSON.stringify(label)).toHaveLength(1);
      expect(named[0], JSON.stringify(label)).toBe('Стол\u00a07');
    }
  });

  it('keeps the label when it says something the number does not, and trims one too long for the card', async () => {
    // The guard above must not eat a real name. And a label wider than the card is drawn with
    // `lineBreak: false`, so without `ellipsis` it runs straight through the dashed cut line -
    // «Банкетный зал…» measures 243.5 pt at 10 pt in a 229.6 pt box, and Russian names run longer
    // than the English ones this width was chosen against.
    const long = 'Банкетный зал на втором этаже у панорамного окна с видом на реку';
    const buffer = await renderQrSheet({
      restaurant: { name: 'Little Furnace' },
      tables: [
        { id: randomUUID(), number: 7, label: 'Терраса', seats: 2, isActive: true },
        { id: randomUUID(), number: 8, label: long, seats: 2, isActive: true },
      ],
      tokenFor,
      webOrigin: WEB_ORIGIN,
    });
    const drawn = drawnText(buffer);
    expect(drawn).toContain('Терраса');
    // Joined before the assertion: pdfkit splits an over-long line into more than one run, so a
    // label that overflows the card is still absent from every run read on its own - which is
    // exactly how this defect hides from a test that looks at runs one at a time.
    expect(drawn.join('')).not.toContain(long);
    const trimmed = drawn.find((run) => run.startsWith('Банкетный'));
    expect(trimmed?.endsWith('…')).toBe(true);
    expect(trimmed?.length).toBeLessThan(long.length);
  });

  it('refuses to print at all when the brand face is not there to embed', async () => {
    // Deliberately not a fallback. The built-in faces carry no Cyrillic, so a sheet drawn in one is
    // not a sheet with worse typography - it is six cards of mojibake, glued to six tables, that
    // nobody notices until a guest cannot read one. A deployment missing the file is a packaging
    // fault, and a 500 an admin reports beats a printable that looks fine until it is on paper.
    const signer = vi.fn(tokenFor);
    await expect(
      renderQrSheet({
        restaurant: { name: 'Little Furnace' },
        tables: tablesFor(2),
        tokenFor: signer,
        webOrigin: WEB_ORIGIN,
        brandFontDir: '/nowhere',
      }),
    ).rejects.toThrow(/brand font/i);
    // And nothing is half-done: a token signed for a sheet that is never built is a live code
    // handed out for nothing. This is the invariant `renderQrSheet` claims, so it is pinned.
    expect(signer).not.toHaveBeenCalled();
  });

  it('refuses the same way when the face is there but cannot be parsed', async () => {
    // pdfkit's `registerFont` only records the path - fontkit parses on the first `.font()` - so a
    // truncated or half-copied file used to pass registration and surface later as an anonymous
    // `TypeError: Cannot read properties of undefined (reading 'offsets')` thrown from inside the
    // header, after every token had been signed. Both faces are selected while the file is still
    // able to say which one is broken, which is what this pins.
    const directory = mkdtempSync(join(tmpdir(), 'qr-sheet-corrupt-'));
    for (const face of FACES)
      writeFileSync(join(directory, face), readFileSync(join(BRAND_FONTS, face)).subarray(0, 4096));
    const signer = vi.fn(tokenFor);
    await expect(
      renderQrSheet({
        restaurant: { name: 'Little Furnace' },
        tables: tablesFor(2),
        tokenFor: signer,
        webOrigin: WEB_ORIGIN,
        brandFontDir: directory,
      }),
    ).rejects.toThrow(/brand font/i);
    expect(signer).not.toHaveBeenCalled();
    rmSync(directory, { recursive: true, force: true });
  });

  it('answers a readable one-page sheet when the restaurant has no tables to print', async () => {
    const buffer = await renderQrSheet({
      restaurant: { name: 'Little Furnace' },
      tables: [],
      tokenFor,
      webOrigin: WEB_ORIGIN,
    });
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const pdf = buffer.toString('latin1');
    // A PDF with no pages at all is not a document a viewer will open.
    expect(countMatches(pdf, /\/Type\s*\/Page\b/g)).toBe(1);
    expect(countMatches(pdf, /\/Subtype\s*\/Link/g)).toBe(0);
  });
});
