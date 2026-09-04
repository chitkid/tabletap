import { MeResponseSchema, MenuResponseSchema, type Principal } from '@tabletap/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AdminShell } from '../../components/admin/shell';
import { ApiError, apiFetch } from '../../lib/api';
import { adminAccess } from './access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · TableTap' };

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
  const { restaurant } = await apiFetch('/api/menu', { schema: MenuResponseSchema, ...withJar });

  return (
    // The attribute switches the admin token set. It deliberately does not scale `--spacing`:
    // a blanket multiplier shrinks the controls along with the gaps between them.
    <div data-surface="admin" className="min-h-dvh bg-background text-foreground">
      <AdminShell restaurantName={restaurant.name} staffName={access.staff.name}>
        {children}
      </AdminShell>
    </div>
  );
}
