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
      label: 'Table 7',
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
        table: { id: '018f0d38-8d5d-7c6e-8f6a-1b2c3d4e5f60', number: 7, label: 'Table 7' },
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
      restaurant: { id: U1, name: 'Little Furnace', currency: 'USD' },
      categories: [
        {
          id: U2,
          name: 'Flatbreads',
          sortOrder: 0,
          items: [
            {
              id: U1,
              categoryId: U2,
              name: 'Margherita Flatbread',
              description: '',
              priceCents: 1200,
              allergens: ['gluten', 'dairy'],
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
            name: 'House Lemonade',
            unitPriceCents: 400,
            quantity: 1,
            lineTotalCents: 400,
          },
        ],
        subtotalCents: 400,
        totalCents: 400,
        note: null,
        placedAt: '2026-09-03T10:00:00.000Z',
        createdAt: '2026-09-03T10:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      DemoLinksResponseSchema.safeParse({
        guest: { tableNumber: 7, url: 'http://localhost:3000/t/abc' },
        staff: [
          {
            role: 'kitchen',
            email: 'kitchen@littlefurnace.demo',
            name: 'Theo Baptiste',
            password: 'tabletap-demo',
          },
        ],
        resetsEveryMinutes: 60,
      }).success,
    ).toBe(true);
  });
});
