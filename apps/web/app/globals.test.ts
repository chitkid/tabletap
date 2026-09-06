// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');
const MEDIA_RULE = '@media (prefers-reduced-motion: reduce)';
const occurrences = css.split(MEDIA_RULE).length - 1;
const reduceBlock = () => {
  const start = css.indexOf(MEDIA_RULE);
  return css.slice(start, css.indexOf('\n}', css.indexOf('*::after', start)));
};

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const thisFile = fileURLToPath(import.meta.url);
/** Every source file under `apps/web` and `packages/ui/src`, this test file excluded (it names
 *  the very branch it is scanning for, in its own comments). */
const sourceFiles = (): string[] => {
  const roots = [path.join(repoRoot, 'apps/web'), path.join(repoRoot, 'packages/ui/src')];
  const files: string[] = [];
  for (const root of roots) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;
      if (entry.parentPath.includes(`${path.sep}node_modules${path.sep}`)) continue;
      if (entry.parentPath.includes(`${path.sep}.next${path.sep}`)) continue;
      const full = path.join(entry.parentPath, entry.name);
      if (full === thisFile) continue;
      files.push(full);
    }
  }
  return files;
};

describe('the reduced-motion collapse', () => {
  /**
   * The whole product's answer lives in exactly one rule. A second block appended anywhere in
   * `globals.css` would slip past `reduceBlock()` unnoticed — it only ever reads the first match
   * — so the one-rule claim has to be counted directly rather than inferred from the rest of this
   * suite passing.
   */
  it('is the one and only reduced-motion rule in globals.css', () => {
    expect(occurrences).toBe(1);
  });
  /**
   * The whole point of collapsing motion in one place is that no component reaches for its own
   * `motion-reduce:` branch instead. Nothing here proves that on its own, so it is scanned for
   * directly: a component writing one would still pass every other assertion in this file.
   */
  it('is not duplicated by a component reaching for its own motion-reduce: branch', () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes('motion-reduce:'));
    expect(offenders).toEqual([]);
  });
  /**
   * The whole product's answer to prefers-reduced-motion is this one rule, which is why no
   * component writes a branch of its own. It has to collapse waiting as well as moving: a
   * staggered entrance whose durations are instant but whose delays are not still arrives in
   * pieces, one block after another, for exactly the person who asked it not to.
   */
  it('collapses every duration and every delay, not only the durations', () => {
    const block = reduceBlock();
    for (const property of [
      'animation-duration',
      'animation-delay',
      'transition-duration',
      'transition-delay',
    ]) {
      expect(block, property).toMatch(
        new RegExp(`${property}:\\s*var\\(--motion-instant\\)\\s*!important`),
      );
    }
    expect(block).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });
  it('applies to every element and both its pseudo-elements', () => {
    const block = reduceBlock();
    expect(block).toContain('*,');
    expect(block).toContain('*::before,');
    expect(block).toContain('*::after');
  });
});
