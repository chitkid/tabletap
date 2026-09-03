import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ErrorCode } from '@tabletap/shared';
import { AppError } from '../lib/errors';

/** Our wording for the 4xx the framework raises before a handler ever runs. */
const GENERIC_4XX: Record<number, { code: ErrorCode; message: string }> = {
  401: { code: 'UNAUTHORIZED', message: 'Sign in to continue.' },
  403: { code: 'FORBIDDEN', message: 'You do not have access to this.' },
  404: { code: 'NOT_FOUND', message: 'Not found.' },
};

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    });
  });
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request did not match the expected shape.',
          details: error.validation,
        },
      });
    }
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
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
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' },
      });
    }
    if (status >= 400 && status < 500) {
      // Never echo the framework's own wording ("Unsupported Media Type", parser internals):
      // it is not our voice and it describes machinery the caller cannot act on.
      request.log.debug({ err: error, statusCode: status }, 'client error');
      return reply.status(status).send({
        error: GENERIC_4XX[status] ?? {
          code: 'VALIDATION_FAILED',
          message: 'Request could not be processed.',
        },
      });
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  });
});
