import { describe, expect, it } from 'vitest';
import {
  ClaimRequestSchema,
  ClaimResponseSchema,
  ErrorEnvelopeSchema,
  MeResponseSchema,
  TableDtoSchema,
} from './index';

describe('API contracts', () => {
  it('requires a non-empty token to claim a table', () => {
    expect(ClaimRequestSchema.safeParse({ token: '' }).success).toBe(false);
    expect(ClaimRequestSchema.safeParse({ token: 'abc' }).success).toBe(true);
  });
  it('validates a table dto', () => {
    const ok = TableDtoSchema.safeParse({
      id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
      number: 7,
      label: 'Стол 7',
      seats: 4,
      isActive: true,
    });
    expect(ok.success).toBe(true);
    expect(
      TableDtoSchema.safeParse({ id: 'nope', number: 0, label: '', seats: 4, isActive: true })
        .success,
    ).toBe(false);
  });
  it('validates claim and me responses', () => {
    expect(
      ClaimResponseSchema.safeParse({
        table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', number: 7, label: 'Стол 7' },
        expiresAt: '2026-09-02T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      MeResponseSchema.safeParse({
        principal: { kind: 'staff', userId: 'u1', email: 'a@b.c', name: 'A', role: 'kitchen' },
      }).success,
    ).toBe(true);
    expect(
      MeResponseSchema.safeParse({
        principal: {
          kind: 'guest',
          guestSessionId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60',
          tableId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f61',
          restaurantId: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f62',
          tableNumber: 3,
          expiresAt: '2026-09-02T12:00:00.000Z',
        },
      }).success,
    ).toBe(true);
    expect(MeResponseSchema.safeParse({ principal: { kind: 'anonymous' } }).success).toBe(true);
    expect(MeResponseSchema.safeParse({ principal: { kind: 'staff', role: 'chef' } }).success).toBe(
      false,
    );
  });
  it('validates the error envelope', () => {
    expect(
      ErrorEnvelopeSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Table not found' } })
        .success,
    ).toBe(true);
    expect(ErrorEnvelopeSchema.safeParse({ error: { code: 'OOPS', message: 'x' } }).success).toBe(
      false,
    );
  });
});

import {
  DemoLinksResponseSchema,
  ERROR_CODES,
  MenuCategoryDtoSchema,
  MenuResponseSchema,
  OrderCreateRequestSchema,
  OrderDtoSchema,
} from './index';

const U1 = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60';
const U2 = '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f61';

