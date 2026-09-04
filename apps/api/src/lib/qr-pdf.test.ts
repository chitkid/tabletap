import { randomUUID } from 'node:crypto';
import type { TableDto } from '@tabletap/shared';
import { describe, expect, it, vi } from 'vitest';
import { renderQrSheet } from './qr-pdf';

const WEB_ORIGIN = 'http://localhost:3000';

function tablesFor(count: number): TableDto[] {
  return Array.from({ length: count }, (_, i) => ({
    id: randomUUID(),
    number: i + 1,
    label: `Table ${i + 1}`,
    seats: 2,
    isActive: true,
  }));
}

/** A stand-in for the signer: the route hands `renderQrSheet` a real signed table token. */
const tokenFor = (table: TableDto) => Promise.resolve(`token-for-table-${table.number}`);

function countMatches(pdf: string, pattern: RegExp): number {
  return pdf.match(pattern)?.length ?? 0;
}

/**
 * The PDF is read as latin1 because a PDF body is bytes, not text: dictionaries (the page and
 * annotation objects these assertions read) are plain ASCII, while the image and content streams
 * around them are binary. Every assertion here is structural for that reason - counting the cards
 * and the pages the layout promised. A byte comparison against a stored file would only prove
 * pdfkit is deterministic.
 */
describe('renderQrSheet', () => {
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

  it('renders with the fallback face when the brand font file is absent', async () => {
    // The brand face is embedded only when a TTF is actually there to read; a deployment without
    // one still has to print its QR codes, so an absent file is a fallback, never a failure.
    const buffer = await renderQrSheet({
      restaurant: { name: 'Little Furnace' },
      tables: tablesFor(2),
      tokenFor,
      webOrigin: WEB_ORIGIN,
      brandFontPath: '/nowhere/ibm-plex-sans-latin-400-normal.ttf',
    });
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(countMatches(buffer.toString('latin1'), /\/Subtype\s*\/Link/g)).toBe(2);
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
