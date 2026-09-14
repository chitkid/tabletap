'use client';
import { useTranslations } from 'next-intl';

/**
 * The cold start, said out loud.
 *
 * Every block reserves the height the real thing will take, so the menu does not jump when it
 * arrives — the wrapper is the menu screen's own box, and `app/menu/loading.test.tsx` compares the
 * two class lists so they cannot drift apart. No shimmer and no pulse: motion is an M6 deliverable.
 *
 * The line replaces the heading's grey block rather than sitting above it: `h-9` is the line box
 * of the `text-3xl` h1 that lands there, so the words cost the page no height at all. The landing
 * used to warn about the cold start in advance; this is where that warning went — a loading state
 * that reserves its space and does not pretend to be instant.
 *
 * A Client Component on purpose. A Suspense fallback must not itself suspend, and next-intl's
 * Server Component hook reads the request config through `use()`; the provider in the root layout
 * has the messages here already.
 */
export default function MenuLoading() {
  const t = useTranslations('guest.menu');
  return (
    <div role="status" className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-28">
      <p className="flex h-9 items-center text-muted-foreground">{t('loading')}</p>
      <div className="h-11 w-full animate-none rounded-full bg-muted" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="min-h-32 animate-none rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
