import type { Metadata } from 'next';
import { Bricolage_Grotesque, IBM_Plex_Sans } from 'next/font/google';
import type { CSSProperties, ReactNode } from 'react';
import './globals.css';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const text = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-text',
  display: 'swap',
});

// The font classes and the token :root block have equal specificity, and tokens.css is emitted
// last, so its fallback stack would win on <html>. Inline styles outrank both, which keeps the
// metric-matched fallback face next/font generates and with it the no-shift swap the brand
// guidelines require.
const fontVariables = {
  '--font-display': display.style.fontFamily,
  '--font-text': text.style.fontFamily,
} as CSSProperties;

export const metadata: Metadata = {
  // Guests arrive from a QR code, so every share card and canonical URL has to resolve against
  // the deployed origin rather than whatever host happened to render the page.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: 'TableTap',
  description: 'Order from your table. Kitchen sees it in real time.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`} style={fontVariables}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
