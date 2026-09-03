import {
  IDEMPOTENCY_KEY_HEADER,
  MenuResponseSchema,
  OrderResponseSchema,
  SocketTokenResponseSchema,
  type BoardSnapshot,
  type ClientToServerEvents,
  type OrderDto,
  type ServerToClientEvents,
} from '@tabletap/shared';
import { signSocketToken, signTableToken } from '@tabletap/shared/server';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TEST_CONFIG, claimTable, createTestApp, signInAs } from '../test/helpers';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

describe('realtime', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let url: string;
  const clients: Client[] = [];

  const tokenFor = async (cookie: string) =>
    SocketTokenResponseSchema.parse(
      (
        await ctx.app.inject({ method: 'POST', url: '/api/socket-token', headers: { cookie } })
      ).json(),
    ).token;
  const connect = (auth: Record<string, string>) =>
    new Promise<Client>((resolve, reject) => {
      const socket: Client = io(url, { auth, transports: ['websocket'], reconnection: false });
      clients.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (err) => reject(err));
    });
  const subscribe = (socket: Client) =>
    new Promise<BoardSnapshot>((resolve) => socket.emit('subscribe', resolve));
  const nextEvent = <K extends 'order:created' | 'order:updated'>(
    socket: Client,
    event: K,
    ms = 1500,
  ) =>
    new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      const listener = ({ order }: { order: OrderDto }) => {
        clearTimeout(timer);
        resolve(order.id);
      };
      // socket.io-client's listener type stays a deferred conditional when `event` is a type
      // parameter (microsoft/TypeScript#41778); the payload shape is identical for both events,
      // so route the call through `unknown` rather than accept it untyped.
      (socket.once as unknown as (ev: K, cb: typeof listener) => void)(event, listener);
    });
  const placeOrder = async (tableNumber: number) => {
    const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
    const menu = MenuResponseSchema.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json(),
    );
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      payload: { items: [{ menuItemId: menu.categories[0]!.items[0]!.id, quantity: 1 }] },
    });
    return { cookie, order: OrderResponseSchema.parse(res.json()).order };
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
  });
  afterEach(() => {
    for (const c of clients.splice(0)) c.disconnect();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('mints a 60-second token for staff and guests, none for anonymous', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/socket-token',
      headers: { cookie: kitchen },
    });
    expect(res.statusCode).toBe(200);
    expect(SocketTokenResponseSchema.parse(res.json()).expiresInSeconds).toBe(60);
    const { cookie } = await claimTable(ctx.app, ctx.db, 4);
    expect(
      (await ctx.app.inject({ method: 'POST', url: '/api/socket-token', headers: { cookie } }))
        .statusCode,
    ).toBe(200);
    expect((await ctx.app.inject({ method: 'POST', url: '/api/socket-token' })).statusCode).toBe(
      401,
    );
  });
  it('refuses a missing, expired or table-typed token with the error code', async () => {
    await expect(connect({})).rejects.toMatchObject({ data: { code: 'TOKEN_INVALID' } });
    const expired = await signSocketToken(
      { kind: 'staff', userId: 'u', role: 'kitchen', restaurantId: randomUUID() },
      {
        secret: TEST_CONFIG.SOCKET_TOKEN_SECRET,
        ttlSeconds: 60,
        now: new Date(Date.now() - 120_000),
      },
    );
    await expect(connect({ token: expired })).rejects.toMatchObject({
      data: { code: 'TOKEN_EXPIRED' },
    });
    const table = await signTableToken(
      { tableId: randomUUID(), restaurantId: randomUUID(), tableNumber: 7 },
      { secret: TEST_CONFIG.SOCKET_TOKEN_SECRET, ttlSeconds: 60 },
    );
    await expect(connect({ token: table })).rejects.toMatchObject({
      data: { code: 'TOKEN_INVALID' },
    });
  });
  it('gives staff the active snapshot and every order event', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const socket = await connect({ token: await tokenFor(kitchen) });
    const { order } = await placeOrder(6);
    const snapshot = await subscribe(socket);
    expect(snapshot.orders.map((o) => o.id)).toContain(order.id);
    expect(snapshot.orders.every((o) => !('guestSessionId' in o))).toBe(true);
    const created = nextEvent(socket, 'order:created');
    const second = await placeOrder(6);
    expect(await created).toBe(second.order.id);
  });
  it('gives a guest only its own table', async () => {
    const seven = await placeOrder(7);
    const three = await claimTable(ctx.app, ctx.db, 3);
    const guest7 = await connect({ token: await tokenFor(seven.cookie) });
    const guest3 = await connect({ token: await tokenFor(three.cookie) });
    expect((await subscribe(guest7)).orders.map((o) => o.id)).toEqual([seven.order.id]);
    expect((await subscribe(guest3)).orders).toEqual([]);
    const on7 = nextEvent(guest7, 'order:updated');
    const on3 = nextEvent(guest3, 'order:updated', 500);
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    await ctx.app.inject({
      method: 'POST',
      url: `/api/orders/${seven.order.id}/transition`,
      headers: { cookie: kitchen },
      payload: { to: 'cooking' },
    });
    expect(await on7).toBe(seven.order.id);
    expect(await on3).toBeNull();
  });
  it('tells every socket about a demo reset', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const socket = await connect({ token: await tokenFor(kitchen) });
    const reset = new Promise<boolean>((resolve) => socket.once('demo:reset', () => resolve(true)));
    ctx.app.orderEvents.emit('demo:reset');
    expect(await reset).toBe(true);
  });
});
