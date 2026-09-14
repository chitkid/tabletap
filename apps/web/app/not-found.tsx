import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/**
 * Every URL the app does not have — a mistyped table token, a bookmarked order from last week, a
 * link someone retyped by hand.
 *
 * It says what happened and hands back the one action there is, in the shape /session-ended uses,
 * and it does not apologise: docs/design/02b-copy-ru.md's editorial rules. No `generateMetadata`,
 * because Next ignores a metadata export from `not-found.tsx` — the tab keeps the site title the
 * root layout sets.
 */
export default async function NotFound() {
  const t = await getTranslations('common.notFound');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="font-display text-3xl font-semibold">{t('heading')}</h1>
      <p>{t('text')}</p>
      <Link href="/" className="underline underline-offset-4">
        {t('home')}
      </Link>
    </main>
  );
}
