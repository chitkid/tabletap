import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LandingContent } from '../components/landing/landing-content';
import { loadDemoLinks } from '../lib/demo-links';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  // The restaurant's name titles the restaurant's page - docs/design/02b-copy-ru.md. The product's
  // name is what the place runs on and belongs in the repository, not in a browser tab.
  const t = await getTranslations('landing.meta');
  return { title: t('title'), description: t('description') };
}

export default async function LandingPage() {
  // The landing is the one surface that acts on *why* the links are missing: demo mode being off
  // is a page with no way in and nothing to explain, and anything else is worth saying out loud.
  const { links, notice } = await loadDemoLinks();
  return <LandingContent links={links} notice={notice} />;
}
