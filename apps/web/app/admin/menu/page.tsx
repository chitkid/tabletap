import { MenuResponseSchema, type MenuResponse } from '@tabletap/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { MenuTable } from '../../../components/admin/menu-table';
import { ApiError, apiFetch } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.meta'))('menu') };
}

export default async function AdminMenuPage() {
  const jar = (await cookies()).toString();
  let menu: MenuResponse;
  try {
    menu = await apiFetch('/api/menu', {
      schema: MenuResponseSchema,
      init: { headers: { cookie: jar } },
    });
  } catch (err) {
    // The layout redirects a caller who has no business here, but a page renders alongside its
    // layout rather than after it, so this one answers the same refusal the same way.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403))
      redirect('/login?next=/admin');
    throw err;
  }
  return <MenuTable initial={menu} />;
}
