import type { OrderStatus } from '@tabletap/shared';

/**
 * **This file is deliberately wrong.** It is the fixture `../no-orphan-strings.test.ts` points its
 * scanner at to prove the scanner still fails on what it exists to fail on. A gate accepted on the
 * strength of a green run over a clean tree has been tested against nothing: it would pass just as
 * green with its scanner returning `[]` unconditionally.
 *
 * It is not rendered, not routed, not imported by the app, and sits outside every directory the
 * real scan walks (`app/`, `components/`, `packages/ui/src`). It does have to compile and lint,
 * because `apps/web/tsconfig.json` includes it, which is the point — the shapes below are shapes
 * real code can take.
 *
 * Each planted case is numbered, and the test names the same numbers. Adding a case here without
 * adding its expectation there is a case the gate is not proven to catch, so the test asserts the
 * exact count as well as the contents.
 */

/** Case 5: a table of English sentences, rendered through a variable rather than written in JSX. */
const REFUSAL_BY_STATUS: Record<number, string> = {
  401: 'That email and password do not match.',
  429: 'Too many attempts. Wait a minute and try again.',
};

/** Not a finding: a class list is not prose, and `cn()`'s arguments are skipped by position. */
const BOX = 'flex min-h-7 flex-col items-center rounded-full px-3 text-sm font-semibold';

export function OrphanFixture({
  status,
  httpStatus,
  table,
}: {
  status: OrderStatus;
  httpStatus: number;
  table: number;
}) {
  return (
    <section className={BOX} data-slot="orphan-fixture">
      {/* Case 1: a JSX text node in English. */}
      <h2>Order summary</h2>

      {/* Not a finding: Russian is the point, and the two allow-listed names are the product's
          and the restaurant's. A technology name is allow-listed too. */}
      <h3>Ваш заказ · Little Furnace</h3>
      <p>TableTap работает на Next.js.</p>

      {/* Case 2: an English `aria-label`. */}
      <button type="button" aria-label="Close the basket">
        ×
      </button>

      {/* Case 3: an English `alt` and an English `title`, both on the same element. A bare `<img>`
          because `alt` is the attribute under test and this file is never rendered; reaching for
          `next/image` here would pull a renderer into a fixture that exists to be parsed. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- parsed, never rendered */}
      <img src="/plate.png" alt="A plate of food" title="Today's special" />

      {/* Case 4: an English `placeholder`. */}
      <input name="note" placeholder="Anything else?" />

      {/* Case 5, continued: the table above reaching the screen. The literal is in the table, not
          here, so a scan that only reads JSX positions sees a bare property access and passes. */}
      <p>{REFUSAL_BY_STATUS[httpStatus]}</p>

      {/* Case 6: a union member rendered straight into the interface. There is no string literal
          anywhere in this file for this one — the English is in `OrderStatus` in
          `packages/shared`, and only the type checker can see that it lands here. */}
      <span>{status}</span>

      {/* Case 7: the same union reaching an accessible name instead of a text node. */}
      <span role="img" aria-label={status} />

      {/* Case 8: English inside a template literal, which is neither a JSX text node nor a plain
          string literal. */}
      <p>{`Signed in as a guest of table ${table}`}</p>
    </section>
  );
}
