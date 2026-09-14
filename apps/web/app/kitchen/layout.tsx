import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

/**
 * The tab is the one part of this surface a cook reads from another screen, so it is translated
 * with the rest of it. `KitchenBoard` rewrites the same title on the client to carry the new-ticket
 * count, and both forms come from `kitchen.meta` so the two never disagree or flip language
 * between the first paint and hydration.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('kitchen.meta');
  return { title: t('title') };
}

/** The attribute switches the token set (dark) and the type scale; the wrapper paints the ground. */
export default function KitchenLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="kitchen" className="min-h-dvh bg-background text-foreground">
      {children}
    </div>
  );
}
