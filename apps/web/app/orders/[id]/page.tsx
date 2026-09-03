import { OrderResponseSchema, type OrderDto } from '@tabletap/shared';
import { notFound, redirect } from 'next/navigation';
import { OrderLive } from '../../../components/order/order-live';
import { ApiError, apiFetch } from '../../../lib/api';
import { guestCookie } from '../../../lib/guest-cookie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your order · Little Furnace' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = await guestCookie();
  if (!cookie) redirect('/session-ended');
  let order: OrderDto;
  try {
    ({ order } = await apiFetch(`/api/orders/${id}`, { schema: OrderResponseSchema, cookie }));
  } catch (err) {
    // Someone else's order and an order that never existed are the same page on purpose: a
    // 403 that reads differently from a 404 tells a stranger which ids are real.
    if (err instanceof ApiError && err.status === 401) redirect('/session-ended');
    if (err instanceof ApiError && (err.status === 403 || err.status === 404 || err.status === 400))
      notFound();
    throw err;
  }
  // The order DTO carries no currency and M2 has one restaurant, priced in USD. M5 adds the
  // currency to the DTO; until then the guest surface must not invent one per page.
  return <OrderLive initial={order} currency="USD" />;
}
