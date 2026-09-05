import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { STATUS_STYLE } from './components/status-badge';
import { contrastRatio } from './lib/contrast';

type Token = { $value: string };
type Tree = { [k: string]: Tree | Token };
const tokens = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../assets/design-tokens.json', import.meta.url)),
    'utf8',
  ),
) as Tree;

const theme = readFileSync(fileURLToPath(new URL('../theme.css', import.meta.url)), 'utf8');

function get(path: string): string {
  const node = path
    .split('.')
    .reduce<Tree | Token | undefined>(
      (acc, key) => (acc && !('$value' in acc) ? acc[key] : undefined),
      tokens,
    );
  if (!node || !('$value' in node)) throw new Error(`token not found: ${path}`);
  // `in` cannot narrow past Tree's index signature, so the token shape is asserted here.
  const v = node.$value as string;
  const ref = /^\{(.+)\}$/.exec(v);
  return ref ? get(ref[1]!) : v;
}
const sem = (name: string) => get(`semantic.${name}`);
const dark = (name: string) => get(`dark.semantic.${name}`);

describe('design tokens', () => {
  it('resolve every semantic and dark reference', () => {
    const walk = (tree: Tree, prefix: string) => {
      for (const [k, v] of Object.entries(tree)) {
        if ('$value' in v) expect(() => get(`${prefix}${k}`), `${prefix}${k}`).not.toThrow();
        else walk(v as Tree, `${prefix}${k}.`);
      }
    };
    walk(tokens.semantic as Tree, 'semantic.');
    walk((tokens.dark as Tree).semantic as Tree, 'dark.semantic.');
    walk(tokens.component as Tree, 'component.');
  });
  it('guest surface passes WCAG AA', () => {
    expect(contrastRatio(sem('foreground'), sem('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(sem('muted-foreground'), sem('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(sem('primary-foreground'), sem('primary'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(sem('card-foreground'), sem('card'))).toBeGreaterThanOrEqual(4.5);
    for (const s of ['placed', 'paid', 'cooking', 'ready', 'served', 'cancelled'])
      expect(contrastRatio(sem(`status-${s}`), sem('background')), s).toBeGreaterThanOrEqual(3);
    // A badge label owes AA against its own fill, not just the 3:1 non-text bar against the page.
    // That gate is the whole-table one below, which reads the component's own classes.
  });
  /**
   * The bug this exists to stop: `status-cooking` took its label from `--foreground`, which follows
   * the surface, while its fill follows the status. On the guest surface that is a dark label on a
   * mid amber and reads; on the kitchen board both turned light and the label all but vanished, at
   * 1.60:1. Nothing measured a label against its own fill on the dark surface, so nothing caught it.
   *
   * The pairings are read out of `STATUS_STYLE` rather than copied here, so a class that changes
   * without the contrast being re-measured fails this test rather than drifting past it.
   */
  it('every status badge label clears AA against its own fill, on both surfaces', () => {
    const fillOf = (classes: string) => /(?:^|\s)bg-([a-z-]+)/.exec(classes)?.[1];
    const inkOf = (classes: string) => /(?:^|\s)text-([a-z-]+)/.exec(classes)?.[1];
    const kitchenInkOf = (classes: string) => /(?:^|\s)dark:text-([a-z-]+)/.exec(classes)?.[1];
    for (const [status, classes] of Object.entries(STATUS_STYLE)) {
      const fill = fillOf(classes);
      const ink = inkOf(classes);
      expect(fill, `${status} names a fill`).toBeDefined();
      expect(ink, `${status} names a label colour`).toBeDefined();
      expect(
        contrastRatio(sem(ink!), sem(fill!)),
        `${status}, guest and admin`,
      ).toBeGreaterThanOrEqual(4.5);
      // A status may need a different label colour on the kitchen board, because its fill is a
      // different colour there. If it does not say so, it keeps the one it has.
      expect(
        contrastRatio(dark(kitchenInkOf(classes) ?? ink!), dark(fill!)),
        `${status}, kitchen`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('kitchen surface passes WCAG AA', () => {
    expect(contrastRatio(dark('foreground'), dark('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark('muted-foreground'), dark('background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark('primary'), dark('background'))).toBeGreaterThanOrEqual(4.5);
    for (const s of ['placed', 'paid', 'cooking', 'ready', 'served', 'cancelled'])
      expect(contrastRatio(dark(`status-${s}`), dark('background')), s).toBeGreaterThanOrEqual(3);
    for (const t of ['ok', 'warn', 'late'])
      expect(contrastRatio(dark(`timer-${t}`), dark('background')), t).toBeGreaterThanOrEqual(3);
  });
  it('borders and input outlines meet the WCAG 1.4.11 non-text bar on both surfaces', () => {
    // A border is the only thing that says where a card or an input ends, so it is a
    // meaningful non-text element and owes 3:1 against whatever it is drawn on.
    for (const token of ['border', 'input']) {
      for (const surface of ['background', 'card']) {
        expect(
          contrastRatio(sem(token), sem(surface)),
          `${token} on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
        expect(
          contrastRatio(dark(token), dark(surface)),
          `dark ${token} on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('kitchen body size is at least 20px', () => {
    expect(parseFloat(sem('kitchen-body-size'))).toBeGreaterThanOrEqual(1.25); // rem
  });
  it('scales Tailwind text sizes on the kitchen surface (body 20px, nothing under 16px)', () => {
    const block = theme.slice(theme.indexOf("[data-surface='kitchen']"));
    expect(block).toMatch(/--text-xs:\s*1rem/);
    expect(block).toMatch(/--text-base:\s*1\.25rem/);
    expect(block).toMatch(/--text-xl:\s*1\.75rem/);
    expect(block).toMatch(/--text-2xl:\s*2rem/);
  });
  it('leaves the admin surface on the default spacing scale so its controls stay 44px', () => {
    const block = theme.slice(theme.indexOf("[data-surface='admin']"));
    expect(block.slice(0, block.indexOf('}'))).not.toMatch(/--spacing:/);
  });
});
