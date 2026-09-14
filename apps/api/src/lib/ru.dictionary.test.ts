import { describe, expect, it } from 'vitest';
import ru from '../../../web/messages/ru.json';
import { checkoutLineName, qrSheet } from './ru';

/**
 * **The one place this app reads the web's dictionary, and it is a test.**
 *
 * `lib/ru.ts` holds the handful of sentences something other than the web tier draws — Stripe's
 * hosted checkout page, and pdfkit's printed QR sheet. Four of them are worded to match a string in
 * `apps/web/messages/ru.json`, so that the same guest reading the same thing on two surfaces reads
 * the same words. Until this file, all four matches were asserted in prose and by nothing else, and
 * `ru.ts:44` and `payments.test.ts:426` both said the match "cannot be guarded from here".
 *
 * That was false, and it is the fourth boundary comment in this milestone that claimed a limit the
 * code did not have. The runtime half of the argument is sound and is why the strings live in
 * `ru.ts` at all: **a Fastify service must not import a Next app's messages at run time.** But a
 * test is not the runtime. It runs from the repository, where both files are, and `e2e/dictionary.ts`
 * has been reading this same JSON from a third location since Task 11.
 *
 * So the import is here, once, in a file that ships nothing: `tsup` builds `src/index.ts` and never
 * reaches a `.test.ts`, and `errors.test.ts`'s walk skips test files by name. Nothing else in
 * `apps/api` may import it, and a second importer is the signal that the two or three genuinely
 * shared sentences should move into `@tabletap/shared` instead.
 *
 * **Why these are pins and not derivations.** Every other test in this milestone derives its
 * expectation from the dictionary, which is right when both sides are one string — a hand-typed
 * copy drifts. Here the two sides are *two independently editable homes in two applications*, and
 * comparing one against the other is the whole point: whichever side moves, this goes red. That is
 * a consistency check doing exactly the job it is good at, unlike a consistency check whose two
 * sides are the same file.
 *
 * **What it does not hold.** Whether either wording is *right* — that is
 * `docs/design/02b-copy-ru.md` and the copy owner's. And the reverse direction of the last two
 * pins: they assert a shared clause, not byte equality, because the sentences deliberately differ
 * around it.
 */

/** `guest.pay.terminalHeading` and the rest are ICU templates; fill them the way the screen does. */
const fill = (template: string, values: Record<string, number>): string =>
  Object.entries(values).reduce(
    (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
    template,
  );

describe('the sentences this app writes that the web also writes', () => {
  it('names a payment line exactly as the demo terminal’s heading does', () => {
    // Stripe prints `checkoutLineName`; the demo terminal prints `guest.pay.terminalHeading`. A
    // deployment that switches provider must not change what the payment step is called, and the
    // two strings are byte-identical today, U+00A0 included.
    expect(checkoutLineName({ number: 12, tableNumber: 7 })).toBe(
      fill(ru.guest.pay.terminalHeading, { table: 7, number: 12 }),
    );
  });

  it('names a table on the printed card exactly as the admin’s row does', () => {
    // The card on the table and the row in the admin are the same table, including the U+00A0 the
    // copy contract binds the number with.
    expect(qrSheet.table(7)).toBe(fill(ru.admin.tables.table, { number: 7 }));
  });

  it('tells a guest holding a card to do what the landing tells a guest reading the site', () => {
    // The shared half is the clause; the two sentences differ around it on purpose — the card says
    // which camera, the site does not — so this is a containment and not an equality.
    //
    // **Compared with U+00A0 flattened, and that is a decision rather than convenience.** The two
    // homes differ by exactly one code point today: the landing binds «и оформите» and the
    // printed card writes it with a plain space. The claim `ru.ts:72` makes is about the *verbs*,
    // and the verbs are identical; a bound space is a line-breaking hint, and the line it would
    // break is a pdfkit line on A4, not a browser's. Left as measured rather than normalised in
    // either direction, because changing a sentence a guest reads is the copy owner's.
    const NBSP = String.fromCharCode(0xa0);
    const flat = (text: string) => text.split(NBSP).join(' ');
    const verbs = flat('выберите блюда и оформите заказ.');
    expect(flat(ru.landing.hero.subtitle)).toContain(verbs);
    expect(flat(ru.landing.meta.description)).toContain(verbs);
    expect(flat(qrSheet.instruction)).toContain(verbs);
  });

  it('calls the printed sheet what the admin’s own controls call it', () => {
    // `admin.tables.printQr` is «Распечатать QR-коды». The empty sheet ends on that noun, and so
    // does the notice the admin shows after reissuing a code, so all three name one document.
    // The noun is read out of the admin's own string rather than written out here: renaming the
    // document in the dictionary then fails this rather than silently leaving the sheet behind.
    const noun = ru.admin.tables.printQr.split(' ').slice(-1).join('');
    expect(noun).toBe('QR-коды');
    expect(ru.admin.qr.reissued).toContain(noun);
    expect(qrSheet.nothingToPrint).toContain(noun);
  });
});
