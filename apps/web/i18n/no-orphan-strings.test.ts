// @vitest-environment node
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The gate against orphan strings: Latin text still reachable by a guest or a member of staff on a
 * product whose interface is Russian.
 *
 * ## What it reads
 *
 * Every component source on the four surfaces — `apps/web/app`, `apps/web/components` and
 * `packages/ui/src` — parsed with the TypeScript compiler rather than with a regex over the file,
 * because the positions that matter are syntactic and a regex cannot tell an `aria-label` from a
 * `data-slot`. Three passes, in order:
 *
 * 1. **Written.** JSX text nodes, the four named text attributes (`aria-label`, `alt`, `title`,
 *    `placeholder`, plus the three sibling ARIA text properties), and string or template literals
 *    sitting directly in a JSX children position. Any Latin word of two letters or more is a
 *    finding here — in these positions there is no such thing as an innocent English word.
 *
 * 2. **Derived — tables.** Every other prose-shaped string literal in the file, wherever it sits.
 *    This is the pass that matters: `const MESSAGE_BY_STATUS = { 401: 'That email and password…' }`
 *    rendered as `{status.message}` is a screen of English that no JSX text node carries, and a
 *    scan that only reads JSX positions passes it. "Prose-shaped" means the string holds two or
 *    more bare Latin words, or is a single capitalised word on its own — which is what separates
 *    «Sign in» from a Tailwind class list, an HTTP method or a route.
 *
 * 3. **Derived — unions.** The *type* of every value reaching a JSX children position or one of
 *    the text attributes. A string-literal union rendered straight into the interface —
 *    `{order.status}`, where `OrderStatus` is `'draft' | 'placed' | …` declared in
 *    `packages/shared` — puts English on screen with no string literal anywhere in the component.
 *    Only the type checker can see it, so the gate runs one.
 *
 * ## What it does NOT see, deliberately
 *
 * - **English arriving over the wire.** The API's refusals, better-auth's messages and Stripe's
 *   product names are never in this source tree, so a source scan cannot see them *by
 *   construction*. Widening this gate to chase them would mean asserting on strings that live in
 *   another process. Do not read a green run here as "no English reaches the screen" — read it as
 *   "no English is written or derived in a component".
 *
 *   Task 12 answered them a different way, and the answer is not a wider scan: every refusal the
 *   API raises now carries an `ErrorMessageKey` beside its English sentence, and the web renders
 *   the key through `errors.*` in the dictionary. What guards it is a set-equality test in
 *   `apps/web/lib/api.test.ts` (every key the API can send has a Russian sentence, and no sentence
 *   is dead copy) plus the bijection test in `apps/api/src/lib/errors.test.ts`.
 *
 * - **Modules that are not components.** `apps/web/lib/**`, `apps/api/**` and `packages/shared/**`
 *   are not walked. The one user-visible English sentence that used to live there —
 *   `apps/web/lib/demo-links.ts`'s `UNAVAILABLE`, the landing's fallback notice — is gone: that
 *   module now hands the landing a key (`unreachable`) and `LandingContent` looks up the words.
 *   Nothing in this paragraph is a guarantee that the next such string will be caught here; it
 *   will not be, and `landing-content.test.tsx` is where the landing's notice is now pinned.
 *
 * - **Content, as opposed to copy.** Dish names, category names and the restaurant's name come out
 *   of `packages/db`'s seed and the database. A Russian interface can still be filled with English
 *   data, and nothing here would notice.
 *
 * - **Anything the checker has already widened to `string`.** A value assembled at runtime, or read
 *   from a module outside the walk, is `string` by the time it reaches JSX, and `string` holding
 *   English is indistinguishable from `string` holding Russian. Pass 2 covers the common shape of
 *   that — the table written in the file — and nothing covers the rest.
 *
 *   **The sharpest form of this, because it is where the two derived passes cancel each other
 *   out:** a *single lowercase* English word reached through a widened lookup. Given
 *   `const SERVER_STATE: Record<string, string> = { down: 'unavailable' }`, rendering
 *   `{SERVER_STATE.down}` is missed by pass 3 (the annotation widened the literal type away) and by
 *   pass 2 (`isProse` wants two bare Latin words, or one that is capitalised). Drop the annotation
 *   — or write the same word straight into the JSX — and both catch it. The hole is narrow and it
 *   is deliberate: widening `isProse` to single lowercase words would flag most of the Tailwind in
 *   the repository.
 *
 * - **Positions skipped by name.** `className`/`class`, the arguments of `cn`/`cva`/`clsx`, `seed`
 *   (documented on `Plate` as an identity that is never rendered), `id`/`htmlFor`/`key`, the
 *   message of a `console.*` call, and the first argument of the error constructors named in
 *   `ERROR_CONSTRUCTORS`. English parked under one of those names is invisible. That is the price
 *   of pass 2 not drowning in Tailwind and stack traces.
 *
 *   Two of these skips were wider than their comments claimed, and both were found by review
 *   rather than by this file's own fixture:
 *   - the comparison skip covered *every* binary operator, so a sentence built with `+` was
 *     invisible to all three passes at once. It is now equality operators only, and case 9 of the
 *     fixture is that sentence.
 *   - the diagnostic skip covered *every* `new` expression, so `new Notification('Your order is
 *     ready')` was invisible. It is now the error constructors by name.
 *
 * - **Text drawn rather than laid out.** `apps/web/app/opengraph-image.tsx` and the printed QR
 *   sheet compose strings for an image; their literals are read like any others, but what they
 *   compose at runtime is not.
 *
 * - **A file the TypeScript program never loaded.** `scan()` can only read what the program has.
 *   The first test asserts that every file the walk found is a file the program holds, so a future
 *   `exclude` in `apps/web/tsconfig.json` cannot quietly take a directory out of the gate and
 *   leave a green run behind it.
 *
 * The second test is the one that keeps all of the above honest: it points the same scanner at
 * `__fixtures__/orphan-strings-fixture.tsx`, which plants one of each shape, and asserts it finds
 * every one of them. Without it, a scanner that returned `[]` unconditionally would pass. Every
 * entry in the list above that is a *decision* rather than an oversight has a line in the fixture
 * or a sentence here saying so; the two that were oversights are named as such.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