describe('M2 contracts', () => {
  it('adds the two new error codes', () => {
    expect(ERROR_CODES).toContain('ITEM_UNAVAILABLE');
    expect(ERROR_CODES).toContain('CONFLICT');
  });
  it('validates a menu response', () => {
    const ok = MenuResponseSchema.safeParse({
      restaurant: { id: U1, name: 'Little Furnace', currency: 'RUB' },
      categories: [
        {
          id: U2,
          name: 'Из печи',
          plateKind: 'flatbread',
          sortOrder: 0,
          items: [
            {
              id: U1,
              categoryId: U2,
              name: 'Хачапури по-аджарски',
              description: '',
              priceCents: 69_000,
              allergens: ['gluten', 'dairy', 'egg'],
              isAvailable: true,
              imageUrl: null,
              sortOrder: 0,
            },
          ],
        },
      ],
    });
    expect(ok.success).toBe(true);
  });
  /**
   * `plateKind` is how a dish with no photograph gets drawn, and it has no default on purpose: a
   * response that forgot the column would otherwise parse, and every dish in the menu would come
   * out as the same shape with nothing failing.
   */
  it('refuses a menu category with no plate kind, and one with a kind it does not know', () => {
    const category = (over: Record<string, unknown>) => ({
      id: U2,
      name: 'Из печи',
      sortOrder: 0,
      items: [],
      ...over,
    });
    expect(MenuCategoryDtoSchema.safeParse(category({})).success).toBe(false);
    expect(MenuCategoryDtoSchema.safeParse(category({ plateKind: 'platter' })).success).toBe(false);
    expect(MenuCategoryDtoSchema.safeParse(category({ plateKind: 'bowl' })).success).toBe(true);
  });
  it('bounds an order request', () => {
    expect(
      OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 2 }] }).success,
    ).toBe(true);
    expect(OrderCreateRequestSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 0 }] }).success,
    ).toBe(false);
    expect(
      OrderCreateRequestSchema.safeParse({ items: [{ menuItemId: U1, quantity: 21 }] }).success,
    ).toBe(false);
    expect(
      OrderCreateRequestSchema.safeParse({
        items: [
          { menuItemId: U1, quantity: 1 },
          { menuItemId: U1, quantity: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      OrderCreateRequestSchema.safeParse({
        items: [{ menuItemId: U1, quantity: 1 }],
        note: 'x'.repeat(281),
      }).success,
    ).toBe(false);
    expect(
      OrderCreateRequestSchema.parse({
        items: [{ menuItemId: U1, quantity: 1 }],
        note: '  no onions  ',
      }).note,
    ).toBe('no onions');
  });
  it('validates an order dto and demo links', () => {
    expect(
      OrderDtoSchema.safeParse({
        id: U1,
        number: 42,
        status: 'placed',
        tableId: U2,
        tableNumber: 7,
        items: [
          {
            id: U1,
            menuItemId: U2,
            name: 'Морс из клюквы',
            unitPriceCents: 400,
            quantity: 1,
            lineTotalCents: 400,
          },
        ],
        subtotalCents: 400,
        totalCents: 400,
        currency: 'USD',
        note: null,
        placedAt: '2026-09-03T10:00:00.000Z',
        paidAt: null,
        cookingAt: null,
        readyAt: null,
        servedAt: null,
        cancelledAt: null,
        createdAt: '2026-09-03T10:00:00.000Z',
        updatedAt: '2026-09-03T10:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      DemoLinksResponseSchema.safeParse({
        guest: { tableNumber: 7, url: 'http://localhost:3000/t/abc' },
        staff: [
          {
            role: 'kitchen',
            email: 'kitchen@littlefurnace.demo',
            name: 'Тимофей Басов',
            password: 'tabletap-demo',
          },
        ],
        resetsEveryMinutes: 60,
        payments: { provider: 'demo', testCard: null },
      }).success,
    ).toBe(true);
  });
});

import {
  ActiveOrdersQuerySchema,
  RushResponseSchema,
  SOCKET_ROOMS,
  SocketTokenResponseSchema,
  TransitionRequestSchema,
} from './index';

describe('M3 contracts', () => {
  const base = {
    id: U1,
    number: 42,
    status: 'placed',
    tableId: U1,
    tableNumber: 7,
    items: [],
    subtotalCents: 0,
    totalCents: 0,
    note: null,
    placedAt: '2026-09-03T12:00:00.000Z',
    createdAt: '2026-09-03T12:00:00.000Z',
  };
  it('adds INVALID_TRANSITION', () => {
    expect(ERROR_CODES).toContain('INVALID_TRANSITION');
  });
  it('requires updatedAt and the per-status timestamps on an order', () => {
    expect(OrderDtoSchema.safeParse(base).success).toBe(false);
    const full = {
      ...base,
      currency: 'USD',
      updatedAt: base.createdAt,
      paidAt: null,
      cookingAt: null,
      readyAt: null,
      servedAt: null,
      cancelledAt: null,
    };
    expect(OrderDtoSchema.parse({ ...full, guestSessionId: 'x' })).not.toHaveProperty(
      'guestSessionId',
    );
  });
  it('validates the small request and response shapes', () => {
    expect(TransitionRequestSchema.safeParse({ to: 'cooking' }).success).toBe(true);
    expect(TransitionRequestSchema.safeParse({ to: 'baked' }).success).toBe(false);
    expect(ActiveOrdersQuerySchema.parse({})).toEqual({});
    expect(ActiveOrdersQuerySchema.safeParse({ active: 'yes' }).success).toBe(false);
    expect(SocketTokenResponseSchema.safeParse({ token: 't', expiresInSeconds: 60 }).success).toBe(
      true,
    );
    expect(
      RushResponseSchema.safeParse({ started: true, durationSeconds: 60, ordersPlanned: 12 })
        .success,
    ).toBe(true);
  });
  it('names the rooms after the session, not the table', () => {
    expect(SOCKET_ROOMS.kitchen).toBe('kitchen');
    expect(SOCKET_ROOMS.session(U1)).toBe(`session:${U1}`);
    expect(SOCKET_ROOMS).not.toHaveProperty('table');
  });
});

