import type { z } from 'zod';
import type { ErrorCode, ErrorMessageKey } from '@tabletap/shared';

/**
 * Every refusal this API raises, in two registers at once.
 *
 * `messageKey` is what a **guest or a member of staff** ends up reading: the web resolves it
 * through `apps/web/messages/ru.json` and never renders `message`. `message` is what a
 * **developer** reads — in a log line, in a stack, in a failing test — and it stays English for
 * exactly that reason.
 *
 * The key sits before the sentence because it is the load-bearing half, and because the two being
 * adjacent is what makes transposing them a compile error rather than a silent English screen:
 * `ErrorMessageKey` is a union, so a sentence in the key's position does not typecheck.
 *
 * Choosing a key is not a free hand. Where two call sites answer with the same English sentence
 * today they answer with the same key, because several of those coincidences are the security
 * property rather than an accident — see `ERROR_MESSAGE_KEYS` in `packages/shared/src/errors.ts`.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    public readonly messageKey: ErrorMessageKey,
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
      'validationFailed',
      'Request did not match the expected shape.',
      result.error.issues,
    );
  return result.data;
}
