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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as ordersModule from '../lib/orders';
import type { InternalOrderDto } from '../lib/orders';
import { TEST_CONFIG, claimTable, createTestApp, signInAs } from '../test/helpers';
import { SUBSCRIBE_MIN_INTERVAL_MS } from './server';

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
    new Promise<BoardSnapshot | null>((resolve) => socket.emit('subscribe', resolve));
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
  const placeOrderAs = async (cookie: string) => {
    const menu = MenuResponseSchema.parse(
      (await ctx.app.inject({ method: 'GET', url: '/api/menu', headers: { cookie } })).json(),
    );
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/orders',
      headers: { cookie, [IDEMPOTENCY_KEY_HEADER]: randomUUID() },
      payload: { items: [{ menuItemId: menu.categories[0]!.items[0]!.id, quantity: 1 }] },
    });
    return OrderResponseSchema.parse(res.json()).order;
  };
  const placeOrder = async (tableNumber: number) => {
    const { cookie } = await claimTable(ctx.app, ctx.db, tableNumber);
    return { cookie, order: await placeOrderAs(cookie) };
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
    expect(snapshot?.orders.map((o) => o.id)).toContain(order.id);
    expect(snapshot?.orders.every((o) => !('guestSessionId' in o))).toBe(true);
    const created = nextEvent(socket, 'order:created');
    const second = await placeOrder(6);
    expect(await created).toBe(second.order.id);
  });
  it('stamps serverTime before the query, so an order committed during it is not erased', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const socket = await connect({ token: await tokenFor(kitchen) });
    const real = ordersModule.listOrders;
    let queryStartedAt = 0;
    const spy = vi
      .spyOn(ordersModule, 'listOrders')
      .mockImplementation(async (...args: Parameters<typeof ordersModule.listOrders>) => {
        queryStartedAt = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return real(...args);
      });
    try {
      const snapshot = await subscribe(socket);
      // A client keeps any local order newer than serverTime, so serverTime must be the moment
      // the read began: stamped after it, an order committed mid-query looks older than the
      // snapshot that does not contain it and the board drops it for good.
      expect(Date.parse(snapshot!.serverTime)).toBeLessThanOrEqual(queryStartedAt);
    } finally {
      spy.mockRestore();
    }
  });
  it('acks null and logs, rather than crashing, when subscribe fails', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const socket = await connect({ token: await tokenFor(kitchen) });
    const errorLog = vi.spyOn(ctx.app.log, 'error').mockImplementation(() => undefined);
    const listOrdersSpy = vi
      .spyOn(ordersModule, 'listOrders')
      .mockRejectedValueOnce(new Error('db down'));
    try {
      // An empty snapshot would read as "every ticket is gone" on every board at once; null
      // says "no answer this time" and leaves the client holding what it has.
      expect(await subscribe(socket)).toBeNull();
      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.any(Error),
          principal: { kind: 'staff', id: expect.any(String) },
        }),
        'subscribe failed',
      );
    } finally {
      listOrdersSpy.mockRestore();
      errorLog.mockRestore();
    }
    // The socket is still connected after the failure, and a later subscribe (now hitting the
    // real listOrders again) still returns real data - one bad call does not wedge the socket
    // or the process.
    const { order } = await placeOrder(6);
    await new Promise((resolve) => setTimeout(resolve, SUBSCRIBE_MIN_INTERVAL_MS + 50));
    const snapshot = await subscribe(socket);
    expect(snapshot?.orders.map((o) => o.id)).toContain(order.id);
  });
  it('throttles a resubscribe loop by acking null', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const first = await connect({ token: await tokenFor(kitchen) });
    expect(await subscribe(first)).not.toBeNull();
    expect(await subscribe(first)).toBeNull();
    // Per socket, not global: a second board subscribing at the same moment still gets its board.
    const second = await connect({ token: await tokenFor(kitchen) });
    expect(await subscribe(second)).not.toBeNull();
  });
  it('keeps a committed write when a publish listener throws', async () => {
    const errorLog = vi.spyOn(ctx.app.log, 'error').mockImplementation(() => undefined);
    try {
      expect(() =>
        ctx.app.orderEvents.emit('order:created', {} as unknown as InternalOrderDto),
      ).not.toThrow();
      expect(errorLog).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), event: 'order:created' }),
        'realtime publish failed',
      );
    } finally {
      errorLog.mockRestore();
    }
  });
  it('beats often enough that a board notices a lost connection in seconds', () => {
    expect(ctx.app.io.engine.opts.pingInterval).toBe(10_000);
    expect(ctx.app.io.engine.opts.pingTimeout).toBe(5_000);
  });
  it('gives a guest only its own session', async () => {
    const seven = await placeOrder(7);
    const three = await claimTable(ctx.app, ctx.db, 3);
    const guest7 = await connect({ token: await tokenFor(seven.cookie) });
    const guest3 = await connect({ token: await tokenFor(three.cookie) });
    expect((await subscribe(guest7))?.orders.map((o) => o.id)).toEqual([seven.order.id]);
    expect((await subscribe(guest3))?.orders).toEqual([]);
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
  it('stops delivering to the old party once the table changes hands', async () => {
    const first = await placeOrder(7);
    const oldParty = await connect({ token: await tokenFor(first.cookie) });
    // The same table, claimed again: a new guest session, and the tab from the last sitting is
    // still open on the old one.
    const { cookie: newPartyCookie } = await claimTable(ctx.app, ctx.db, 7);
    const newParty = await connect({ token: await tokenFor(newPartyCookie) });
    const onOld = nextEvent(oldParty, 'order:created', 750);
    const onNew = nextEvent(newParty, 'order:created');
    const theirs = await placeOrderAs(newPartyCookie);
    expect(await onNew).toBe(theirs.id);
    expect(await onOld).toBeNull();
    expect((await subscribe(oldParty))?.orders.map((o) => o.id)).toEqual([first.order.id]);
  });
  it('tells every socket about a demo reset', async () => {
    const kitchen = await signInAs(ctx.app, 'kitchen@littlefurnace.demo');
    const socket = await connect({ token: await tokenFor(kitchen) });
    const reset = new Promise<boolean>((resolve) => socket.once('demo:reset', () => resolve(true)));
    ctx.app.orderEvents.emit('demo:reset');
    expect(await reset).toBe(true);
  });
});
