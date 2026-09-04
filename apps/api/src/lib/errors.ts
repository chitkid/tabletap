import type { z } from 'zod';
import type { ErrorCode } from '@tabletap/shared';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Fastify validates a declared `schema.body`/`schema.headers` before any preHandler, so an access
 * guard would answer after the payload check: an anonymous caller would be told what is wrong with
 * a body we were never going to read. Routes behind a guard therefore validate their input with
 * this, inside the handler, once the guard has passed. A declared headers schema would also
 * replace `request.headers` with the parsed subset, dropping the cookie a session resolves from.
 */
export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      'VALIDATION_FAILED',
      400,
      'Request did not match the expected shape.',
      result.error.issues,
    );
  return result.data;
}