import {
  DemoCompleteRequestSchema,
  PaymentProviderNameSchema,
  PaymentSessionResponseSchema,
} from './index';

describe('M4 contracts', () => {
  it('adds the two payment error codes', () => {
    expect(ERROR_CODES).toContain('PAYMENT_REQUIRED');
    expect(ERROR_CODES).toContain('SIGNATURE_INVALID');
  });
  it('validates the payment shapes', () => {
    expect(PaymentSessionResponseSchema.parse({ url: '/pay/abc' })).toEqual({ url: '/pay/abc' });
    expect(PaymentSessionResponseSchema.safeParse({ url: '' }).success).toBe(false);
    expect(DemoCompleteRequestSchema.safeParse({ outcome: 'paid' }).success).toBe(true);
    expect(DemoCompleteRequestSchema.safeParse({ outcome: 'maybe' }).success).toBe(false);
    expect(PaymentProviderNameSchema.options).toEqual(['stripe', 'demo']);
  });
  it('carries paidAt on the public order, beside the other stage timestamps', () => {
    const base = {
      id: U1,
      number: 42,
      status: 'paid',
      tableId: U2,
      tableNumber: 7,
      items: [],
      subtotalCents: 0,
      totalCents: 0,
      currency: 'USD',
      note: null,
      placedAt: '2026-09-04T10:00:00.000Z',
      cookingAt: null,
      readyAt: null,
      servedAt: null,
      cancelledAt: null,
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z',
    };
    // Required, not optional: a guest surface measuring the wait from the payment must be able
    // to tell "not paid yet" (null) from "the field was left out of this response".
    expect(OrderDtoSchema.safeParse(base).success).toBe(false);
    expect(OrderDtoSchema.parse({ ...base, paidAt: null }).paidAt).toBeNull();
    expect(OrderDtoSchema.parse({ ...base, paidAt: base.placedAt }).paidAt).toBe(base.placedAt);
    expect(OrderDtoSchema.safeParse({ ...base, paidAt: 'yesterday' }).success).toBe(false);
  });
  it('carries the payment block on the demo links', () => {
    const links = {
      guest: { tableNumber: 7, url: 'http://localhost:3000/t/x' },
      staff: [{ role: 'kitchen', email: 'k@x.demo', name: 'K', password: 'p' }],
      resetsEveryMinutes: 60,
      payments: { provider: 'demo', testCard: null },
    };
    expect(DemoLinksResponseSchema.parse(links).payments).toEqual({
      provider: 'demo',
      testCard: null,
    });
    expect(DemoLinksResponseSchema.safeParse({ ...links, payments: undefined }).success).toBe(
      false,
    );
  });
});

import {
  DashboardResponseSchema,
  MenuCategoryWriteSchema,
  MenuItemWriteSchema,
  PhotoConfirmRequestSchema,
  PhotoUploadResponseSchema,
  TableWriteSchema,
} from './index';

