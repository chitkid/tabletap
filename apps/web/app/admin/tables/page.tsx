import { TablesResponseSchema, type TableDto } from '@tabletap/shared';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { TablesTable } from '../../../components/admin/tables-table';
import { ApiError, apiFetch } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.meta'))('tables') };
}

export default async function AdminTablesPage() {
  const jar = (await cookies()).toString();
  let tables: TableDto[];
  try {
    ({ tables } = await apiFetch('/api/tables', {
      schema: TablesResponseSchema,
      init: { headers: { cookie: jar } },
    }));
  } catch (err) {
    // The layout redirects a caller who has no business here, but a page renders alongside its
    // layout rather than after it, so this one answers the same refusal the same way.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403))
      redirect('/login?next=/admin');
    throw err;
  }
  return <TablesTable initial={tables} />;
}
