import { redirect } from 'next/navigation';
import { Entrance } from '../../components/entrance';
import { MenuScreen } from '../../components/menu/menu-screen';
import { guestCookie } from '../../lib/guest-cookie';
import { loadGuestMenu } from '../../lib/guest-menu';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Menu · Little Furnace' };

export default async function MenuPage() {
  const cookie = await guestCookie();
  if (!cookie) redirect('/session-ended');
  const guest = await loadGuestMenu(cookie);
  if (guest === null) redirect('/session-ended');
  // The sections of the menu arrive one after another on the first paint of this route, and not
  // when a guest comes back to it from the basket — see components/entrance.tsx.
  return (
    <Entrance route="menu">
      <MenuScreen menu={guest.menu} tableId={guest.tableId} tableNumber={guest.tableNumber} />
    </Entrance>
  );
}
