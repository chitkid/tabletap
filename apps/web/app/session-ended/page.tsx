import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guest.meta');
  return { title: t('sessionEnded') };
}

/**
 * The guest's claim on the table has run out.
 *
 * It says so without naming the thing that ran out. The terminology table's «смена» is a staff
 * shift and «сессия» is the word it rules against, and neither is what a diner has at a table —
 * so the page states the fact and hands back the one action that mends it, in the same words the
 * cleared receipt uses.
 */
export default async function SessionEndedPage() {
  const t = await getTranslations('guest.sessionEnded');
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
