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
