// @vitest-environment node
// Default environment is jsdom, whose `URL` does not resolve `import.meta.url` to a file: URL —
// the same reason app/globals.test.ts and lib/forward-signature.test.ts pin this environment for
// the identical readFileSync(fileURLToPath(...)) idiom.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./layout.tsx', import.meta.url)), 'utf8');

describe('the document shell', () => {
  it('declares Russian, because html-has-lang cannot tell a wrong language from a right one', () => {
    expect(source).toMatch(/<html\s+lang="ru"/);
    expect(source).not.toMatch(/lang="en"/);
  });

  it('asks for the Cyrillic subset of every face it loads', () => {
    // Two `subsets:` arrays, one per face. Neither may ship without cyrillic: the display face was
    // chosen for having it, and the body face has had it all along and was never given it.
    const subsetArrays = [...source.matchAll(/subsets:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(subsetArrays).toHaveLength(2);
    for (const arr of subsetArrays) expect(arr).toContain("'cyrillic'");
  });
});
