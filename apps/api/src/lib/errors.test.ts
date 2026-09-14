import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * One invariant over every `AppError` this API raises: **the key and the English sentence are a
 * bijection.** One key never carries two sentences, and one sentence never carries two keys.
 *
 * Neither half is tidiness.
 *
 * *One key, two sentences* is the drift the message key exists to prevent. A key is what the web
 * renders; if two call sites that mean different things end up under one key, the Russian can only
 * describe one of them, and the other silently starts lying. That is the failure the brief names —
 * nine `NOT_FOUND` messages collapsed into one «Не найдено» — reappearing one key at a time.
 *
 * *One sentence, two keys* is the more dangerous direction, and it is why this test is here rather
 * than in a linter. Several refusals in this API are identical **on purpose**: a stranger's order
 * and an order that never existed both answer `orderNotFound`, and every role check answers
 * `noAccess` without naming what it refused. Those coincidences are an access-control property —
 * they are what stops a caller telling "does not exist" from "exists, not yours", and "no such
 * table" from "not yours to edit". Splitting such a key by call site, in the ordinary course of
 * making a refusal more helpful, would reopen the oracle while every other test stayed green. This
 * is the thing that goes red when someone does.
 *
 * **Seen red before it was believed**, both halves, in the working tree and then reverted:
 * rewording one of `routes/menu.ts`'s twenty `noAccess` refusals to "You may not edit the menu."
 * failed the first; re-keying `lib/payments.ts`'s "Order not found." to `tableNotFound` failed the
 * second (and the first, since that key then carried two sentences too).
 *
 * **What it does not see**, because both arguments have to be literals for a pair to be read at
 * all: two call sites pass computed values, and they are asserted by count below rather than left
 * to vanish quietly.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..');
const posix = (p: string) => p.split('\\').join('/');

interface Raise {
  file: string;
  line: number;
  key: string;
  message: string;
}

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules') continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      // Production sources only. The invariant is about what this API *sends*; a fixture raising
      // an `AppError` with a made-up sentence under a real key is not a refusal anyone receives,
      // and counting it would turn the guard into noise the first time a test needed one.
      else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) out.push(posix(path));
    }
  };
  walk(dir);
  return out;
}

/** A string or template literal's text; `null` for anything computed. */
function literalText(node: ts.Node, source: ts.SourceFile): string | null {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  // A template with holes: its source text, so `This order is ${current} now.` stays one shape.
  if (ts.isTemplateExpression(node)) return node.getText(source);
  return null;
}

function collect(files: readonly string[]): { pairs: Raise[]; computed: Raise[] } {
  const pairs: Raise[] = [];
  const computed: Raise[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'AppError'
      ) {
        const args = node.arguments ?? [];
        const keyNode = args[2];
        const messageNode = args[3];
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        const where = {
          file: posix(file).slice(posix(SRC).length + 1),
          line: line + 1,
        };
        const key = keyNode === undefined ? null : literalText(keyNode, source);
        const message = messageNode === undefined ? null : literalText(messageNode, source);
        if (key === null || message === null)
          computed.push({ ...where, key: key ?? '<computed>', message: message ?? '<computed>' });
        else pairs.push({ ...where, key, message });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { pairs, computed };
}

const { pairs, computed } = collect(sourceFilesUnder(SRC));

/**
 * Everything that shares `by` but disagrees on `of`, with the call sites that disagree — the fix
 * is never obvious from the two values alone, and a finding that does not say where is a second
 * search rather than a report.
 */
const disagreements = (by: 'key' | 'message', of: 'key' | 'message') => {
  const map = new Map<string, Raise[]>();
  for (const raise of pairs) map.set(raise[by], [...(map.get(raise[by]) ?? []), raise]);
  return [...map]
    .filter(([, raises]) => new Set(raises.map((raise) => raise[of])).size > 1)
    .map(([shared, raises]) => ({
      [by]: shared,
      [of]: raises.map((raise) => `${raise[of]} (${raise.file}:${raise.line})`),
    }));
};

describe('every AppError’s key and sentence', () => {
  it('is scanning the whole API, so an empty finding means something', () => {
    // Two negative assertions follow, and a walk that found nothing would satisfy both for the
    // wrong reason. Fifty is well under the count today and well over anything a broken walk
    // would return.
    expect(pairs.length).toBeGreaterThan(50);
  });

  it('never puts two different sentences under one key', () => {
    expect(disagreements('key', 'message')).toEqual([]);
  });

  /**
   * The access-control half. A sentence that two call sites share is a refusal they answer
   * identically on purpose; giving one of them its own key is how that stops being true.
   */
  it('never splits one sentence across two keys', () => {
    expect(disagreements('message', 'key')).toEqual([]);
  });

  /**
   * The two calls whose arguments are not literals, named so the hole in the scan is a decision
   * rather than an absence: `guest.ts` chooses between an expired and an invalid QR code with a
   * pair of matched ternaries, and `menu-admin.ts` looks both halves up in `UPLOAD_REFUSALS`,
   * where the key and the sentence sit in one object and cannot drift apart.
   */
  it('leaves exactly the two computed call sites unread', () => {
    // By file rather than by line: a comment edit above one of them is not a gate failure, and a
    // third computed site anywhere still changes this list.
    expect(computed.map((raise) => raise.file)).toEqual(['lib/menu-admin.ts', 'routes/guest.ts']);
  });
});
