import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { TableDto } from '@tabletap/shared';
import { qrSheet } from './ru';

/** PostScript points per millimetre: the sheet is specified in millimetres, PDF works in points. */
const MM = 72 / 25.4;
/** A4 portrait, in points. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 36;
const HEADER_HEIGHT = 34;
const COLUMNS = 2;
const ROWS = 3;
const CARDS_PER_PAGE = COLUMNS * ROWS;
/** The printed code itself: 45 mm is comfortably above the ~25 mm a phone camera needs. */
const QR_SIZE = 45 * MM;
/** Rendered at ~290 dpi for the 45 mm it is printed at, so the modules stay crisp on paper. */
const QR_PIXELS = 512;
/**
 * The sheet's ink, as RGB triples. A PDF resolves no CSS, so the design tokens cannot be
 * referenced the way a screen does it; these are the neutral ramp printed on white paper, and
 * they are written as numbers rather than hex because the token check reads a hex literal in
 * `apps/` as a stylesheet colour that escaped the token file.
 */
const INK: Record<'strong' | 'muted' | 'body' | 'rule', [number, number, number]> = {
  strong: [17, 17, 17],
  muted: [107, 107, 107],
  body: [74, 74, 74],
  rule: [216, 216, 216],
};

/**
 * **The brand display face, as TrueType, because a PDF cannot be drawn in anything else here.**
 *
 * pdfkit embeds TTF, OTF, TTC and DFONT and nothing else — not woff, not woff2 — so
 * `@fontsource/pt-sans-narrow`, which ships woff and woff2 only, is of no use to this file and
 * neither is the pair of subsets `apps/web/app` keeps for the Open Graph card. Without a readable
 * TTF pdfkit falls back to Helvetica: `/Type1 /WinAnsiEncoding`, one byte per character, and not
 * one Cyrillic glyph anywhere in it. That fallback is what printed «Стол 7» as `B␔BCä; 7`.
 *
 * These two files are ParaType's PT Sans Narrow, unmodified, as Google Fonts releases it
 * (`google/fonts@main:ofl/ptsansnarrow`), under the SIL Open Font License 1.1 — the licence text
 * is beside them in `pt-sans-narrow-OFL.txt`. The face is the brand's display face for the reason
 * `docs/brand-guidelines.md` gives for choosing it over Bricolage Grotesque: ParaType drew it from
 * Cyrillic, and it is the face of Russian printed forms and timetables. A card on a table that
 * says which table it is, printed and cut, *is* a Russian printed form.
 *
 * The Google release is one file per weight, with latin, latin-ext, cyrillic and cyrillic-ext in
 * each, which is what lets one face set «Стол 7» and «Little Furnace» on the same card. IBM Plex
 * Sans, the brand's body face, is a variable font in the same release and is deliberately not used
 * here: one family covering both scripts at both weights is fewer moving parts on a sheet whose
 * only job is to be legible on paper.
 */
const FACES = {
  regular: 'PT_Sans-Narrow-Web-Regular.ttf',
  bold: 'PT_Sans-Narrow-Web-Bold.ttf',
} as const;

/**
 * Where those two files are, in either layout this module runs in. `tsup` copies `public/` into
 * `dist/`, so the bundle finds them beside itself; `tsx`, `vitest` and `next`-free local runs find
 * them where they are committed. Both candidates are `import.meta.url`-relative string literals,
 * which is also what makes them visible to a file tracer — a path assembled from a variable is not.
 */
const FONT_DIRECTORIES = ['./fonts/', '../../public/fonts/'] as const;

/**
 * Generic in the table so a caller may hand over rows that carry more than the DTO - the route
 * passes the `qr_version` alongside each table, and its signer reads it straight off the row it
 * was given rather than looking the version up again by id.
 */
export interface QrSheetInput<T extends TableDto = TableDto> {
  restaurant: { name: string };
  tables: T[];
  /** Signs one table token; the route passes the same signer the guest link is built from. */
  tokenFor: (table: T) => Promise<string>;
  webOrigin: string;
  /** Overrides the directory the brand faces are read from. Only the tests pass it. */
  brandFontDir?: string;
}

