import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ClaimTable } from '../../../components/claim-table';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guest.meta');
  return { title: t('table') };
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClaimTable token={token} />;
}
