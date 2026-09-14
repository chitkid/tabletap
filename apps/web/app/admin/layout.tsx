import { MeResponseSchema, MenuResponseSchema, type Principal } from '@tabletap/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/shell';
import { ApiError, apiFetch } from '../../lib/api';
import { adminAccess } from './access';

export const dynamic = 'force-dynamic';

/**
 * The tab is part of the surface: translating only what is inside the page would leave an operator
 * with three Russian screens behind three English tabs. `X · Little Furnace` is the shape the guest
 * and kitchen `meta` keys established, and the product's name leaving the tab follows the ruling
 * that took it off the landing — a restaurant's page is titled with the restaurant's name.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.meta'))('admin') };
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The staff session cookie is better-auth's, not tt_guest: forward the whole jar verbatim.
  const jar = (await cookies()).toString();
  const withJar = { init: { headers: { cookie: jar } } };
  let principal: Principal;
  try {
    ({ principal } = await apiFetch('/api/me', { schema: MeResponseSchema, ...withJar }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login?next=/admin');
    throw err;
  }
  const access = adminAccess(principal);
  if (!access.allowed) redirect(access.redirectTo);
  // The restaurant's name travels on the menu rather than on the principal, so the top bar has to
  // ask for it. One extra read per admin request; a dedicated restaurant route would remove it.
  //
  // Guarded, unlike the `/api/me` call above, which decides whether this operator may be here at
  // all. This one decides one line of chrome, and it wraps all three admin screens: letting it
  // throw would take the whole surface to the error boundary over a name. A blank top bar is the
  // honest fallback - the sidebar still says TableTap, and inventing a name would be worse.
  let restaurantName = '';
  try {
    const { restaurant } = await apiFetch('/api/menu', { schema: MenuResponseSchema, ...withJar });
    restaurantName = restaurant.name;
  } catch (err) {
    console.warn('admin top bar has no restaurant name:', err instanceof Error ? err.message : err);
  }

  return (
    // The attribute switches the admin token set. It deliberately does not scale `--spacing`:
    // a blanket multiplier shrinks the controls along with the gaps between them.
    <div data-surface="admin" className="min-h-dvh bg-background text-foreground">
      <AdminShell restaurantName={restaurantName} staffName={access.staff.name}>
        {children}
      </AdminShell>
    </div>
  );
}
