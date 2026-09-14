import type { Metadata } from 'next';
import { IBM_Plex_Sans, PT_Sans_Narrow } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { CSSProperties, ReactNode } from 'react';
import './globals.css';

// Bricolage Grotesque serves vietnamese, latin-ext and latin only — no Cyrillic — so it cannot
// carry a Russian interface. PT Sans Narrow is drawn from Cyrillic by Paratype and is the face of
// Russian printed forms and timetables, which is the vernacular a printed ticket belongs to.
const display = PT_Sans_Narrow({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '700'],
  variable: '--font-display',
  display: 'swap',
});
const text = IBM_Plex_Sans({
  subsets: ['latin', 'cyrillic'],
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

/**
 * The default title and description for every page that does not set its own — and the ones a
 * link preview quotes. Both are the landing's, from the dictionary: the restaurant's page is
 * titled with the restaurant's name rather than the product's, because TableTap is what the place
 * runs on and the repository is where that is explained (docs/design/02b-copy-ru.md,
 * «Главная страница»). `app/page.tsx` resolves the same two keys for `/` itself.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing.meta');
  const title = t('title');
  const description = t('description');
  return {
    // Guests arrive from a QR code, so every share card and canonical URL has to resolve against
    // the deployed origin rather than whatever host happened to render the page. A relative
    // og:image URL is the classic silent failure in a link preview, and this is what keeps
    // apps/web/app/opengraph-image.tsx's file-based image resolving to an absolute one.
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
    title,
    description,
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <html lang="ru" className={`${display.variable} ${text.variable}`} style={fontVariables}>
      <body className="min-h-dvh">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
