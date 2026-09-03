import { z } from 'zod';
export const ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'TOKEN_INVALID',
  'TOKEN_EXPIRED',
  'RATE_LIMITED',
  'ITEM_UNAVAILABLE',
  'CONFLICT',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const ErrorEnvelopeSchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string(), details: z.unknown().optional() }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
