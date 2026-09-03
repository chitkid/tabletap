import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `scripts/sync-brand-to-tokens.cjs` rewrites the token source in place, so it is exercised
 * against a throwaway copy of the repo layout rather than the working tree.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const TOKENS = 'assets/design-tokens.json';
const GUIDELINES = 'docs/brand-guidelines.md';

type Json = Record<string, unknown>;

function readJson(file: string): Json {
  return JSON.parse(readFileSync(file, 'utf8')) as Json;
}

function quickReferenceHex(markdown: string, role: string): string {
  const match = new RegExp(`${role} Color\\s*\\|\\s*(#[A-Fa-f0-9]{6})`, 'i').exec(markdown);
  if (!match) throw new Error(`no Quick Reference row for ${role}`);
  return match[1]!;
}

function scale(tokens: Json, name: string): Record<string, { $value: string }> {
  const primitive = tokens.primitive as { color: Record<string, unknown> };
  return primitive.color[name] as Record<string, { $value: string }>;
}

describe('brand sync', () => {
  let dir: string;
  let before: Json;
  let after: Json;
  let guidelines: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'tabletap-brand-sync-'));
    for (const sub of ['assets', 'docs', 'scripts', 'packages/ui']) {
      mkdirSync(join(dir, sub), { recursive: true });
    }
    for (const file of [TOKENS, GUIDELINES]) copyFileSync(join(repoRoot, file), join(dir, file));
    for (const script of [
      'sync-brand-to-tokens.cjs',
      'generate-tokens.cjs',
      'validate-tokens.cjs',
    ]) {
      copyFileSync(join(repoRoot, 'scripts', script), join(dir, 'scripts', script));
    }

    guidelines = readFileSync(join(dir, GUIDELINES), 'utf8');
    before = readJson(join(dir, TOKENS));
    execFileSync('node', ['scripts/sync-brand-to-tokens.cjs'], { cwd: dir, stdio: 'pipe' });
    after = readJson(join(dir, TOKENS));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('leaves the brand name alone', () => {
    expect(after.brand).toBe('TableTap / Little Furnace');
    expect(after.brand).toEqual(before.brand);
  });

  it('writes the three primitive scales named in the role map', () => {
    expect(scale(after, 'ember')['500']!.$value).toBe(quickReferenceHex(guidelines, 'Primary'));
    expect(scale(after, 'olive')['500']!.$value).toBe(quickReferenceHex(guidelines, 'Secondary'));
    expect(scale(after, 'ink')['500']!.$value).toBe(quickReferenceHex(guidelines, 'Accent'));
  });

  it('does not invent primary / secondary / accent primitives', () => {
    const colors = Object.keys((after.primitive as { color: Json }).color);
    expect(colors).not.toContain('primary');
    expect(colors).not.toContain('secondary');
    expect(colors).not.toContain('accent');
    expect(colors).toEqual(Object.keys((before.primitive as { color: Json }).color));
  });

  it('leaves the hand-authored layers untouched', () => {
    expect(after.semantic).toEqual(before.semantic);
    expect(after.dark).toEqual(before.dark);
    expect(after.component).toEqual(before.component);
  });

  it('leaves the neutral primitives untouched', () => {
    expect(scale(after, 'oat')).toEqual(scale(before, 'oat'));
    expect(scale(after, 'night')).toEqual(scale(before, 'night'));
    expect(scale(after, 'status')).toEqual(scale(before, 'status'));
  });

  it('regenerates packages/ui/tokens.css and writes no CSS beside the token source', () => {
    expect(existsSync(join(dir, 'assets/design-tokens.css'))).toBe(false);
    expect(existsSync(join(dir, 'packages/ui/tokens.css'))).toBe(true);
    expect(readFileSync(join(dir, 'packages/ui/tokens.css'), 'utf8')).toContain(
      '--primitive-color-ember-500',
    );
  });

  it('is idempotent', () => {
    execFileSync('node', ['scripts/sync-brand-to-tokens.cjs'], { cwd: dir, stdio: 'pipe' });
    expect(readJson(join(dir, TOKENS))).toEqual(after);
  });

  it('changes nothing under --dry-run', () => {
    const css = readFileSync(join(dir, 'packages/ui/tokens.css'), 'utf8');
    rmSync(join(dir, 'packages/ui/tokens.css'));
    execFileSync('node', ['scripts/sync-brand-to-tokens.cjs', '--dry-run'], {
      cwd: dir,
      stdio: 'pipe',
    });
    expect(existsSync(join(dir, 'packages/ui/tokens.css'))).toBe(false);
    expect(readJson(join(dir, TOKENS))).toEqual(after);
    execFileSync('node', ['scripts/sync-brand-to-tokens.cjs'], { cwd: dir, stdio: 'pipe' });
    expect(readFileSync(join(dir, 'packages/ui/tokens.css'), 'utf8')).toBe(css);
  });
});
