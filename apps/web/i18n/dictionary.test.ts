// @vitest-environment node
import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import ru from '../messages/ru.json';
import { latinLeft } from './latin';

/**
 * **The gate over the dictionary itself.**
 *
 * `no-orphan-strings.test.ts` reads the component sources and finds English written into them.
 * This milestone moved every user-visible string *out* of those sources and into
 * `apps/web/messages/ru.json` — which is exactly what took them out of that gate, and out of every
 * other one. Measured at the merge review: six leaves turned into English (the landing hero's two
 * lines, `guest.menu.add`, `guest.menu.soldOut`, `admin.actions.edit`, `admin.actions.save`) left
 * all 309 web tests green, with eslint and prettier clean. Three `errors.*` refusals turned into
 * English did the same. The same English one file over turned the orphan gate red naming file,
 * line and word.
 *
 * The reason is structural and worth stating rather than fixing quietly: about forty test files
 * import `ru.json` and use it on **both** sides of their comparisons. That is the milestone's own
 * rule — derive, never transcribe — and it is right, because a hand-typed Russian string drifts by
 * a character and stops asserting anything. Its cost is that a derived expectation is a function of
 * the thing under test, so every such test is a *consistency* check and is satisfied by moving both
 * sides together. Consistency checks cannot hold this file. Something has to read it from outside,
 * and this is that thing.
 *
 * ## What it holds
 *
 * 1. **No Latin prose in a value.** The same `latinLeft` and the same `ALLOWED` list the orphan
 *    gate uses, shared in `i18n/latin.ts` so that a name allowed on one surface is allowed on
 *    both — read over the *literal text* of each value, with ICU syntax removed. Removing the
 *    syntax rather than allow-listing the values that contain it is the whole reason `{date}:
 *    {orders}` and `{n, plural, one {# позиция} …}` need no entry anywhere: an argument's name and
 *    `plural`'s keywords are syntax, and «# позиция» is a sentence and is read.
 * 2. **Every value carries Cyrillic**, bar five named exceptions. Weaker than rule 1 for finding
 *    English, and kept for the one thing rule 1 cannot see: a sentence replaced by a placeholder,
 *    an empty string or a number.
 * 3. **The copy contract's mechanisable rules** — `docs/design/02b-copy-ru.md`, which outranks
 *    anything written here. Its «Терминология» table is a list of words this product does not use;
 *    a table of forbidden words is a regex, so it is one. The editorial rules that are about
 *    *typography* — «ёлочки», «—», the bound short prepositions — are the same. The ones that are
 *    about *judgement* («errors say what happened and what to do», «empty states are an
 *    invitation») are not mechanisable and are not attempted; they are the reason the contract is a
 *    document read by a person.
 * 4. **Key parity with `en.json`.** `en.json` is on no route (`i18n/request.ts` pins `ru`) and is
 *    read by one assertion in `lib/api.test.ts`, which covers its `errors` block and says in its
 *    own comment that "the other ~300 leaf keys still match by care rather than by gate". A
 *    fallback file with holes in it is worse than no fallback file. 303 = 303 today.
 *
 * ## What it does NOT hold
 *
 * - **Whether a Russian sentence is the *right* Russian sentence.** A value reworded into fluent,
 *   contract-obeying, wrong Russian passes every rule here. Seventeen strings whose wording a
 *   contract fixes are pinned as literals in `glossary.test.ts`, which is the only instrument for
 *   this and does not generalise: it works because somebody transcribed a table from a document.
 * - **Keys.** That a key exists is the compiler's since `apps/web/messages.d.ts` declared the
 *   dictionary's type; every `t()` call site is checked against this file.
 * - **`en.json`'s values.** Only its key set is read. It is English on purpose.
 * - **The other three homes of user-visible text**: `apps/api/src/lib/ru.ts` (guarded against this
 *   file by `apps/api/src/lib/ru.dictionary.test.ts`), `apps/api/src/lib/rush.ts`, and the seed.
 *
 * The last test is what keeps all of the above honest: it points the same two scans at a fixture
 * that plants one of each shape and asserts they find every one. Without it, a scan that returned
 * `[]` unconditionally would pass — which is the defect this milestone found ten times, and the
 * one that a gate over an *absence* is built to produce.
 */

interface Leaf {
  path: string;
  value: string;
}

/** Every string in the dictionary, with the dotted path that reaches it. Array items are indexed. */
export function leaves(node: unknown, path: readonly string[] = []): Leaf[] {
  if (typeof node === 'string') return [{ path: path.join('.'), value: node }];
  if (Array.isArray(node))
    return node.flatMap((item, index) => leaves(item, [...path, `${index}`]));
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]));
  }
  return [];
}

