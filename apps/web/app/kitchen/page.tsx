import { MeResponseSchema, OrdersResponseSchema, type Principal } from '@tabletap/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { KitchenBoard } from '../../components/kitchen/kitchen-board';
import { ApiError, apiFetch } from '../../lib/api';
import { fetchDemoLinks } from '../../lib/demo-links';

export const dynamic = 'force-dynamic';

export default async function KitchenPage() {
  // The staff session cookie is better-auth's, not tt_guest: forward the whole jar verbatim.
  const jar = (await cookies()).toString();
  const withJar = { init: { headers: { cookie: jar } } };
  let principal: Principal;
  try {
    ({ principal } = await apiFetch('/api/me', { schema: MeResponseSchema, ...withJar }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect('/login?next=/kitchen');
    throw err;
  }
  if (principal.kind !== 'staff') redirect('/');
  const [{ orders }, links] = await Promise.all([
    apiFetch('/api/orders?active=1', { schema: OrdersResponseSchema, ...withJar }),
    fetchDemoLinks(),
  ]);
  // The API answered a moment ago, so this clock is the kitchen's within a request's latency:
  // close enough for the first paint, and replaced by the socket's own `serverTime` on connect.
  // The purity rule guards against a component that re-renders to a different answer; this one
  // is `force-dynamic` and runs once per request on the server, where the clock is the point.
  // eslint-disable-next-line react-hooks/purity -- rendered once per request; the time is the data
  const serverNow = Date.now();
  return (
    <KitchenBoard
      initialOrders={orders}
      staffName={principal.name}
      serverNow={serverNow}
      demoMode={links !== null}
    />
  );
}
