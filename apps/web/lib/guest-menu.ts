import { MeResponseSchema, MenuResponseSchema, type MenuResponse } from '@tabletap/shared';
import { ApiError, apiFetch } from './api';

export interface GuestMenu {
  menu: MenuResponse;
  tableId: string;
  tableNumber: number;
}

/**
 * The two guest pages that need a menu — the menu itself and the checkout that prices a basket
 * against it — ask the same two questions in the same breath, so they ask them here.
 *
 * `null` means "this guest has no session any more" — an expired cookie, a demo reset, or a
 * principal that is not a guest. Anything else is a real failure and is rethrown, which is also
 * why the redirects stay in the pages: `redirect()` works by throwing, and a `catch` that
 * swallowed it would leave the page rendering with no data.
 */
export async function loadGuestMenu(cookie: string): Promise<GuestMenu | null> {
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
