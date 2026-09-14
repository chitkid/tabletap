import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MenuResponse } from '@tabletap/shared';
import { IntlMessageFormat } from 'intl-messageformat';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
import ru from '../../messages/ru.json';
import { CheckoutScreen } from './checkout-screen';
import { addItem, cartStorageKey } from '../../lib/cart';
import { formatCents } from '../../lib/money';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

/**
 * Every word is read out of `messages/ru.json`: the checkout's copy binds «к», «с», «в» and «и» to
 * the word after them with U+00A0. `getByRole(…, { name })` needs that byte; `getByText`,
 * `getByLabelText` and `toHaveTextContent` collapse it in the element only, so those take
 * `plain()`.
 */
const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const fill = (message: string, values: Record<string, string>) =>
  String(new IntlMessageFormat(message, 'ru-RU').format(values));
const C = ru.guest.checkout;
const B = ru.guest.basket;

const U = (n: number) => `018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f${n.toString(16).padStart(2, '0')}`;
const menu: MenuResponse = {
  restaurant: { id: U(1), name: 'Little Furnace', currency: 'USD' },
  categories: [
    {
      id: U(2),
      name: 'Напитки',
      plateKind: 'drink',
      sortOrder: 0,
      items: [
        {
          id: U(3),
          categoryId: U(2),
          name: 'Морс из клюквы',
          description: '',
          priceCents: 400,
          allergens: [],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 0,
        },
        {
          id: U(4),
          categoryId: U(2),
          name: 'Раф с облепихой',
          description: '',
          priceCents: 450,
          allergens: [],
          isAvailable: true,
          imageUrl: null,
          sortOrder: 1,
        },
      ],
    },
  ],
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const orderBody = {
  order: {
    id: U(9),
    number: 42,
    status: 'placed',
    tableId: 't1',
    tableNumber: 7,
    items: [],
    subtotalCents: 800,
    totalCents: 800,
    note: null,
    placedAt: '2026-09-03T10:00:00.000Z',
    cookingAt: null,
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
  },
};

describe('CheckoutScreen', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    replace.mockClear();
    localStorage.setItem(
      cartStorageKey('t1'),
      JSON.stringify(addItem(addItem({ items: {} }, U(3), 2), U(4))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());
  it('posts the basket with an idempotency key and a note, then clears and navigates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(201, orderBody)),
    );
    render(withProvider(<CheckoutScreen menu={menu} tableId="t1" />));
    expect(screen.getByText('2 × Морс из клюквы')).toBeInTheDocument();
    expect(screen.getByText(plain(C.total))).toBeInTheDocument();
    expect(screen.getByText(plain(formatCents(1300, 'USD')))).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(plain(C.noteLabel)), 'No ice');
    await userEvent.click(screen.getByRole('button', { name: C.submit }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/orders/${U(9)}`));
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/orders');
    const headers = new Headers(init?.headers);
    expect(headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [
        { menuItemId: U(3), quantity: 2 },
        { menuItemId: U(4), quantity: 1 },
      ],
      note: 'No ice',
    });
    expect(localStorage.getItem(cartStorageKey('t1'))).toBeNull();
  });
  it('reuses the same idempotency key on retry and marks sold-out lines', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        json(409, {
          error: {
            code: 'ITEM_UNAVAILABLE',
            message: 'x',
            details: { unavailable: [{ menuItemId: U(4), name: 'Раф с облепихой' }] },
          },
        }),
      )
      .mockResolvedValueOnce(json(201, orderBody));
    vi.stubGlobal('fetch', f);
    render(withProvider(<CheckoutScreen menu={menu} tableId="t1" />));
    await userEvent.click(screen.getByRole('button', { name: C.submit }));
    expect(await screen.findByText(plain(B.soldOutLine))).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: fill(B.removeDish, { name: 'Раф с облепихой' }) }),
    );
    await userEvent.click(screen.getByRole('button', { name: C.submit }));
    await vi.waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    const keys = f.mock.calls.map((c) =>
      new Headers((c[1] as RequestInit).headers).get('idempotency-key'),
    );
    expect(keys[0]).toBe(keys[1]);
  });
  it('places the order in an insecure context, where crypto.randomUUID is undefined', async () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => real.getRandomValues(array),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(201, orderBody)),
    );
    render(withProvider(<CheckoutScreen menu={menu} tableId="t1" />));
    await userEvent.click(screen.getByRole('button', { name: C.submit }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/orders/${U(9)}`));
    const headers = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers);
    expect(headers.get('idempotency-key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it('tells the truth when the key belongs to another session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(409, { error: { code: 'CONFLICT', message: 'x' } })),
    );
    render(withProvider(<CheckoutScreen menu={menu} tableId="t1" />));
    await userEvent.click(screen.getByRole('button', { name: C.submit }));
    expect(await screen.findByText(plain(C.conflict))).toBeInTheDocument();
    // The four refusals this screen owns are four different sentences; naming one and refusing
    // its nearest neighbour is what keeps this from passing on any of them.
    expect(screen.queryByText(plain(C.validationFailed))).toBeNull();
  });
  it('keeps the status line in the layout while it is empty', () => {
    render(withProvider(<CheckoutScreen menu={menu} tableId="t1" />));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
  it('sends an ended session back to the start and explains other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } })),
    );
    render(withProvider(<CheckoutScreen menu={menu} tableId="t1" />));
    await userEvent.click(screen.getByRole('button', { name: C.submit }));
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/session-ended'));
  });
  it('redirects to the menu when the basket is empty', () => {
    localStorage.clear();
    render(withProvider(<CheckoutScreen menu={menu} tableId="t1" />));
    expect(replace).toHaveBeenCalledWith('/menu');
  });
});
