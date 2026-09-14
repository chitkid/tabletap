/**
 * **This file is deliberately wrong, in two places and only two.** It is what
 * `../no-mixed-normalisation.test.ts` points its scanner at to prove the scanner still fails on the
 * shape `login-form.test.tsx` shipped. A gate accepted on the strength of a green run over a clean
 * tree has been tested against nothing.
 *
 * Nothing here runs: `expect` is a local stub, so the file compiles and lints without pulling in a
 * test runner, and it sits outside every directory the real scan walks. The test asserts the two
 * bad assertions by their own text, and asserts that there are exactly two — which is what says
 * the three correct shapes below were left alone.
 */

const NBSP = String.fromCharCode(0xa0);
const plain = (s: string) => s.split(NBSP).join(' ');
const message = `Почта и${NBSP}пароль не${NBSP}подходят.`;
const element = { textContent: message, innerHTML: message };

/**
 * A stub with the shape of the matchers this rule is about. Never called — the scanner reads this
 * file, it does not run it. `void` on each parameter because the repository's eslint has no
 * `argsIgnorePattern`, and an underscore prefix is not a convention here.
 */
const expect = (subject: unknown) => {
  void subject;
  const swallow = (needle: unknown): undefined => void needle;
  return {
    toContain: swallow,
    toBe: swallow,
    toHaveTextContent: swallow,
    not: { toContain: swallow, toHaveTextContent: swallow },
  };
};

// WRONG — the negative form, which is the silent one: the needle has had its U+00A0
// removed and the subject has not, so there is no render that makes this fail.
expect(element.textContent).not.toContain(plain(message));

// WRONG — the same mistake positively. This one fails on the first run, so it never
// ships; it is here so the rule is not accidentally written to look only at `.not`.
expect(element.innerHTML).toContain(plain(message));

// RIGHT — the normaliser paired with a matcher that normalises the element too.
expect(element).toHaveTextContent(plain(message));
expect(element).not.toHaveTextContent(plain(message));

// RIGHT — raw against raw. The needle keeps the dictionary's bytes, so both sides agree.
expect(element.textContent).toContain(message);

// RIGHT — raw against an ASCII needle that has no U+00A0 to lose. This is the shape the wire's own
// English takes, and `plain()` would be meaningless on it.
expect(element.textContent).not.toContain('Invalid password');

export {};
