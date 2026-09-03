import { MeResponseSchema, MenuResponseSchema, type MenuResponse } from '@tabletap/shared';
import { redirect } from 'next/navigation';
import { MenuScreen } from '../../components/menu/menu-screen';
import { ApiError, apiFetch } from '../../lib/api';
import { guestCookie } from '../../lib/guest-cookie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Menu · Little Furnace' };

interface GuestMenu {
  menu: MenuResponse;
  tableId: string;
  tableNumber: number;
}

/**
 * `null` means "this guest has no session any more" — an expired cookie, a demo reset, or a
 * principal that is not a guest. Anything else is a real failure and is rethrown, which is also
 * why the redirects live in the caller: `redirect()` works by throwing, and a `catch` that
 * swallowed it would leave the page rendering with no data.
 */
async function loadGuestMenu(cookie: string): Promise<GuestMenu | null> {
  try {
    const [me, menu] = await Promise.all([
      apiFetch('/api/me', { schema: MeResponseSchema, cookie }),
      apiFetch('/api/menu', { schema: MenuResponseSchema, cookie }),
    ]);
    if (me.principal.kind !== 'guest') return null;
    return { menu, tableId: me.principal.tableId, tableNumber: me.principal.tableNumber };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export default async function MenuPage() {
  const cookie = await guestCookie();
  if (!cookie) redirect('/session-ended');
  const guest = await loadGuestMenu(cookie);
  if (guest === null) redirect('/session-ended');
  return <MenuScreen menu={guest.menu} tableId={guest.tableId} tableNumber={guest.tableNumber} />;
}
