import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `scripts/validate-tokens.cjs` is the gate that keeps raw colours and sizes out of the app
 * source. It is exercised here against fixtures rather than the working tree, so the rules can
 * be pinned without depending on what the apps happen to contain today.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const script = join(repoRoot, 'scripts/validate-tokens.cjs');

let dir: string;

function run(target: string, cwd: string = repoRoot) {
  const result = spawnSync(process.execPath, [script, '--dir', target], {
    cwd,
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

function count(out: string, label: string): number {
  const match = new RegExp(`${label}: (\\d+)`).exec(out);
  return match ? Number(match[1]) : 0;
}

describe('validate-tokens', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'tabletap-validate-tokens-'));
    for (const sub of ['clean', 'dirty', 'packages/ui']) {
      mkdirSync(join(dir, sub), { recursive: true });
    }

    writeFileSync(
      join(dir, 'clean/component.tsx'),
      [
        "export const Ok = () => <div className='rounded-md border-[1px] bg-primary p-4 m-0' />;",
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, 'dirty/component.tsx'),
      "export const A = <i className='text-[#fff]' />;\n",
    );
    writeFileSync(
      join(dir, 'dirty/sizes.tsx'),
      "export const B = <i className='w-[300px] p-[13px] gap-[1.5rem]' />;\n",
    );
    writeFileSync(
      join(dir, 'dirty/raw.css'),
      '.panel {\n  background: rgba(28, 25, 23, 0.08);\n  border: 1px solid var(--border);\n  margin: 0;\n}\n',
    );
    // A test file may legitimately name colours: it is checking colour maths, not styling a surface.
    writeFileSync(join(dir, 'dirty/contrast.test.ts'), "export const c = '#123456';\n");
    // The generated stylesheet and the theme aliases are the definitions, not usages.
    writeFileSync(join(dir, 'packages/ui/tokens.css'), ':root {\n  --primary: #C23E18;\n}\n');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes a directory that uses tokens, 0 and 1px only', () => {
    const { status, out } = run(join(dir, 'clean'));
    expect(out).toContain('No token violations found');
    expect(status).toBe(0);
  });

  it('fails on raw hex, arbitrary px and rem utilities, and rgba()', () => {
    const { status, out } = run(join(dir, 'dirty'));
    expect(status).toBe(1);
    expect(out).toContain('Found 5 potential token violations');
    expect(count(out, 'Hardcoded hex color')).toBe(1);
    expect(count(out, 'Hardcoded pixel value')).toBe(2);
    expect(count(out, 'Hardcoded rem value')).toBe(1);
    expect(count(out, 'Hardcoded rgb\\(\\)/rgba\\(\\)/hsl\\(\\)/hsla\\(\\) color')).toBe(1);
  });

  it('reports the Tailwind arbitrary values by their literal text', () => {
    const { out } = run(join(dir, 'dirty'));
    for (const value of ['#fff', '300px', '13px', '1.5rem']) expect(out).toContain(value);
  });

  it('skips test files and the generated token stylesheets', () => {
    const { out } = run(join(dir, 'dirty'));
    expect(out).not.toContain('contrast.test.ts');
    const generated = run('packages/ui', dir);
    expect(generated.status).toBe(0);
  });
});
