import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * One invariant over every refusal this API sends: **the key and the English sentence are a
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
 * making a refusal more helpful, would reopen the oracle while every other test stayed green.
 *
 * **The bijection alone does not see that, and this file used to claim it did.** A bijection is a
 * relation, and a relation is preserved by any relabelling: a call site that changes its key *and*
 * its sentence together makes a group of size one on each side and is invisible to both
 * `disagreements` assertions. Changing both together is not an exotic edit — it is what "make this
 * refusal more helpful" looks like. The third assertion, against `SHARED`, is what actually goes
 * red, and it is an external anchor rather than another relation for exactly that reason.
 *
 * **Seen red before it was believed**, six times, in the working tree and then reverted:
 * rewording one of `routes/menu.ts`'s twenty `noAccess` refusals to "You may not edit the menu."
 * failed the first; re-keying `lib/payments.ts`'s "Order not found." to `tableNotFound` failed the
 * second (and the first, since that key then carried two sentences too); and after the walk was
 * widened, giving `GENERIC_4XX[403]` its own key `frameworkForbidden` failed the second while
 * rewording it under the shared key failed the first. The two that prove the third:
 * `routes/orders.ts:74` — the cross-guest order read — re-keyed to `orderNotYours` with its own
 * sentence, and the same line re-keyed to the *existing* `orderNotFound` with its *existing*
 * sentence, which is the variant `tsc` cannot catch either because both halves already exist. The
 * first left this file at 5 passed before the third assertion; both fail it now, and neither
 * touches the other five.
 *
 * ## Two ways a refusal is written here, and both are read
 *
 * Most are `new AppError(code, status, key, message)`. **Nine are not:** eight object literals in
 * `plugins/error-handler.ts` and one in `plugins/auth.ts:41`, which answers on a reply the error
 * handler never sees. Those nine include `GENERIC_4XX`'s 401 and 403 rows — the framework's own
 * refusals, which carry the same keys `plugins/rbac.ts` raises by hand precisely so that a guard's
 * refusal and Fastify's cannot be told apart. That is the single property this file's second
 * assertion exists to hold, and for one commit the walk could not see either row: re-keying
 * `GENERIC_4XX[403]` left the whole API suite green. So the walk reads **both** shapes — the
 * constructor call, and any object literal carrying a `messageKey` and a `message` together.
 *
 * ## What it does not see
 *
 * Written from what the code below does, not from what it was meant to do. Each of these was
 * checked by reading the walk, and the first two are pinned by the last test rather than left to
 * vanish quietly:
 *
 * - **A key or sentence that is not a literal.** Three sites: `routes/guest.ts`'s matched
 *   ternaries, `lib/menu-admin.ts`'s `UPLOAD_REFUSALS` lookup, and `plugins/error-handler.ts`'s
 *   `AppError` relay, which copies both halves off the error it is serialising. They are counted,
 *   not read — and because counting a site is not checking it, `routes/guest.test.ts` and
 *   `lib/menu-admin.test.ts` assert the two real ones' keys directly.
 * - **Whether any key is the *right* one.** This file only holds the mapping consistent. A refusal
 *   keyed `tableNotFound` throughout would satisfy every assertion here.
 * - **An envelope assembled some other way**: spread from a variable, built by a helper, or sent
 *   from outside `apps/api/src`. An object literal needs both property names spelled out, and a
 *   constructor call needs the callee to be the identifier `AppError` — an alias would be missed.
 * - **Anything after a syntax error in the same file.** `ts.createSourceFile` recovers silently
 *   rather than throwing, so the tail is simply not scanned. Such a file fails lint and typecheck
 *   in the same gate run, which is what makes that tolerable.
 * - **Test files, deliberately** — see `sourceFilesUnder`.
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

/** The initialiser of a named property on an object literal, or `undefined` if it has none. */
function propertyOf(node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const property of node.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name
    )
      return property.initializer;
  }
  return undefined;
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
      /** Where the two halves sit, whichever shape this refusal is written in. */
      let halves: { keyNode?: ts.Node; messageNode?: ts.Node } | null = null;
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'AppError'
      ) {
        const args = node.arguments ?? [];
        halves = { keyNode: args[2], messageNode: args[3] };
      } else if (ts.isObjectLiteralExpression(node)) {
        // The hand-built envelopes. Both property names have to be present: `messageKey` alone is
        // no refusal, and `message` alone is some other object - a Zod refinement, a log payload.
        const keyNode = propertyOf(node, 'messageKey');
        const messageNode = propertyOf(node, 'message');
        if (keyNode !== undefined && messageNode !== undefined) halves = { keyNode, messageNode };
      }
      if (halves !== null) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        const where = { file: posix(file).slice(posix(SRC).length + 1), line: line + 1 };
        const key = halves.keyNode === undefined ? null : literalText(halves.keyNode, source);
        const message =
          halves.messageNode === undefined ? null : literalText(halves.messageNode, source);
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
 * **Where every deliberately shared refusal is raised, and how many times, transcribed.**
 *
 * The two `disagreements` assertions below are a *relation* — each groups the pairs by one half
 * and fails only when a group disagrees on the other. A change that moves **both halves at once**
 * makes a group of size one on each side and is invisible to both. That is not an exotic edit: it
 * is the ordinary course of making a refusal more helpful, which is the exact thing the header
 * above says "goes red when someone does". It did not.
 *
 * Proved on the real file: at `routes/orders.ts:74` — the cross-guest order read, the one IDOR
 * boundary a guest can reach — replacing `'noAccess', 'You do not have access to this.'` with
 * `'orderNotYours', 'This order belongs to another guest.'` turned `GET /api/orders/<someone
 * else's id>` into a plain existence oracle and left this file at **5 passed**. A bijection is
 * preserved by any relabelling; it cannot see one.
 *
 * So this is the external anchor, and it is by **file and count**, not by file alone. `noAccess` is
 * raised five times inside `routes/orders.ts`; a set of filenames still contains that file after
 * one of the five moves away, and the mutation above would still pass. The count does not. By file
 * rather than by line so that editing a comment is not a gate failure.
 *
 * Maintaining it is the point rather than the cost: adding a route that answers `noAccess` is a
 * decision about what a caller can tell apart, and it should cost one line here.
 */