/**
 * The text of an ICU message with its syntax removed and its sub-messages kept — what a reader
 * actually sees.
 *
 * Written as a parser rather than as a regex over `{…}` because the two have opposite failure
 * modes. A regex that strips balanced braces would delete «# позиция» along with `plural`, and the
 * sentences inside a plural are the ones most likely to be left in English. A regex that strips
 * only the argument head cannot find the head without counting braces anyway. Twenty lines of
 * counting is the honest form, and the fixture below is what proves it counts.
 *
 * Deliberately not implemented: ICU's apostrophe quoting (`'{'` for a literal brace). No value in
 * this dictionary uses it, rule 3 forbids the ASCII apostrophe outright, and a quoted brace would
 * at worst make this scan read syntax as text — the fail-*closed* direction.
 */
export function icuText(message: string): string {
  let out = '';
  let i = 0;
  const at = (k: number): string => message.charAt(k);
  /** Everything up to `,` or `}`: an argument's name, its type, or a `select`/`plural` keyword. */
  const readToken = (): string => {
    const start = i;
    while (i < message.length && at(i) !== ',' && at(i) !== '}') i += 1;
    return message.slice(start, i).trim();
  };
  const readMessage = (nested: boolean): void => {
    while (i < message.length) {
      const ch = at(i);
      if (nested && ch === '}') return;
      if (ch === '{') {
        readArgument();
        continue;
      }
      out += ch;
      i += 1;
    }
  };
  const readArgument = (): void => {
    i += 1; // the '{'
    readToken(); // the argument's name — `date`, `n`, `orders`: never read out
    if (at(i) === '}') {
      i += 1;
      return;
    }
    i += 1; // the ',' after the name
    const type = readToken();
    if (at(i) === '}') {
      i += 1; // `{n, number}` — a type and no options
      return;
    }
    i += 1; // the ',' after the type
    if (type === 'plural' || type === 'selectordinal' || type === 'select') {
      // `one {…} few {…} other {…}`, possibly after `offset:1`. The keywords are syntax; every
      // braced sub-message is a sentence somebody reads.
      while (i < message.length && at(i) !== '}') {
        if (at(i) === '{') {
          i += 1;
          readMessage(true);
          i += 1; // the sub-message's '}'
          continue;
        }
        i += 1; // a keyword, an offset, or the spaces between them
      }
      i += 1; // the argument's '}'
      return;
    }
    // A style argument — `{amount, number, ::currency/RUB}`. Skip to the matching brace.
    let depth = 1;
    while (i < message.length && depth > 0) {
      if (at(i) === '{') depth += 1;
      else if (at(i) === '}') depth -= 1;
      i += 1;
    }
  };
  readMessage(false);
  return out;
}

/**
 * The five values that carry no Cyrillic, every one of them measured rather than assumed. Each is
 * a name, a clock or pure ICU syntax — never a sentence — and a sixth arriving is a decision that
 * a Russian reader meets a string with no Russian in it.
 */
const NO_CYRILLIC = [
  'landing.brand', // «Little Furnace», the restaurant's name, covered by ALLOWED
  'landing.hours.weekdaysTime', // «12:00 — 23:00»
  'landing.hours.weekendTime',
  'landing.hours.sundayTime',
  'admin.week.day', // «{date}: {orders}» — two placeholders and a colon
];

/**
 * The copy contract, mechanised. Each row is a rule from `docs/design/02b-copy-ru.md` that can be
 * decided by looking at the string, and nothing else is here.
 *
 * The "Не" column of «Терминология» is transcribed whole rather than sampled: the contract names
 * these words as the ones this product does not use, so the guard is the table.
 */
