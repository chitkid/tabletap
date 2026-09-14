import { readFile } from 'node:fs/promises';
import { ImageResponse } from 'next/og';
import designTokens from '../../../assets/design-tokens.json';
import ru from '../messages/ru.json';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The same source of truth packages/ui/tokens.css generates from (see
// packages/ui/src/tokens.test.ts, which reads this file the same way). A link-preview
// card is a flat, opaque PNG with no page around it to inherit a CSS variable from, so
// the colours are read here as literal values rather than written as `var(--...)` — the
// same reason apps/web/app/icon.svg and apps/web/app/apple-icon.tsx resolve them to
// literals. Not a hardcoded hex: change the token and this card regenerates with it.
const INK = designTokens.primitive.color.ink['500'].$value; // --foreground, guest surface / kitchen ground
// This card's ground is the kitchen-dark surface, not the guest one, so it reads the
// dark-theme primitives rather than the guest-theme ones of the same name: ember.500
// (#C23E18, ~3.3:1 on ink) is the guest accent, while ember.100 (#F0663D, ~5.7:1 on
// ink) is the dedicated dark-surface ember the design system already split out for
// exactly this ground. night.fg is the dark-surface foreground/text token — distinct
// from oat.bg even though both are #F6F1E8 today, because they are independently
// adjustable and this card should track the one that actually names this surface.
const EMBER_ON_DARK = designTokens.primitive.color.ember['100'].$value; // dark-surface --primary
const NIGHT_FG = designTokens.primitive.color.night.fg.$value; // dark-surface --foreground / kitchen text

// The restaurant's name titles the restaurant's card, for the reason
// docs/design/02b-copy-ru.md gives for the page title: TableTap is what the place runs
// on, and the repository is where that is explained. The line under it is the same
// sentence <meta name="description"> makes, which is the relationship this card has
// always had — read from the dictionary rather than retyped, so the card cannot drift
// from the page the way a second copy of a sentence always eventually does.
const TITLE = ru.landing.brand;
const TAGLINE = ru.landing.meta.description;

// The two halves of what is drawn, in the order they are drawn. Nothing else on the
// card is text, so this is also the exhaustive list of characters the fonts below have
// to cover — which is what opengraph-image.test.tsx checks, through this very export.
export const alt = `${TITLE} — ${TAGLINE}`;

// Satori keys registered fonts by family name and picks ONE per name/weight/style, so
// two files under one name silently lose the second (verified: registering both subsets
// as "PT Sans Narrow" drew the Russian correctly and the Latin brand name in the
// bundled fallback face). Per-character fallback, on the other hand, searches every
// registered family — so the two subsets are registered under two names, and the Latin
// one is reached by the cascade rather than by being asked for.
const FAMILY = 'PT Sans Narrow';
const FAMILY_LATIN = 'PT Sans Narrow Latin';

/**
 * The link-preview card: what a pasted TableTap URL shows in a chat or a social post,
 * so it is effectively the first thing anyone sees of this project. `ImageResponse`
 * renders through Satori, which supports only a subset of CSS — no `currentColor`
 * inheritance — so the mark is redrawn here as literal geometry rather than imported
 * from `packages/ui/src/components/mark.tsx`. Ring: the dark-surface foreground
 * (`night.fg`) the mark's `currentColor` resolves to on this kitchen-dark ground, per
 * docs/brand-guidelines.md §3, "Where it appears: kitchen and admin chrome"). Dot: the
 * dark-surface ember (`ember.100`), the same accent the mark wears everywhere else on
 * a dark ground.
 *
 * Satori needs a real font file (ttf, otf or woff — not woff2, which
 * next/font/google only ever hands back), and it must be the display face the rest of
 * the product uses: PT Sans Narrow, which replaced Bricolage Grotesque when this app
 * went Russian, because Bricolage serves vietnamese, latin-ext and latin and no
 * Cyrillic in any subset — see apps/web/app/layout.tsx and docs/brand-guidelines.md §2.
 * `@fontsource/pt-sans-narrow` ships no combined file — only one `.woff` per Google
 * subset — and the cyrillic subset is U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1
 * and U+2116 and nothing else: on its own it cannot draw "Little Furnace", a full stop
 * or a comma. So **both** the cyrillic and the latin subset are copied next to this
 * file (SIL Open Font License, see ./pt-sans-narrow-LICENSE.txt) and both are
 * registered below. Missing either one does not fail: Satori falls back to the face
 * `next/og` bundles, and the card renders 200 in a typeface that is not the brand's.
 * Between them the two cover Latin-1, general punctuation and Russian — but not, for
 * one example, the rouble sign, which Google puts in latin-ext. A card that ever draws
 * a price needs that third file copied in beside these two, and
 * opengraph-image.test.tsx is what will say so.
 *
 * They are copied rather than read out of node_modules at runtime, because a
 * standalone Next build traces its files and a path assembled at runtime into
 * node_modules is exactly the read the tracer misses.
 *
 * The fonts are loaded with `fs.readFile`, not the `fetch(new URL(...))` form Next's
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
 * objects natively since Node 10. Keep the two `new URL` arguments string literals
 * for the same reason: a path built from a variable is invisible to the tracer.
 */
export default async function OpengraphImage() {
  const [cyrillic, latin] = await Promise.all([
    readFile(new URL('./pt-sans-narrow-cyrillic-700-normal.woff', import.meta.url)),
    readFile(new URL('./pt-sans-narrow-latin-700-normal.woff', import.meta.url)),
  ]);
  // `readFile` returns a Node `Buffer` — a `Uint8Array` view, not the `ArrayBuffer` the
  // `fonts` option below is typed for. Copying through `Uint8Array` gives a fresh
  // buffer starting at offset 0, which is always a plain ArrayBuffer.
  const cyrillicData = new Uint8Array(cyrillic).buffer;
  const latinData = new Uint8Array(latin).buffer;

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
        fontFamily: FAMILY,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <svg width={96} height={96} viewBox="0 0 64 64">
          <circle
            cx={32}
            cy={32}
            r={22}
            fill="none"
            stroke={NIGHT_FG}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray="110 28"
            transform="rotate(28 32 32)"
          />
          <circle cx={32} cy={32} r={8.5} fill={EMBER_ON_DARK} />
        </svg>
        <div
          style={{
            display: 'flex',
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: NIGHT_FG,
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
          color: NIGHT_FG,
        }}
      >
        {TAGLINE}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: FAMILY, data: cyrillicData, weight: 700, style: 'normal' },
        { name: FAMILY_LATIN, data: latinData, weight: 700, style: 'normal' },
      ],
    },
  );
}
