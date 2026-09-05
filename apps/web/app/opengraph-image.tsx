import { readFile } from 'node:fs/promises';
import { ImageResponse } from 'next/og';
import designTokens from '../../../assets/design-tokens.json';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'TableTap — Order from your table. The kitchen sees it in real time.';

// The same source of truth packages/ui/tokens.css generates from (see
// packages/ui/src/tokens.test.ts, which reads this file the same way). A link-preview
// card is a flat, opaque PNG with no page around it to inherit a CSS variable from, so
// the colours are read here as literal values rather than written as `var(--...)` — the
// same reason apps/web/app/icon.svg and apps/web/app/apple-icon.tsx resolve them to
// literals. Not a hardcoded hex: change the token and this card regenerates with it.
const INK = designTokens.primitive.color.ink['500'].$value; // --foreground, guest surface / kitchen ground
const EMBER = designTokens.primitive.color.ember['500'].$value; // --primary
const OAT = designTokens.primitive.color.oat.bg.$value; // --background, guest surface; also kitchen text

const TITLE = 'TableTap';
const TAGLINE = 'Order from your table. The kitchen sees it in real time.';

/**
 * The link-preview card: what a pasted TableTap URL shows in a chat or a social post,
 * so it is effectively the first thing anyone sees of this project. `ImageResponse`
 * renders through Satori, which supports only a subset of CSS — no `currentColor`
 * inheritance — so the mark is redrawn here as literal geometry rather than imported
 * from `packages/ui/src/components/mark.tsx`. Ring: Oat (the kitchen-chrome text
 * colour the mark's `currentColor` resolves to on this dark ground, per
 * docs/brand-guidelines.md §3, "Where it appears: kitchen and admin chrome"). Dot:
 * Ember, same as everywhere else the mark is drawn.
 *
 * Satori needs a real font file (ttf, otf or woff — not woff2, which
 * next/font/google only ever hands back). The single weight this card needs —
 * Bricolage Grotesque 700 — ships as a `.woff` in `@fontsource/bricolage-grotesque`,
 * copied next to this file and licensed under the SIL Open Font License (see
 * ./bricolage-grotesque-LICENSE.txt) rather than read out of node_modules at
 * runtime, because a standalone Next build traces its files and a path assembled at
 * runtime into node_modules is exactly the read the tracer misses.
 *
 * The font is loaded with `fs.readFile`, not the `fetch(new URL(...))` form Next's
 * own docs show. That form is what actually failed here: Node 24's native `fetch`
 * has no `file:` scheme support (reproduces standalone — `fetch(new
 * URL('file:///...'))` throws "not implemented... yet..." outside Next entirely),
 * and this repo's bundler is Turbopack, the real default for both `next dev` and
 * `next build` on Next 16.3.4 — confirmed by running an actual production build,
 * which fails this exact way — so there is no webpack asset-URL rewrite turning the
 * expression into an HTTP-fetchable path either. `fs.readFile` takes the identical
 * `new URL('./file', import.meta.url)` expression, which is what Next's standalone
 * file tracer (`@vercel/nft`) statically recognises — the fetch call was never
 * what made the file traceable — and Node's `fs` module has read `file:` URL
 * objects natively since Node 10. Same file, same weight, same subset: this
 * changes only which built-in Node API turns the path into bytes.
 */
export default async function OpengraphImage() {
  const fontFile = await readFile(
    new URL('./bricolage-grotesque-latin-700-normal.woff', import.meta.url),
  );
  // `readFile` returns a Node `Buffer` — a `Uint8Array` view, not the `ArrayBuffer` the
  // `fonts` option below is typed for. Copying through `Uint8Array` gives a fresh
  // buffer starting at offset 0, which is always a plain ArrayBuffer.
  const fontData = new Uint8Array(fontFile).buffer;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: INK,
        paddingLeft: 96,
        paddingRight: 96,
        fontFamily: 'Bricolage Grotesque',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <svg width={96} height={96} viewBox="0 0 64 64">
          <circle
            cx={32}
            cy={32}
            r={22}
            fill="none"
            stroke={OAT}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray="110 28"
            transform="rotate(28 32 32)"
          />
          <circle cx={32} cy={32} r={8.5} fill={EMBER} />
        </svg>
        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: OAT,
          }}
        >
          {TITLE}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 36,
          fontSize: 32,
          fontWeight: 700,
          color: OAT,
        }}
      >
        {TAGLINE}
      </div>
    </div>,
    {
      ...size,
      fonts: [{ name: 'Bricolage Grotesque', data: fontData, weight: 700, style: 'normal' }],
    },
  );
}
