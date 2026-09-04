import {
  DashboardResponseSchema,
  MenuResponseSchema,
  type DashboardResponse,
} from '@tabletap/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardTiles } from '../../../components/admin/dashboard-tiles';
import { WeekBars } from '../../../components/admin/week-bars';
import { ApiError, apiFetch } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard · TableTap' };

export default async function AdminDashboardPage() {
  const jar = (await cookies()).toString();
  const withJar = { init: { headers: { cookie: jar } } };
  let dashboard: DashboardResponse;
  let currency: string;
  try {
    // The revenue tile needs the currency the restaurant actually charges in, and the currency
    // travels on the menu rather than on a route of its own — the same extra read the layout makes
    // for the restaurant's name. A `GET /api/restaurant` would retire both; until then this is the
    // honest way to render money, and a hardcoded 'USD' is not.
    const [today, menu] = await Promise.all([
      apiFetch('/api/dashboard', { schema: DashboardResponseSchema, ...withJar }),
      apiFetch('/api/menu', { schema: MenuResponseSchema, ...withJar }),
    ]);
    dashboard = today;
    currency = menu.restaurant.currency;
  } catch (err) {
    // The layout redirects a caller who has no business here, but a page renders alongside its
    // layout rather than after it, so this one answers the same refusal the same way.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403))
      redirect('/login?next=/admin');
    throw err;
  }
  return (
    <div className="flex flex-col gap-8">
      <DashboardTiles today={dashboard.today} currency={currency} />
      <WeekBars week={dashboard.week} />
    </div>
  );
}