interface SheetFonts {
  regular: string;
  bold: string;
}

/**
 * The two brand faces, or a refusal to draw anything at all.
 *
 * **Deliberately not a fallback.** This used to degrade to Helvetica on the reasoning that a sheet
 * of QR codes is an operational necessity and staff cannot seat a guest without one. That
 * reasoning was measured and found wrong the moment the data went Russian: Helvetica does not
 * degrade the typography here, it replaces every label on the sheet with mojibake, and six cards
 * of mojibake cut out and put on six tables is not a working sheet that looks worse — it is a
 * broken one that nobody notices until a guest is holding it. The file is committed in this
 * repository and copied into the image by the build, so its absence is a packaging fault, and a
 * 500 an admin reports the first time they print beats a download that looks fine until it is on
 * paper.
 */
function brandFaces(override: string | undefined): SheetFonts {
  const directories =
    override === undefined
      ? FONT_DIRECTORIES.map((directory) => fileURLToPath(new URL(directory, import.meta.url)))
      : [override];
  for (const directory of directories) {
    const regular = join(directory, FACES.regular);
    const bold = join(directory, FACES.bold);
    // Both or neither: one weight present and the other missing is a half-packaged image, and a
    // sheet set entirely in bold is not the degradation anyone would have chosen.
    if (existsSync(regular) && existsSync(bold)) return { regular, bold };
  }
  throw new Error(
    `Brand font missing: ${FACES.regular} and ${FACES.bold} are not in any of ${directories.join(', ')}. ` +
      'The QR sheet cannot draw Cyrillic without them and will not print in a face that cannot.',
  );
}

/** Registers both faces on the document under the names the drawing code asks for. */
function registerFonts(doc: PDFKit.PDFDocument, faces: SheetFonts): SheetFonts {
  try {
    doc.registerFont('brand', faces.regular);
    doc.registerFont('brandBold', faces.bold);
  } catch (cause) {
    throw new Error(
      `Brand font unreadable: ${faces.regular} or ${faces.bold} is not a usable TTF.`,
      {
        cause,
      },
    );
  }
  return { regular: 'brand', bold: 'brandBold' };
}

/**
 * Starts collecting the document's bytes. It only subscribes - `doc.end()` stays the caller's, at
 * the point the last card is drawn, because a document ended early rejects every write after it.
 */
function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function drawHeader(doc: PDFKit.PDFDocument, fonts: SheetFonts, name: string, printed: string) {
  doc
    .font(fonts.bold)
    .fontSize(11)
    .fillColor(INK.strong)
    .text(name, MARGIN, MARGIN, {
      width: PAGE.width - 2 * MARGIN,
      align: 'left',
      lineBreak: false,
    });
  doc
    .font(fonts.regular)
    .fontSize(9)
    .fillColor(INK.muted)
    .text(qrSheet.printedOn(printed), MARGIN, MARGIN + 1, {
      width: PAGE.width - 2 * MARGIN,
      align: 'right',
      lineBreak: false,
    });
  doc
    .moveTo(MARGIN, MARGIN + 20)
    .lineTo(PAGE.width - MARGIN, MARGIN + 20)
    .lineWidth(0.5)
    .strokeColor(INK.rule)
    .stroke();
}

/**
 * One card: the number at display size, the label under it, the code, and a line telling a guest
 * what to do with it. The dashed rule is a cut line - the sheet is meant to be cut into cards -
 * and the link annotation over the QR makes the card work on screen as well as on paper, which is
 * also what lets a test read back which addresses the sheet actually printed.
 */