const ROOT = resolve(WEB, '../..');
const posix = (p: string) => p.split('\\').join('/');

/**
 * «TableTap» is the product, «Little Furnace» the restaurant, and a technology is called what its
 * makers call it — docs/design/02b-copy-ru.md, «Терминология». Typeface names are in the same
 * class: `opengraph-image.tsx` registers its faces with Satori by name. Nothing else belongs here;
 * an addition to this list is a decision that a Russian reader will meet a Latin word.
 */
const ALLOWED = [
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
];

/** Attributes whose value is read out or shown to somebody, as opposed to consumed by the browser. */
const TEXT_ATTRS = new Set([
  'aria-label',
  'alt',
  'title',
  'placeholder',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
]);

/** Calls whose string arguments are class lists or selectors, never words anybody reads. */
const SKIP_CALLS = new Set([
  'cn',
  'cva',
  'clsx',
  'twMerge',
  'querySelector',
  'querySelectorAll',
  'closest',
  'matches',
  'getAttribute',
  'setAttribute',
  'getPropertyValue',
]);

/** Constructors whose first argument is a message for a developer, not for a guest. */
const ERROR_CONSTRUCTORS = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AggregateError',
  'ApiError',
]);

/** Props whose value is a class list, an id or a seed — never a word on screen. */
const SKIP_PROPS = new Set(['className', 'class', 'seed', 'id', 'htmlFor', 'key']);

/** Strip the allow-listed names, then ask whether any Latin is left. Longest first, so that
 *  «PT Sans Narrow Latin» is spent before «PT Sans Narrow» can leave «Latin» behind. */
