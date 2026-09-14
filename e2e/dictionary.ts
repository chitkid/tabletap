import ru from '../apps/web/messages/ru.json';

/**
 * The words the end-to-end suite looks for, read out of the same dictionary the product renders
 * from. Nothing here is typed against the screen: the Russian copy binds short prepositions and
 * numbers to the word after them with U+00A0, and a hand-typed plain space in a selector makes the
 * selector find nothing while the file still reads as if it were asserting something.
 *
 * **The whitespace rule here is the opposite of the one in the jsdom tests.** Playwright
 * normalises whitespace on *both* sides of a text or accessible-name comparison - U+00A0 included
 * - so a dictionary string can be handed to a locator exactly as it comes. Only a RegExp escapes
 * that: a pattern is matched against text Playwright has already normalised, so write `\s` for
 * every space in one. `apps/web`'s unit tests need the opposite treatment, because
 * `@testing-library/dom` normalises the element and not the expected string.
 */
export { ru };
export const GUEST = ru.guest;
export const KITCHEN = ru.kitchen;
export const ADMIN = ru.admin;
export const LANDING = ru.landing;
export const LOGIN = ru.login;
export const STATUS = ru.status;

/** A message's `{placeholder}`s filled in, the way next-intl fills them for a simple argument. */
export function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * One form of an ICU plural, chosen the way the runtime chooses it.
 *
 * Russian needs three forms and the dictionary carries four branches; picking one by hand in a
 * spec would be a fourth copy of the rule. `Intl.PluralRules` is the same table next-intl's
 * formatter consults, so this asks the platform rather than re-deciding. The plural rule itself is
 * tested where it belongs — `apps/web/lib/plural.test.ts` and `rush-button.test.tsx` — and this
 * only has to build the sentence the board or the bar is actually showing.
 */
export function plural(message: string, n: number): string {
  const branches = new Map<string, string>();
  for (const match of message.matchAll(/(\w+)\s*\{([^{}]*)\}/g)) {
    // `noUncheckedIndexedAccess`: a capture group is `string | undefined` even when the pattern
    // guarantees it, and the guard is cheaper than the assertion that would silence it.
    const [, key, body] = match;
    if (key !== undefined && body !== undefined) branches.set(key, body);
  }
  const chosen = branches.get(new Intl.PluralRules('ru-RU').select(n)) ?? branches.get('other');
  if (chosen === undefined) throw new Error(`no plural branch for ${n} in ${message}`);
  return chosen.split('#').join(String(n));
}

/**
 * The order number out of a receipt headline. `guest.order.headline.*` is the only place a guest
 * is ever shown it, and it binds the number to «№» with U+00A0 — hence `\s`, against the raw
 * `textContent` no normaliser has touched.
 */
export const ORDER_NUMBER_IN_HEADLINE = /№\s(\d+)/;
