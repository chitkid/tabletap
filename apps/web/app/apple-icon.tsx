import { ImageResponse } from 'next/og';
import designTokens from '../../../assets/design-tokens.json';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// The same source of truth packages/ui/tokens.css generates from (see
// packages/ui/src/tokens.test.ts, which reads this file the same way). An apple
// touch icon is a flat, opaque PNG with no page around it to inherit a CSS variable
// from, so the colours are read here as literal values rather than written as
// `var(--...)` — the same reason `apps/web/app/icon.svg` resolves them to literals.
// Not a hardcoded hex: change the token and this icon regenerates with it.
const FIELD = designTokens.primitive.color.ember['500'].$value; // --primary, light theme
const MARK = designTokens.primitive.color.oat.surface.$value; // --primary-foreground, light theme

/**
 * The mark on an ember field: TableTap's app icon. Ring and dot both use the same
 * light tone here — on a field that is itself the ember the dot is normally drawn
 * in (packages/ui/src/components/mark.tsx), the dot needs a different colour from
 * the field to read at all. No text, so no font is needed here.
 */
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: FIELD,
      }}
    >
      <svg width={120} height={120} viewBox="0 0 64 64">
        <circle
          cx={32}
          cy={32}
          r={22}
          fill="none"
          stroke={MARK}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray="110 28"
          transform="rotate(28 32 32)"
        />
        <circle cx={32} cy={32} r={8.5} fill={MARK} />
      </svg>
    </div>,
    { ...size },
  );
}