function latinLeft(text: string): boolean {
  let rest = text;
  for (const name of ALLOWED) rest = rest.split(name).join(' ');
  return /[A-Za-z]{2}/.test(rest);
}

/** A bare Latin word: letters, one optional internal apostrophe, optional trailing punctuation.
 *  A Tailwind token («min-h-7», «text-sm»), a route, a media type or a header name is not one. */
const PROSE_WORD = /^[A-Za-z]+(?:['\u2019][A-Za-z]+)?[.,!?;:\u2026)]*$/;

function isProse(raw: string): boolean {
  const text = raw.trim();
  if (text.length === 0 || !latinLeft(text)) return false;
  const words = text.split(/\s+/).filter((word) => PROSE_WORD.test(word));
  if (words.length >= 2) return true;
  // A single word is prose only if it is capitalised and alone: «Close», «Email», «Escape» — but
  // not «flex», not «POST», and not one lowercase word sitting in a longer technical string.
  return words.length === 1 && words[0] === text && /^[A-Z][a-z]{2,}/.test(text);
}

export interface Finding {
  file: string;
  line: number;
  kind: 'jsx-text' | 'text-attribute' | 'literal-table' | 'rendered-union';
  text: string;
}

function attributeName(node: ts.JsxAttribute, source: ts.SourceFile): string {
  return node.name.getText(source);
}

/** Every literal chunk of a template, so `` `Signed in as ${name}` `` is not a blind spot. */
function templateChunks(node: ts.Node): string[] {
  if (!ts.isTemplateExpression(node)) return [];
  return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
}

function literalUnionMembers(type: ts.Type): string[] {
  const parts = type.isUnion() ? type.types : [type];
  return parts.filter((part) => part.isStringLiteral()).map((part) => part.value);
}

/** True when this literal sits somewhere no reader will ever meet it. */
function inSkippedPosition(node: ts.Node, source: ts.SourceFile): boolean {
  const parent = node.parent;
  if (parent === undefined) return false;
  // `'use client'` and friends: a directive prologue is a statement, not a word on screen.
  if (ts.isExpressionStatement(parent) && ts.isSourceFile(parent.parent)) return true;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isImportTypeNode(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent)) return true;
  // `event.key === 'Escape'`, `case 'Escape':` — a comparison against a DOM constant.
  //
  // **Equality only.** This used to skip every `ts.isBinaryExpression`, which meant `+` as well,
  // and a sentence built with `+` is invisible to all three passes at once: it is not a
  // `StringLiteralLike` expression (pass 1 misses it), it is `string` by the time the checker sees
  // it (pass 3 misses it), and every literal in it was skipped right here (pass 2 missed it).
  // `{'Signed in as ' + name + ' member of staff'}` in a JSX children position left the gate at
  // 3 passed.
  if (ts.isCaseClause(parent)) return true;
  if (ts.isBinaryExpression(parent)) {
    const operator = parent.operatorToken.kind;
    return (
      operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      operator === ts.SyntaxKind.EqualsEqualsToken ||
      operator === ts.SyntaxKind.ExclamationEqualsToken
    );
  }
  // An object key is a key, not a message.
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isComputedPropertyName(parent)) return true;
  // A diagnostic is addressed to whoever is reading a stack trace, and this repository's code and
  // comments are English by policy. Narrowed to the error constructors by name: `new Error(…)` is
  // a diagnostic, but `new Notification('Your order is ready')` is copy, and skipping every `new`
  // expression made the second one invisible. (`ts.isThrowStatement` was here too and is
  // unreachable — a bare literal is never the direct parent of a throw's expression in the shapes
  // this repository uses; `throw new Error('…')` is caught by the line below, as the `new`.)
  if (ts.isNewExpression(parent) && ERROR_CONSTRUCTORS.has(parent.expression.getText(source))) {
    return true;
  }
  if (ts.isCallExpression(parent) && parent.expression.getText(source).startsWith('console.')) {
    return true;
  }
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : '';
    if (SKIP_CALLS.has(name)) return true;
  }
  if (ts.isJsxAttribute(parent) && SKIP_PROPS.has(attributeName(parent, source))) return true;
  if (
    ts.isJsxExpression(parent) &&
    ts.isJsxAttribute(parent.parent) &&
    SKIP_PROPS.has(attributeName(parent.parent, source))
  ) {
    return true;
  }
  if (ts.isPropertyAssignment(parent) && SKIP_PROPS.has(parent.name.getText(source))) return true;
  return false;
}

