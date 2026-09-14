import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ErrorCode, ErrorMessageKey } from '@tabletap/shared';
import { AppError } from '../lib/errors';

/**
 * Our wording for the 4xx the framework raises before a handler ever runs.
 *
 * The 401 and 403 rows carry the same keys `rbac.ts` raises by hand, and that is the point: a
 * caller must not be able to tell a guard's refusal from the framework's by the words it gets
 * back, any more than by the status.
 */
const GENERIC_4XX: Record<
  number,
  { code: ErrorCode; messageKey: ErrorMessageKey; message: string }
> = {
  401: { code: 'UNAUTHORIZED', messageKey: 'signInRequired', message: 'Sign in to continue.' },
  403: { code: 'FORBIDDEN', messageKey: 'noAccess', message: 'You do not have access to this.' },
  404: { code: 'NOT_FOUND', messageKey: 'notFound', message: 'Not found.' },
};

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        messageKey: 'routeNotFound',
        // The method and the path are the caller's own request echoed back, so this discloses
        // nothing - but they cannot travel in a key, and the Russian says so without them.
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          messageKey: 'validationFailed',
          message: 'Request did not match the expected shape.',
          details: error.validation,
        },
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          messageKey: error.messageKey,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
    }
    const status =
      typeof (error as { statusCode?: number }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;
    if (status === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          messageKey: 'rateLimited',
          message: 'Too many requests. Try again in a minute.',
        },
      });
    }
    if (status >= 400 && status < 500) {
      // Never echo the framework's own wording ("Unsupported Media Type", parser internals):
      // it is not our voice and it describes machinery the caller cannot act on.
      request.log.debug({ err: error, statusCode: status }, 'client error');
      return reply.status(status).send({
        error: GENERIC_4XX[status] ?? {
          code: 'VALIDATION_FAILED',
          messageKey: 'requestNotProcessed',
          message: 'Request could not be processed.',
        },
      });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL',
        messageKey: 'serverError',
        message: 'Something went wrong on our side.',
      },
    });
  });
});
