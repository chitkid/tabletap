// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./globals.css', import.meta.url)), 'utf8');
const reduceBlock = () => {
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  expect(start, 'the product has one reduced-motion rule').toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', css.indexOf('*::after', start)));
};

describe('the reduced-motion collapse', () => {
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