const SHARED: Record<string, Record<string, number>> = {
  categoryNotFound: { 'lib/menu-admin.ts': 2 },
  itemChanged: { 'lib/menu-admin.ts': 2 },
  itemNotFound: { 'lib/menu-admin.ts': 3 },
  noAccess: {
    'lib/transitions.ts': 1,
    'plugins/error-handler.ts': 1,
    'plugins/rbac.ts': 1,
    'routes/menu.ts': 8,
    'routes/orders.ts': 5,
    'routes/payments.ts': 1,
    'routes/tables.ts': 4,
  },
  orderNotAwaitingPayment: { 'lib/payments.ts': 1, 'routes/payments.ts': 1 },
  orderNotFound: {
    'lib/payments.ts': 1,
    'lib/transitions.ts': 1,
    'routes/orders.ts': 1,
    'routes/payments.ts': 1,
  },
  restaurantNotConfigured: {
    'lib/dashboard.ts': 1,
    'lib/restaurant.ts': 1,
    'routes/tables.ts': 1,
  },
  routeNotFound: { 'plugins/auth.ts': 1, 'plugins/error-handler.ts': 1 },
  signInRequired: {
    'lib/restaurant.ts': 1,
    'plugins/error-handler.ts': 1,
    'plugins/rbac.ts': 1,
    'routes/socket-token.ts': 1,
  },
  tableChanged: { 'lib/tables-admin.ts': 2 },
  tableNotFound: { 'lib/tables-admin.ts': 2, 'routes/tables.ts': 1 },
  validationFailed: { 'lib/errors.ts': 1, 'plugins/error-handler.ts': 1 },
};

/** Every key raised more than once, and where — the shape `SHARED` is transcribed against. */
const sitesByKey = (): Record<string, Record<string, number>> => {
  const all: Record<string, Record<string, number>> = {};
  for (const raise of pairs) {
    const sites = (all[raise.key] ??= {});
    sites[raise.file] = (sites[raise.file] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(all).filter(([, sites]) => Object.values(sites).reduce((a, b) => a + b, 0) > 1),
  );
};

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

describe('every refusal’s key and sentence', () => {
  it('is scanning the whole API, so an empty finding means something', () => {
    // Two negative assertions follow, and a walk that found nothing would satisfy both for the
    // wrong reason. Fifty is well under the count today and well over anything a broken walk
    // would return.
    expect(pairs.length).toBeGreaterThan(50);
  });

  /**
   * The count a broken *predicate* would pass while the count above still did. Widening the walk
   * to the hand-built envelopes is the fix for a guard that could not see the framework's own 401
   * and 403; dropping the object-literal branch again would leave the three constructor-only
   * assertions green, because the sixty-odd `AppError` sites are untouched by it.
   */
  it('is reading the hand-built envelopes too, not only the constructor calls', () => {
    const handBuilt = pairs.filter(
      (raise) => raise.file === 'plugins/error-handler.ts' || raise.file === 'plugins/auth.ts',
    );
    expect(handBuilt.map((raise) => raise.key).sort()).toEqual([
      'noAccess',
      'notFound',
      'rateLimited',
      'requestNotProcessed',
      'routeNotFound',
      'routeNotFound',
      'serverError',
      'signInRequired',
      'validationFailed',
    ]);
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
   * And the half neither `disagreements` can see: a call site that changes its key **and** its
   * sentence together. See `SHARED` above for the measurement and for why it counts sites rather
   * than listing files.
   */
  it('keeps every deliberately shared refusal shared, whatever it is reworded to', () => {
    // Whole-object equality in both directions: a key that stops being shared vanishes from the
    // left-hand side, and a key that starts being shared appears on it.
    expect(sitesByKey()).toEqual(SHARED);
  });

  /**
   * The three sites whose halves are not literals, named so the hole in the scan is a decision
   * rather than an absence:
   *
   * - `routes/guest.ts` chooses between an expired and an invalid QR code with a pair of matched
   *   ternaries. Counting it proves only that it is there, so `routes/guest.test.ts` asserts both
   *   keys against real responses — transposing the ternary used to leave the whole suite green.
   * - `lib/menu-admin.ts` looks both halves up in `UPLOAD_REFUSALS`, where key and sentence sit in
   *   one object and cannot drift apart. What *can* drift is which reason points at which pair, so
   *   `lib/menu-admin.test.ts` walks that table.
   * - `plugins/error-handler.ts` is the relay, not a refusal of its own: it copies `messageKey` and
   *   `message` off the `AppError` it is serialising. There is nothing here to check, and it is
   *   listed because a walk that quietly dropped it would be a walk whose reach nobody could see.
   */
  it('leaves exactly the three computed sites unread', () => {
    // By file rather than by line: a comment edit above one of them is not a gate failure, and a
    // fourth computed site anywhere still changes this list.
    expect(computed.map((raise) => raise.file).sort()).toEqual([
      'lib/menu-admin.ts',
      'plugins/error-handler.ts',
      'routes/guest.ts',
    ]);
  });
});