const CONTRACT: ReadonlyArray<{ rule: string; find: RegExp }> = [
  // «QR-код», never «QR код», never «куар».
  { rule: 'QR-код is hyphenated, never spaced', find: /QR[\s\u00a0]+код/i },
  { rule: 'QR-код is not spelled out as «куар»', find: /куар/i },
  // The rest of the «Терминология» table's forbidden column. «rush» and «борд» are Latin and
  // Cyrillic spellings of the same refusal; the Latin one is rule 1's.
  { rule: 'a table is «стол», never «столик» or «таблица»', find: /столик|таблиц/i },
  { rule: 'an order line is «тикет», never «билет» or «талон»', find: /билет|талон/i },
  { rule: 'the board is «доска заказов», never «канбан» or «борд»', find: /канбан|борд/i },
  { rule: 'a note is «заметка», never «комментарий» or «пожелание»', find: /комментари|пожелани/i },
  { rule: 'a busy spell is «час пик», never «наплыв»', find: /наплыв/i },
  { rule: 'a table’s sitting is «смена», never «сессия»', find: /сесси/i },
  { rule: 'a line of an order is «позиция», never «айтем» or «товар»', find: /айтем|товар/i },
  // Typography.
  { rule: '«ёлочки» for quotes — no ASCII straight quote or apostrophe', find: /["']/ },
  { rule: '«—» for a dash — no spaced ASCII hyphen', find: /(?<=\s)-(?=\s)/ },
];

/**
 * Prepositions of one or two letters. The contract binds these to the word that follows with
 * U+00A0, so that «на столе» cannot break across a line with «на» left hanging.
 *
 * **Not the first word of a value**, which is the one exception and the reason this rule can be
 * mechanical at all: a value's first word has nothing before it on its line, so it cannot be
 * orphaned, and `kitchen.notice.forbidden` opens «У вас нет прав…» with a plain space. That is the
 * only occurrence in the dictionary — measured — so the exception is one string wide and stated
 * rather than allow-listed by path, because the reasoning applies to any string, not to that one.
 *
 * Particles and conjunctions («не», «и», «а», «же») are deliberately absent: the contract binds
 * prepositions, and «Аллергены не указаны» is correct as written.
 */
const PREPOSITIONS = new Set([
  'в',
  'к',
  'с',
  'у',
  'о',
  'об',
  'на',
  'за',
  'по',
  'из',
  'от',
  'до',
  'ко',
  'со',
  'во',
]);
/** A one- or two-letter Cyrillic word after a break, followed by a *plain* space. `\s` already
 *  covers U+00A0, so a word that is correctly bound is never even a candidate. */
const PREPOSITION_AT =
  /(?:^|(?<=[\s(\u00ab\u201e\u2014]))([\u0410-\u042f\u0430-\u044f\u0401\u0451]{1,2}) /gu;

export interface Violation {
  path: string;
  rule: string;
  value: string;
}

/** Rules 1 and 2: the language of every value. */
export function scanLanguage(dictionary: unknown, noCyrillic: readonly string[]): Violation[] {
  const found: Violation[] = [];
  for (const { path, value } of leaves(dictionary)) {
    const text = icuText(value);
    if (latinLeft(text)) found.push({ path, rule: 'Latin prose in a value', value });
    if (!noCyrillic.includes(path) && !/[А-Яа-яЁё]/u.test(text)) {
      found.push({ path, rule: 'no Cyrillic in a value', value });
    }
  }
  return found;
}

/** Rule 3: the copy contract, over the whole value — its ICU syntax carries no Russian. */
export function scanContract(dictionary: unknown): Violation[] {
  const found: Violation[] = [];
  for (const { path, value } of leaves(dictionary)) {
    for (const { rule, find } of CONTRACT) {
      if (find.test(value)) found.push({ path, rule, value });
    }
    for (const match of value.matchAll(PREPOSITION_AT)) {
      const word = match[1] ?? '';
      if (match.index > 0 && PREPOSITIONS.has(word.toLowerCase())) {
        found.push({ path, rule: `«${word}» is bound to the next word with U+00A0`, value });
      }
    }
  }
  return found;
}

/**
 * One of every shape the two scans exist to catch, and the near misses they must leave alone. One
 * rule per string, so an expectation below names one rule and a second finding on the same path is
 * a failure rather than a footnote. U+00A0 is built from its code point, as everywhere else in this
 * repository, so the bound spaces in `left.names` are visible in source and survive a diff.
 */
const NBSP = String.fromCharCode(0xa0);
const FIXTURE = {
  caught: {
    plain: 'Add to basket',
    inPlural: '{n, plural, one {# item} few {# позиции} many {# позиций} other {# позиции}}',
    empty: '',
    placeholderOnly: '{name}',
    spacedQr: 'Отсканируйте QR код',
    wrongNoun: 'Этот столик сейчас недоступен.',
    straightQuote: 'Уберите "Лепёшку".',
    spacedHyphen: 'Заказ - оформлен.',
    loosePreposition: 'Отсканируйте код на столе.',
  },
  left: {
    names: `Меню · Little Furnace — заказ со${NBSP}стола по${NBSP}QR-коду`,
    icuArgumentNames: '{date}: {orders}',
    icuKeywords: '{n, plural, one {# позиция} few {# позиции} many {# позиций} other {# позиции}}',
    firstWordPreposition: 'У вас нет прав переместить № {number}.',
    russian: 'Добавить',
  },
};

/**
 * The fixture's own exceptions, and they are its second point: `placeholderOnly` and
 * `icuArgumentNames` are the two shapes that carry no Russian without being wrong, and
 * `admin.week.day` is the second of them in the dictionary itself.
 */
const FIXTURE_NO_CYRILLIC = ['caught.placeholderOnly', 'left.icuArgumentNames'];

describe('the dictionary, read from outside itself', () => {
  it('is reading the whole file, so an empty finding means something', () => {
    // Three negative assertions follow, and a walk that found nothing would satisfy all of them
    // for the wrong reason. 250 is well under the count today (303) and well over anything a
    // broken walk would return.
    expect(leaves(ru).length).toBeGreaterThan(250);
  });

  it('has no Latin prose and no value without Russian in it', () => {
    // `toEqual([])` rather than a count: a failure has to name the path, the rule and the string,
    // or the next person reads "expected 3 to be 0" and goes looking through 303 leaves by hand.
    expect(scanLanguage(ru, NO_CYRILLIC)).toEqual([]);
  });

  it('names the five values that carry no Russian, and no others', () => {
    // The exception list read the other way round: an entry that stops being an exception is dead
    // copy in a guard, and dead copy in a guard is how an allow-list quietly becomes a blanket.
    const dictionaryLeaves = new Set(leaves(ru).map((leaf) => leaf.path));
    expect(NO_CYRILLIC.filter((path) => !dictionaryLeaves.has(path))).toEqual([]);
    expect(scanLanguage(ru, []).map((violation) => violation.path)).toEqual(NO_CYRILLIC);
  });

  it('obeys the copy contract’s mechanisable rules', () => {
    expect(scanContract(ru)).toEqual([]);
  });

  it('holds the same keys as the English fallback file', () => {
    // Both directions, whole paths: `en.json` is on no route, so nothing else in this repository
    // would ever notice it losing a key or growing one this build cannot reach.
    expect(leaves(en).map((leaf) => leaf.path)).toEqual(leaves(ru).map((leaf) => leaf.path));
  });

  it('still finds every shape it exists to catch, and leaves the near misses alone', () => {
    const violations = [...scanLanguage(FIXTURE, FIXTURE_NO_CYRILLIC), ...scanContract(FIXTURE)];
    const at = (path: string) => violations.filter((violation) => violation.path === path);
    // Rule 1 — Latin, written plainly and written inside a plural's sub-message. The second is
    // what a regex over `{…}` would have deleted along with the syntax. An English sentence
    // trips rule 2 as well, and that is the honest reading: it has no Russian in it either.
    expect(at('caught.plain').map((v) => v.rule)).toEqual([
      'Latin prose in a value',
      'no Cyrillic in a value',
    ]);
    expect(at('caught.inPlural').map((v) => v.rule)).toEqual(['Latin prose in a value']);
    // Rule 2 alone — a sentence replaced by nothing at all. `placeholderOnly` is in this
    // fixture's exception list, which is how that list is proved to be read rather than ignored.
    expect(at('caught.empty').map((v) => v.rule)).toEqual(['no Cyrillic in a value']);
    expect(at('caught.placeholderOnly')).toEqual([]);
    // Rule 3 — the contract, one row at a time.
    expect(at('caught.spacedQr').map((v) => v.rule)).toEqual([
      'QR-код is hyphenated, never spaced',
    ]);
    expect(at('caught.wrongNoun').map((v) => v.rule)).toEqual([
      'a table is «стол», never «столик» or «таблица»',
    ]);
    expect(at('caught.straightQuote').map((v) => v.rule)).toEqual([
      '«ёлочки» for quotes — no ASCII straight quote or apostrophe',
    ]);
    expect(at('caught.spacedHyphen').map((v) => v.rule)).toEqual([
      '«—» for a dash — no spaced ASCII hyphen',
    ]);
    expect(at('caught.loosePreposition').map((v) => v.rule)).toEqual([
      '«на» is bound to the next word with U+00A0',
    ]);
    // And the near misses: an allow-listed name, an ICU argument's Latin name, `plural`'s Latin
    // keywords, a preposition that opens a string, and ordinary Russian.
    for (const path of Object.keys(FIXTURE.left)) expect(at(`left.${path}`)).toEqual([]);
    // Exactly nine: a case planted in the fixture without an expectation here is a case the scans
    // are not proven to catch, and this is what makes that a failure rather than a silence.
    expect(violations).toHaveLength(9);
  });
});