describe('M5 contracts', () => {
  const orderBase = {
    id: U1,
    number: 42,
    status: 'placed',
    tableId: U2,
    tableNumber: 7,
    items: [],
    subtotalCents: 0,
    totalCents: 0,
    note: null,
    placedAt: '2026-09-04T10:00:00.000Z',
    paidAt: null,
    cookingAt: null,
    readyAt: null,
    servedAt: null,
    cancelledAt: null,
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
  };

  it('adds IN_USE', () => {
    expect(ERROR_CODES).toContain('IN_USE');
  });

  it('carries the currency on the order, and only a real three-letter code', () => {
    expect(OrderDtoSchema.safeParse(orderBase).success).toBe(false);
    expect(OrderDtoSchema.safeParse({ ...orderBase, currency: 'USD' }).success).toBe(true);
    expect(OrderDtoSchema.safeParse({ ...orderBase, currency: 'USDD' }).success).toBe(false);
  });

  it('validates a menu category write', () => {
    expect(MenuCategoryWriteSchema.safeParse({ name: 'Напитки' }).success).toBe(true);
    expect(MenuCategoryWriteSchema.safeParse({ name: '' }).success).toBe(false);
    // Withdrawn on purpose: no route lists an inactive category, so accepting the write would
    // create a state the API has no way out of. Zod strips the unknown key rather than refusing
    // the body, so the assertion is that it never reaches the parsed value.
    expect(MenuCategoryWriteSchema.parse({ name: 'Напитки', isActive: false })).toEqual({
      name: 'Напитки',
    });
  });

  it('validates a menu item write', () => {
    expect(
      MenuItemWriteSchema.safeParse({ categoryId: U1, name: 'Раф с облепихой', priceCents: 450 })
        .success,
    ).toBe(true);
    expect(
      MenuItemWriteSchema.safeParse({ categoryId: U1, name: 'Раф с облепихой', priceCents: -1 })
        .success,
    ).toBe(false);
  });

  it('validates a table write', () => {
    expect(TableWriteSchema.safeParse({ number: 1, label: 'Стол 1' }).success).toBe(true);
    expect(TableWriteSchema.safeParse({ number: 0, label: 'Стол 1' }).success).toBe(false);
  });

  it('validates the photo upload and confirm shapes', () => {
    expect(
      PhotoUploadResponseSchema.safeParse({ url: 'https://x/y', key: 'k', expiresInSeconds: 60 })
        .success,
    ).toBe(true);
    expect(
      PhotoUploadResponseSchema.safeParse({ url: '', key: 'k', expiresInSeconds: 60 }).success,
    ).toBe(false);
    expect(PhotoConfirmRequestSchema.safeParse({ key: 'k' }).success).toBe(true);
    expect(PhotoConfirmRequestSchema.safeParse({ key: '' }).success).toBe(false);
  });

  it('requires exactly the four today fields and a week of { date, orders }', () => {
    const valid = {
      today: { orders: 12, revenueCents: 34500, averageReadyMs: 600_000, openTickets: 3 },
      week: [{ date: '2026-09-04', orders: 12 }],
    };
    expect(DashboardResponseSchema.safeParse(valid).success).toBe(true);
    expect(
      DashboardResponseSchema.safeParse({
        ...valid,
        today: { orders: 12, revenueCents: 34500, openTickets: 3 },
      }).success,
    ).toBe(false);
    expect(
      DashboardResponseSchema.safeParse({ ...valid, week: [{ date: '2026-09-04' }] }).success,
    ).toBe(false);
    expect(
      DashboardResponseSchema.safeParse({
        today: { ...valid.today, averageReadyMs: null },
        week: [],
      }).success,
    ).toBe(true);
  });
});

import { ERROR_MESSAGE_KEYS, ErrorMessageKeySchema } from './index';

/**
 * The envelope's message key, and the one property the web depends on it for: an envelope the web
 * cannot make sense of must still hand over its `code`, because that is what the checkout screen,
 * the kitchen board and the admin's delete buttons branch on.
 */
describe('the error envelope’s message key', () => {
  const envelope = (over: Record<string, unknown>) =>
    ErrorEnvelopeSchema.safeParse({
      error: { code: 'NOT_FOUND', message: 'Order not found.', ...over },
    });

  it('carries a key it knows', () => {
    const parsed = envelope({ messageKey: 'orderNotFound' });
    expect(parsed.success && parsed.data.error.messageKey).toBe('orderNotFound');
  });

  it('parses an envelope with no key at all, as an older API would send', () => {
    const parsed = envelope({});
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.error.messageKey).toBeUndefined();
  });

  /**
   * Deploy skew in the other direction: an API newer than this build names a refusal this build
   * has never heard of. The envelope must survive it with the code intact — a failed parse here
   * would cost the web `error.code`, and with it every branch that reads one.
   */
  it('drops a key it does not know rather than failing the envelope', () => {
    const parsed = envelope({ messageKey: 'somethingThisBuildHasNeverHeardOf' });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.error.messageKey).toBeUndefined();
    expect(parsed.success && parsed.data.error.code).toBe('NOT_FOUND');
  });

  it('names every key exactly once', () => {
    expect(new Set(ERROR_MESSAGE_KEYS).size).toBe(ERROR_MESSAGE_KEYS.length);
    expect(ErrorMessageKeySchema.safeParse('noAccess').success).toBe(true);
    expect(ErrorMessageKeySchema.safeParse('noAccessAtAll').success).toBe(false);
  });
});
