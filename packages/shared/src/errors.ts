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
  'INVALID_TRANSITION',
  'PAYMENT_REQUIRED',
  'SIGNATURE_INVALID',
  'IN_USE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export const ErrorCodeSchema = z.enum(ERROR_CODES);

/**
 * What a refusal *means*, as a name the web can look up in its dictionary.
 *
 * The codes above are HTTP-shaped and deliberately coarse — `NOT_FOUND` alone is the honest answer
 * for a missing category, a missing dish, a missing table, a missing order and four more — so a
 * code-to-sentence map on the web would flatten nine useful refusals into one «Не найдено» and
 * take away the part the reader needed. These keys are the other axis: one per distinct thing that
 * can go wrong, carried beside the code rather than instead of it.
 *
 * **One key per distinct English sentence, and the same key wherever that sentence is used.** That
 * is not a tidiness rule, it is the security property: several of these refusals are identical on
 * purpose — a stranger's order and an order that never existed both answer `orderNotFound`, and
 * every role check answers `noAccess` without naming what was refused. Splitting such a key by call
 * site would let the answer distinguish "does not exist" from "exists, not yours", which is an
 * enumeration oracle wearing a translation's clothes. A key is a channel for text that is already
 * being sent; it never licenses saying more.
 *
 * `unreachable` is the one key the API never sends, because an API that cannot be reached sends
 * nothing at all. The web names that case here so it resolves through the same dictionary block as
 * the rest (`apps/web/lib/demo-links.ts`).
 */
export const ERROR_MESSAGE_KEYS = [
  // Access. Both are answered identically everywhere, and say nothing about what was asked for.
  'signInRequired',
  'noAccess',
  // The envelope's own frame: what the framework and the validator raise before or around us.
  'validationFailed',
  'requestNotProcessed',
  'rateLimited',
  'notFound',
  'routeNotFound',
  'serverError',
  'unreachable',
  // The guest's way in: the QR code and the table behind it.
  'qrExpired',
  'qrInvalid',
  'qrSuperseded',
  'tableUnavailable',
  // Ordering and paying.
  'orderNotFound',
  'orderMovedAlready',
  'orderNotAwaitingPayment',
  'noPaymentToComplete',
  'paymentSignatureInvalid',
  'basketAlreadySent',
  'itemsNotOnMenu',
  'itemsSoldOut',
  // The admin's menu.
  'categoryNotFound',
  'categoryChanged',
  'categoryInUse',
  'itemNotFound',
  'itemChanged',
  'itemInUse',
  'uploadNotForItem',
  'uploadMissing',
  'uploadTooLarge',
  'uploadUnsupportedType',
  'uploadUnknownSize',
  'photosNotConfigured',
  'photoUploadDisabled',
  // The admin's tables.
  'tableNotFound',
  'tableChanged',
  'tableInUse',
  'tableNumberTaken',
  // The deployment itself, and the demo data in it.
  'restaurantNotConfigured',
  'demoNotSeeded',
  'demoTableMissing',
  'rushAlreadyRunning',
] as const;
export type ErrorMessageKey = (typeof ERROR_MESSAGE_KEYS)[number];
export const ErrorMessageKeySchema = z.enum(ERROR_MESSAGE_KEYS);

/**
 * `message` stays, and stays English: it is what a developer reads in a log and in a stack, and
 * dropping it would make every production incident a lookup exercise. Nothing renders it.
 *
 * `messageKey` is optional *on the wire* and required of every producer (`AppError` takes it as a
 * constructor argument). The asymmetry is deliberate and it is about deploy skew: an envelope from
 * an API older than the web, or carrying a key this build does not know, must still parse, because
 * `error.code` is what the checkout screen, the kitchen board and the delete buttons branch on.
 * `.catch(undefined)` is what makes an unrecognised key degrade to "no key" — and therefore to the
 * web's generic refusal — instead of failing the whole envelope and taking the code down with it.
 */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    messageKey: ErrorMessageKeySchema.optional().catch(undefined),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
