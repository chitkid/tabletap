// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * One rule, mechanised: **a needle that has been through `plain()` must never be compared against a
 * raw text property.**
 *
 * `plain()` exists because `@testing-library/dom` normalises U+00A0 in the *element* and leaves the
 * expected string alone — so `toHaveTextContent` and `getByText` need a plain-spaced needle. A raw
 * `.textContent` has had nothing done to it and still carries the dictionary's U+00A0, so the same
 * needle can never be found in it:
 *
 * ```
 * raw.includes(plain(raw)) === false
 * ```
 *
 * In a *positive* assertion that goes red on the first run and someone fixes it. In a **negative**
 * one it passes forever, and the test reads as if it forbids something it cannot see. That is what
 * `login-form.test.tsx` shipped — the eighth instance of this defect class in this milestone, and
 * the first inside the task whose whole purpose was to stop shipping them. The rule was known and
 * written down at the top of the very file that broke it; what was missing was anything that
 * *checks the instrument*, which is what this is.
 *
 * Deliberately narrow. It does not try to judge whether any given comparison is correct — only to
 * refuse the one combination that is silently unfalsifiable. The reverse mistake (a raw
 * U+00A0-bearing needle handed to `toHaveTextContent`) fails loudly on the first run and needs no
 * gate.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const ROOT = resolve(WEB, '../..');
const posix = (p: string) => p.split('\\').join('/');

/** Properties that hand back text exactly as the DOM holds it, U+00A0 and all. */
const RAW_TEXT = /\.(textContent|innerText|innerHTML|nodeValue|data)\b/;
/** The helper every file in this suite names identically; `plain(` is the whole signature. */
const NORMALISER = /\bplain\s*\(/;

interface Finding {
  file: string;
  line: number;
  text: string;
}

function testFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === '.next') continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.test\.tsx?$/.test(path)) out.push(posix(path));
    }
  };
  walk(dir);
  return out;
}

/** The outermost call of an `expect(…)` chain: `expect(x).not.toContain(y)` → that whole call. */
function matcherCallOf(expectCall: ts.CallExpression): ts.CallExpression | null {
  let node: ts.Node = expectCall;
  while (
    node.parent !== undefined &&
    (ts.isPropertyAccessExpression(node.parent) ||
      (ts.isCallExpression(node.parent) && node.parent.expression === node))
  ) {
    node = node.parent;
  }
  return node !== expectCall && ts.isCallExpression(node) ? node : null;
}

export function findMixedNormalisation(files: readonly string[]): Finding[] {
  const found: Finding[] = [];
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.ES2022,
      true,
      /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'expect' &&
        node.arguments.length > 0
      ) {
        const subject = node.arguments[0];
        const matcher = matcherCallOf(node);
        if (
          subject !== undefined &&
          matcher !== null &&
          RAW_TEXT.test(subject.getText(source)) &&
          matcher.arguments.some((argument) => NORMALISER.test(argument.getText(source)))
        ) {
          const { line } = source.getLineAndCharacterOfPosition(matcher.getStart(source));
          found.push({
            file: posix(file).replace(posix(ROOT) + '/', ''),
            line: line + 1,
            text: matcher.getText(source).replace(/\s+/g, ' '),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

const SUITE = [
  ...testFilesUnder(join(WEB, 'app')),
  ...testFilesUnder(join(WEB, 'components')),
  ...testFilesUnder(join(WEB, 'lib')),
  ...testFilesUnder(resolve(ROOT, 'packages/ui/src')),
];

describe('the U+00A0 normalisation rule', () => {
  it('finds no plain()-ed needle compared against a raw text property', () => {
    // `toEqual([])` rather than a count: a failure has to name the file, the line and the whole
    // assertion, because the fix is never obvious from the matcher alone.
    expect(findMixedNormalisation(SUITE)).toEqual([]);
  });

  it('is scanning files at all, so an empty result means something', () => {
    // The rule above is a negative assertion over a list, and a list this walk failed to build
    // would satisfy it for the wrong reason. Twenty is well under the count today and well over
    // anything a broken walk would return.
    expect(SUITE.length).toBeGreaterThan(20);
  });

  it('still catches the shape login-form.test.tsx shipped', () => {
    const fixture = posix(join(HERE, '__fixtures__', 'mixed-normalisation-fixture.ts'));
    const found = findMixedNormalisation([fixture]);
    // The two assertions by their own text rather than by line, so a comment edit in the fixture
    // does not read as a gate failure. Exactly two: the negative form that shipped and its
    // positive twin. The fixture also holds three *correct* shapes, and this count is what says
    // they were left alone.
    expect(found.map((finding) => finding.text)).toEqual([
      'expect(element.textContent).not.toContain(plain(message))',
      'expect(element.innerHTML).toContain(plain(message))',
    ]);
  });
});
