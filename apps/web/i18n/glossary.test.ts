// @vitest-environment node
import { describe, expect, it } from 'vitest';
import ru from '../messages/ru.json';

/**
 * **The one file in this milestone that is allowed to transcribe.** Everywhere else, deriving an
 * expectation from `messages/ru.json` is the rule, because a hand-typed copy of a Russian string
 * drifts from the dictionary by a character and stops asserting anything. That rule has a shadow,
 * and this file is it: once every expectation comes out of the dictionary, **nothing is left that
 * checks the dictionary against the contract it was translated from**.
 *
 * Measured, not supposed. Editing `status.guest.ready` in `messages/ru.json` to «Готов» — collapsing
 * the guest column onto the kitchen's, which is precisely the one row `docs/design/02b-copy-ru.md`
 * says must differ — left **88 of 88** order and kitchen tests green before this file existed. Both
 * halves of that guard (`order-screen.test.tsx`, `ticket-card.test.tsx`) read `ru.status.*` on both
 * sides of their comparison, so both fell silent in exactly the state they exist to forbid.
 *
 * So the words below are typed out, from the table in `docs/design/02b-copy-ru.md` §"The glossary,
 * for the seven statuses that exist". If the copy owner changes that table, this file is what has
 * to be edited to match, and the edit is the record that the change was deliberate.
 *
 * U+00A0 is built from its code point rather than pasted, so the one non-breaking space in the
 * table — «Отправлен на кухню» — is visible in source and survives a diff.
 */
const NBSP = String.fromCharCode(0xa0);

/**
 * The approved table, both columns, transcribed.
 *
 * Two cells the document writes as «—» carry a word here anyway, and the document says why:
 * `draft` is a basket the guest never sees named as a status, and `placed` is not drawn on the
 * board at all. The dictionary still needs a string for each, so the guest's `draft` borrows the
 * sentence its own next state uses and the kitchen's `placed` borrows the guest's. Neither is a
 * contract violation; both are pinned so that a later edit has to mean one.
 */
const GLOSSARY = {
  draft: { guest: 'Ожидает оплаты', kitchen: 'Черновик' },
  placed: { guest: 'Ожидает оплаты', kitchen: 'Ожидает оплаты' },
  paid: { guest: `Отправлен на${NBSP}кухню`, kitchen: 'Новый' },
  cooking: { guest: 'Готовится', kitchen: 'Готовится' },
  ready: { guest: 'Готов — сейчас принесут', kitchen: 'Готов' },
  served: { guest: 'Подан', kitchen: 'Подан' },
  cancelled: { guest: 'Отменён', kitchen: 'Отменён' },
} as const;

describe('the status glossary, against the approved copy contract', () => {
  it('says the seven statuses in the words docs/design/02b-copy-ru.md approved', () => {
    // Whole-object equality, so a key added to `ru.json` without a decision here fails too.
    expect(ru.status.guest).toEqual(
      Object.fromEntries(Object.entries(GLOSSARY).map(([key, row]) => [key, row.guest])),
    );
    expect(ru.status.kitchen).toEqual(
      Object.fromEntries(Object.entries(GLOSSARY).map(([key, row]) => [key, row.kitchen])),
    );
  });

  it('keeps the two columns apart exactly where the contract says they part', () => {
    // The rule behind the table: the guest is told what happens to them, the staff what the order
    // is. Where those coincide the wording coincides — «Готовится» on three surfaces is the point,
    // not an oversight — and where they do not, the difference is load-bearing.
    const differ = Object.keys(GLOSSARY).filter(
      (key) =>
        ru.status.guest[key as keyof typeof GLOSSARY] !==
        ru.status.kitchen[key as keyof typeof GLOSSARY],
    );
    expect(differ).toEqual(['draft', 'paid', 'ready']);
  });

  it('keeps the board’s plural column heading off the singular badge beside it', () => {
    // The other split a well-meant "consistency" edit would collapse: `status.kitchen` is the word
    // for *one* order's state and sits on a ticket; `kitchen.columns` names a group of tickets and
    // is plural. «Готов» on the badge, «Готовы» on the heading above it. Ruled by the copy owner,
    // 2026-09-14; `ticket-card.tsx` and `kitchen-board.tsx` each carry half of the note.
    expect(ru.kitchen.columns.ready).toBe('Готовы');
    expect(ru.status.kitchen.ready).toBe('Готов');
    expect(ru.kitchen.columns.cooking).toBe('Готовятся');
    // «Новые», the plural of the kitchen's «Новый» — and not the guest's «Отправлен на кухню»,
    // which is the same event described from the other side of the pass. Stated as a literal
    // rather than derived from `status.kitchen.paid`: «Новый» → «Новые» is not a prefix relation,
    // and a first draft of this line asserted that it was and went red.
    expect(ru.kitchen.columns.new).toBe('Новые');
  });
});
