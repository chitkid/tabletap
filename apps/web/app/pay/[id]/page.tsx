import { OrderResponseSchema, type OrderDto } from '@tabletap/shared';
import { notFound, redirect } from 'next/navigation';
import { DemoTerminal } from '../../../components/pay/demo-terminal';
import { ApiError, apiFetch } from '../../../lib/api';
import { guestCookie } from '../../../lib/guest-cookie';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay for your order · Little Furnace' };

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookie = await guestCookie();
  if (!cookie) redirect('/session-ended');
  let order: OrderDto;
  try {
    ({ order } = await apiFetch(`/api/orders/${id}`, { schema: OrderResponseSchema, cookie }));
  } catch (err) {
    // The same three answers as the order page, for the same reason: a 403 that reads
    // differently from a 404 tells a stranger which order ids are real.
    if (err instanceof ApiError && err.status === 401) redirect('/session-ended');
    if (err instanceof ApiError && (err.status === 403 || err.status === 404 || err.status === 400))
      notFound();
    throw err;
  }
  // A terminal is only ever the answer to an order that owes money. One that is already paid,
  // cancelled or cooking has nothing to settle, and a page offering to pay it would be lying —
  // so it does not exist. This is also what keeps the route harmless when Stripe is configured:
  // the page is registered either way, but a guest is never handed its URL, and the demo
  // completion route the buttons post to is not registered at all.
  if (order.status !== 'placed') notFound();
  return <DemoTerminal order={order} currency={order.currency} />;
}