function drawCard(
  doc: PDFKit.PDFDocument,
  fonts: SheetFonts,
  box: { x: number; y: number; width: number; height: number },
  table: TableDto,
  url: string,
  qr: Buffer,
) {
  doc
    .roundedRect(box.x + 4, box.y + 4, box.width - 8, box.height - 8, 6)
    .lineWidth(0.5)
    .strokeColor(INK.rule)
    .dash(3, { space: 3 })
    .stroke()
    .undash();

  const contentWidth = box.width - 32;
  const left = box.x + 16;
  let y = box.y + 20;

  doc
    .font(fonts.bold)
    .fontSize(24)
    .fillColor(INK.strong)
    .text(qrSheet.table(table.number), left, y, { width: contentWidth, align: 'center' });
  y += 30;
  doc
    .font(fonts.regular)
    .fontSize(10)
    .fillColor(INK.muted)
    .text(table.label, left, y, { width: contentWidth, align: 'center', lineBreak: false });
  y += 16;

  const qrX = box.x + (box.width - QR_SIZE) / 2;
  doc.image(qr, qrX, y, { width: QR_SIZE, height: QR_SIZE });
  doc.link(qrX, y, QR_SIZE, QR_SIZE, url);
  y += QR_SIZE + 10;

  doc
    .font(fonts.regular)
    .fontSize(8.5)
    .fillColor(INK.body)
    .text(qrSheet.instruction, left, y, { width: contentWidth, align: 'center' });
}

/**
 * The printable sheet: A4, six cards to a page, one card per table in the order they were given.
 * Tokens are signed by the caller, so this file never touches the token secret, and the QR encodes
 * the same `/t/<token>` address the guest link uses everywhere else.
 */
export async function renderQrSheet<T extends TableDto>(input: QrSheetInput<T>): Promise<Buffer> {
  const { restaurant, tables, tokenFor, webOrigin } = input;
  // Resolved before anything is drawn and before a single token is signed: a sheet that cannot be
  // set in the brand face is not printed at all, so it must not be half-printed either.
  const faces = brandFaces(input.brandFontDir);
  // Signed and rendered before a byte of PDF is written: a card is never half-drawn because a
  // signer rejected, and pdfkit's own API is synchronous once the document is under way.
  const cards = await Promise.all(
    tables.map(async (table) => {
      const url = `${webOrigin}/t/${await tokenFor(table)}`;
      const qr = await QRCode.toBuffer(url, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: QR_PIXELS,
      });
      return { table, url, qr };
    }),
  );

  const doc = new PDFDocument({
    size: 'A4',
    autoFirstPage: false,
    // Zero margins: every position on this sheet is computed, and a non-zero bottom margin would
    // let a line of text at the foot of the last card add a page pdfkit alone decided to add.
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    info: { Title: qrSheet.title(restaurant.name), Author: 'TableTap' },
  });
  const collected = collect(doc);
  const fonts = registerFonts(doc, faces);
  const printed = new Date().toISOString().slice(0, 10);

  const gridTop = MARGIN + HEADER_HEIGHT;
  const cardWidth = (PAGE.width - 2 * MARGIN) / COLUMNS;
  const cardHeight = (PAGE.height - MARGIN - gridTop) / ROWS;
  const pages = Math.max(1, Math.ceil(cards.length / CARDS_PER_PAGE));

  for (let page = 0; page < pages; page += 1) {
    doc.addPage();
    drawHeader(doc, fonts, restaurant.name, printed);
    const onThisPage = cards.slice(page * CARDS_PER_PAGE, (page + 1) * CARDS_PER_PAGE);
    if (onThisPage.length === 0) {
      // No tables to print at all. A PDF with no page is not a document a viewer will open, and an
      // empty one that says why beats a download that appears to have failed.
      doc
        .font(fonts.regular)
        .fontSize(11)
        .fillColor(INK.body)
        .text(qrSheet.nothingToPrint, MARGIN, gridTop + 20, {
          width: PAGE.width - 2 * MARGIN,
          align: 'center',
        });
      continue;
    }
    onThisPage.forEach((card, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      drawCard(
        doc,
        fonts,
        {
          x: MARGIN + column * cardWidth,
          y: gridTop + row * cardHeight,
          width: cardWidth,
          height: cardHeight,
        },
        card.table,
        card.url,
        card.qr,
      );
    });
  }

  doc.end();
  return collected;
}
