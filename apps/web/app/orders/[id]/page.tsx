import { OrderResponseSchema, type OrderDto } from '@tabletap/shared';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { OrderLive } from '../../../components/order/order-live';
import { ApiError, apiFetch } from '../../../lib/api';
import { guestCookie } from '../../../lib/guest-cookie';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guest.meta');
  return { title: t('order') };
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;
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
  // `paid` says which way the guest came back from the payment page, and nothing more: the
  // status on screen is still the order's own. Any other value is treated as no claim at all.
  const paidStatus = paid === '1' ? 'received' : paid === '0' ? 'declined' : undefined;
  return <OrderLive initial={order} currency={order.currency} paidStatus={paidStatus} />;
}
