/**
 * **The one list of Latin names a Russian reader is allowed to meet, and the test that strips
 * them.** Shared by the two gates that look for English: `no-orphan-strings.test.ts`, which reads
 * the component sources, and `dictionary.test.ts`, which reads `messages/ru.json`.
 *
 * It is shared rather than copied on purpose. The list is a set of *decisions* — each entry is a
 * name this product writes in Latin because its makers do — and two copies of a decision drift into
 * two different decisions. A name added here is added for both gates at once.
 */

/**
 * «TableTap» is the product, «Little Furnace» the restaurant, and a technology is called what its
 * makers call it — docs/design/02b-copy-ru.md, «Терминология». Typeface names are in the same
 * class: `opengraph-image.tsx` registers its faces with Satori by name. Nothing else belongs here;
 * an addition to this list is a decision that a Russian reader will meet a Latin word.
 */
export const ALLOWED = [
  'TableTap',
  'Little Furnace',
  'Next.js',
  'Fastify',
  'Drizzle',
  'Postgres',
  'Playwright',
  'Docker Compose',
  'PT Sans Narrow Latin',
  'PT Sans Narrow',
  'JPEG',
  'PNG',
  'WebP',
  'QR',
  // `errors.routeNotFound` — «Такого адреса в API нет. Проверьте путь запроса.» The contract's
  // «Терминология» says a technology is called what its makers call it, and this is one; the
  // Russian for it is «программный интерфейс», which names nothing a reader of that refusal could
  // act on. Added when `dictionary.test.ts` first read the dictionary and found it.
  'API',
];

/** Strip the allow-listed names, then ask whether any Latin is left. Longest first, so that
 *  «PT Sans Narrow Latin» is spent before «PT Sans Narrow» can leave «Latin» behind. */
export function latinLeft(text: string): boolean {
  let rest = text;
  for (const name of ALLOWED) rest = rest.split(name).join(' ');
  return /[A-Za-z]{2}/.test(rest);
}
