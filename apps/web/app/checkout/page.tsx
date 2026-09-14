import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { CheckoutScreen } from '../../components/checkout/checkout-screen';
import { guestCookie } from '../../lib/guest-cookie';
import { loadGuestMenu } from '../../lib/guest-menu';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guest.meta');
  return { title: t('checkout') };
}

/**
 * The basket lives in the browser, but its prices do not: the menu is fetched again here so the
 * total a guest confirms is the one the server will charge, not the one their tab was opened on.
 */
export default async function CheckoutPage() {
  const cookie = await guestCookie();
  if (!cookie) redirect('/session-ended');
  const guest = await loadGuestMenu(cookie);
  if (guest === null) redirect('/session-ended');
  return <CheckoutScreen menu={guest.menu} tableId={guest.tableId} />;
}