export function scan(program: ts.Program, files: readonly string[]): Finding[] {
  const checker = program.getTypeChecker();
  const wanted = new Set(files.map(posix));
  const found: Finding[] = [];
  const seen = new Set<string>();
  const record = (source: ts.SourceFile, node: ts.Node, kind: Finding['kind'], text: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    const file = posix(source.fileName).replace(posix(ROOT) + '/', '');
    const key = `${file}:${line + 1}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ file, line: line + 1, kind, text: text.trim() });
  };

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !wanted.has(posix(source.fileName))) continue;

    const visit = (node: ts.Node): void => {
      // Pass 1 — written, in a position that is user-visible by construction.
      if (ts.isJsxText(node) && latinLeft(node.text)) record(source, node, 'jsx-text', node.text);

      if (ts.isJsxExpression(node) && node.expression !== undefined) {
        const parent = node.parent;
        const inChildren = ts.isJsxElement(parent) || ts.isJsxFragment(parent);
        const attribute = ts.isJsxAttribute(parent) ? attributeName(parent, source) : null;
        const isTextAttribute = attribute !== null && TEXT_ATTRS.has(attribute);
        if (inChildren || isTextAttribute) {
          const kind: Finding['kind'] = inChildren ? 'jsx-text' : 'text-attribute';
          if (ts.isStringLiteralLike(node.expression) && latinLeft(node.expression.text)) {
            record(source, node, kind, node.expression.text);
          }
          for (const chunk of templateChunks(node.expression)) {
            if (latinLeft(chunk)) record(source, node, kind, chunk);
          }
          // Pass 3 — derived: a string-literal union reaching the screen with no literal here.
          const members = literalUnionMembers(checker.getTypeAtLocation(node.expression));
          const latin = members.filter(latinLeft);
          if (latin.length > 0) record(source, node, 'rendered-union', latin.join(' | '));
        }
      }

      if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(attributeName(node, source))) {
        const value = node.initializer;
        if (value !== undefined && ts.isStringLiteral(value) && latinLeft(value.text)) {
          record(source, node, 'text-attribute', value.text);
        }
      }

      // Pass 2 — derived: a table of prose written anywhere in the file.
      if (ts.isStringLiteralLike(node) && !inSkippedPosition(node, source) && isProse(node.text)) {
        record(source, node, 'literal-table', node.text);
      }
      if (ts.isTemplateExpression(node) && !inSkippedPosition(node, source)) {
        for (const chunk of templateChunks(node)) {
          if (isProse(chunk)) record(source, node, 'literal-table', chunk);
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry === '.next' || entry === '__fixtures__') continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) out.push(posix(path));
    }
  };
  walk(dir);
  return out;
}

const FIXTURE = posix(join(HERE, '__fixtures__', 'orphan-strings-fixture.tsx'));

let program: ts.Program;
let surfaces: string[];

beforeAll(() => {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  };
  const config = ts.getParsedCommandLineOfConfigFile(join(WEB, 'tsconfig.json'), {}, host);
  if (config === undefined) throw new Error('apps/web/tsconfig.json did not parse');
  // `packages/ui/src` is reached through `@tabletap/ui`'s source export anyway, but naming it
  // keeps a component nothing imports yet inside the gate.
  const ui = sourcesUnder(resolve(ROOT, 'packages/ui/src'));
  program = ts.createProgram({
    rootNames: [...config.fileNames.map(posix), ...ui, FIXTURE],
    options: config.options,
  });
  surfaces = [...sourcesUnder(join(WEB, 'app')), ...sourcesUnder(join(WEB, 'components')), ...ui];
}, 60_000);

describe('the orphan-string gate', () => {
  it('finds no Latin text a guest or a member of staff can reach, anywhere on the four surfaces', () => {
    // First that the program actually holds every file the walk found. `scan()` iterates the
    // program and filters by the wanted set, so a file the program never loaded is silently not
    // scanned and this test passes for the wrong reason. Nothing is wrong today — 69 files, 0
    // missing — but an `exclude` added to `apps/web/tsconfig.json`, or a directory moved out of
    // its include globs, would take files out of the gate with no signal at all.
    const loaded = new Set(program.getSourceFiles().map((source) => posix(source.fileName)));
    expect(surfaces.filter((file) => !loaded.has(file))).toEqual([]);
    // `toEqual([])` rather than a length check: a failure has to name the file, the line and the
    // word, or the next person reads "expected 3 to be 0" and goes looking by hand.
    expect(scan(program, surfaces)).toEqual([]);
  });

  it('still fails on a fixture that plants one of every shape it exists to catch', () => {
    const findings = scan(program, [FIXTURE]);
    const at = (text: string) => findings.filter((finding) => finding.text === text);

    // 1 — a JSX text node.
    expect(at('Order summary').map((f) => f.kind)).toEqual(['jsx-text']);
    // 2, 3, 4 — the named text attributes.
    expect(at('Close the basket').map((f) => f.kind)).toEqual(['text-attribute']);
    expect(at('A plate of food').map((f) => f.kind)).toEqual(['text-attribute']);
    expect(at("Today's special").map((f) => f.kind)).toEqual(['text-attribute']);
    expect(at('Anything else?').map((f) => f.kind)).toEqual(['text-attribute']);
    // 5 — a table of sentences rendered through a variable, which is the derived case a
    //     JSX-position-only scan passes.
    expect(at('That email and password do not match.').map((f) => f.kind)).toEqual([
      'literal-table',
    ]);
    expect(at('Too many attempts. Wait a minute and try again.').map((f) => f.kind)).toEqual([
      'literal-table',
    ]);
    // 6, 7 — a union member rendered into a text node and into an accessible name. There is no
    //        string literal in the fixture for either; both are the type checker's alone.
    const unions = findings.filter((finding) => finding.kind === 'rendered-union');
    expect(unions).toHaveLength(2);
    for (const union of unions) expect(union.text).toContain('cooking');
    // 8 — a template literal, which is neither a JSX text node nor a plain string.
    expect(at('Signed in as a guest of table').map((f) => f.kind)).toEqual(['jsx-text']);
    // 9 — a sentence built with `+`, which every pass missed until the binary-expression skip was
    //     narrowed to equality operators. Two fragments, two findings.
    // `record()` trims, so the fragments arrive without the spaces that joined them.
    expect(at('Served by').map((f) => f.kind)).toEqual(['literal-table']);
    expect(at('the usual way').map((f) => f.kind)).toEqual(['literal-table']);
    // And the comparison that skip is actually for is still skipped: `'cooking'` is a DOM-adjacent
    // constant, not copy, and «Готовится» beside it is Russian.
    expect(findings.filter((finding) => finding.text === 'cooking')).toEqual([]);

    // Exactly twelve: a case planted in the fixture without an expectation above is a case the
    // gate is not proven to catch, and this is what makes that a failure rather than a silence.
    expect(findings).toHaveLength(12);
  });

  it('leaves the fixture’s Russian, its allow-listed names and its class list alone', () => {
    const texts = scan(program, [FIXTURE]).map((finding) => finding.text);
    for (const kept of ['Ваш заказ', 'Little Furnace', 'TableTap', 'Next.js', 'flex min-h-7']) {
      expect(texts.filter((text) => text.includes(kept))).toEqual([]);
    }
  });
});
