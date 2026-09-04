import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { TableDto } from '@tabletap/shared';

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
const INSTRUCTION = 'Scan with your phone camera to see the menu and order.';
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
 * The brand text face, embedded only if a real TTF is on disk. `@fontsource/ibm-plex-sans` ships
 * woff and woff2 only, neither of which pdfkit can embed, so today this finds nothing and the
 * sheet prints in Helvetica; dropping a TTF in under one of these names is all it takes to switch.
 */
const BRAND_FONT_FILES = [
  '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.ttf',
  '@fontsource/ibm-plex-sans/files/ibm-plex-sans-all-400-normal.ttf',
];

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
  /**
   * Overrides the brand font lookup. `null` forces the built-in face; a path that is not there is
   * treated as absent rather than as a failure, which is what the sheet needs on a machine with
   * no font package installed.
   */
  brandFontPath?: string | null;
}

interface SheetFonts {
  regular: string;
  bold: string;
}

/** The brand TTF's path, or null when no readable one is installed. */
function resolveBrandFont(): string | null {
  const require = createRequire(import.meta.url);
  for (const spec of BRAND_FONT_FILES) {
    try {
      const path = require.resolve(spec);
      if (existsSync(path)) return path;
    } catch {
      // Not installed: try the next name, then fall back to the built-in face.
    }
  }
  return null;
}

/**
 * Registers the brand face when one is genuinely readable, and answers the built-in Helvetica pair
 * otherwise. A sheet of QR codes is an operational necessity - staff cannot seat a guest without
 * it - so a missing or unreadable font degrades the typography and never the printing.
 */
function chooseFonts(doc: PDFKit.PDFDocument, path: string | null): SheetFonts {
  const fallback: SheetFonts = { regular: 'Helvetica', bold: 'Helvetica-Bold' };
  if (path === null || !existsSync(path)) return fallback;
  try {
    doc.registerFont('brand', path);
    // One weight is all a font file gives us; the display sizes carry the hierarchy instead.
    return { regular: 'brand', bold: 'brand' };
  } catch {
    return fallback;
  }
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
    .text(`Table QR codes - printed ${printed}`, MARGIN, MARGIN + 1, {
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
    .text(`Table ${table.number}`, left, y, { width: contentWidth, align: 'center' });
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
    .text(INSTRUCTION, left, y, { width: contentWidth, align: 'center' });
}

/**
 * The printable sheet: A4, six cards to a page, one card per table in the order they were given.
 * Tokens are signed by the caller, so this file never touches the token secret, and the QR encodes
 * the same `/t/<token>` address the guest link uses everywhere else.
 */
export async function renderQrSheet<T extends TableDto>(input: QrSheetInput<T>): Promise<Buffer> {
  const { restaurant, tables, tokenFor, webOrigin } = input;
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
    info: { Title: `${restaurant.name} - table QR codes`, Author: 'TableTap' },
  });
  const collected = collect(doc);
  const fonts = chooseFonts(
    doc,
    input.brandFontPath === undefined ? resolveBrandFont() : input.brandFontPath,
  );
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
        .text(
          'No active tables to print. Add a table, or reactivate one, then print this sheet again.',
          MARGIN,
          gridTop + 20,
          { width: PAGE.width - 2 * MARGIN, align: 'center' },
        );
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
