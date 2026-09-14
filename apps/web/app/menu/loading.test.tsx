import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import ru from '../../messages/ru.json';
import MenuLoading from './loading';

// `useTranslations` resolves through `NextIntlClientProvider` in every environment vitest runs in.
const withProvider = (ui: ReactElement) => (
  <NextIntlClientProvider locale="ru" messages={ru}>
    {ui}
  </NextIntlClientProvider>
);

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const LOADING = read('./loading.tsx');
const MENU_SCREEN = read('../../components/menu/menu-screen.tsx');
const CATEGORY_NAV = read('../../components/menu/category-nav.tsx');
const DISH_CARD = read('../../components/menu/dish-card.tsx');

/**
 * The one literal `className="…"` in a source file that contains `needle`, or a thrown error.
 *
 * Throwing is the point, and so is insisting on exactly one match. The first version of this guard
 * returned `string | undefined` and compared two results with `toBe`, so the day either side moved
 * to `className={cn(…)}` — this repository's own idiom, used widely — it compared `undefined` with
 * `undefined` and went green for ever. A test that cannot fail is worse than no test, because it
 * sits in the place where a real guard would go.
 *
 * Addressed by content rather than by position, because position is not stable either: `CardSlot`
 * is declared above `MenuLoading`, so the first `className` in `loading.tsx` is a dish card's.
 */
function classListWith(source: string, needle: string, what: string): string {
  const found = [...source.matchAll(/className="([^"]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((value) => value.includes(needle));
  if (found.length !== 1 || found[0] === undefined || found[0].trim() === '')
    throw new Error(
      `expected exactly one literal className="…" containing "${needle}" in ${what}, found ` +
        `${found.length}. If it moved to className={cn(…)} or the class was renamed, this guard ` +
        `has stopped guarding and must be taught the new shape rather than deleted.`,
    );
  return found[0];
}

/** The static half of a `cn('…', …)` call — the classes an element always carries. */
function cnBase(source: string, what: string): string {
  const found = /cn\(\s*'([^']+)'/.exec(source)?.[1];
  if (found === undefined || found.trim() === '')
    throw new Error(`no cn('…') base class list found in ${what}`);
  return found;
}

/**
 * jsdom does no layout, so nothing in this file proves a pixel. What it pins is the *source* of the
 * geometry: every slot's height comes from the same classes the real component uses, so a change to
 * one side without the other fails here. The pixels were measured in a browser against the real
 * components' own server-rendered markup, and both numbers are recorded in
 * `.superpowers/sdd/2026-09-14-russian-localisation/task-5-report.md` §3.
 */
describe('the menu’s cold start', () => {
  it('says what it is doing instead of showing a wordless grey page', () => {
    render(withProvider(<MenuLoading />));
    expect(screen.getByRole('status')).toHaveTextContent(ru.guest.menu.loading);
  });

  it('puts the word inside the box the heading will take, so nothing moves when the menu lands', () => {
    render(withProvider(<MenuLoading />));
    // h-9 is 2.25rem, exactly the line box of the `text-3xl` h1 that replaces it. The line is
    // centred inside that box rather than sizing it, so the copy cannot change the height.
    const line = screen.getByText(ru.guest.menu.loading);
    expect(line.className).toContain('h-9');
    expect(line.className).not.toMatch(/\bmin-h-/);
  });

  it('reserves the menu screen’s own box — and cannot pass without finding both sides', () => {
    const loadingBox = classListWith(LOADING, 'max-w-2xl', 'app/menu/loading.tsx');
    const menuBox = classListWith(MENU_SCREEN, 'max-w-2xl', 'components/menu/menu-screen.tsx');
    // Asserted non-empty separately, so neither side can be missing and still "match".
    expect(loadingBox.length).toBeGreaterThan(0);
    expect(menuBox.length).toBeGreaterThan(0);
    expect(loadingBox).toBe(menuBox);
  });

  it('reserves the category nav’s whole box, not just the pill inside it', () => {
    // The real nav is `py-2` around a row of `h-11` pills: 8 + 44 + 8 = 60. Reserving the pill
    // alone is 16px short, which is exactly the shape the first version of this state had.
    expect(classListWith(CATEGORY_NAV, 'sticky', 'components/menu/category-nav.tsx')).toContain(
      'py-2',
    );
    expect(
      classListWith(CATEGORY_NAV, 'inline-flex', 'components/menu/category-nav.tsx'),
    ).toContain('h-11');
    expect(classListWith(LOADING, 'py-2', 'app/menu/loading.tsx')).toContain('py-2');
    expect(classListWith(LOADING, 'rounded-full', 'app/menu/loading.tsx')).toContain('h-11');
  });

  it('reserves a dish card’s own box, which its text column sizes and its plate does not', () => {
    // A card is as tall as name + description + allergens + price row, never as tall as its 96px
    // plate — so the box classes are compared outright, and the four rows' type classes with them.
    expect(classListWith(LOADING, 'flex gap-4', 'app/menu/loading.tsx')).toBe(
      cnBase(DISH_CARD, 'components/menu/dish-card.tsx'),
    );
    for (const row of ['gap-1', 'text-lg leading-tight', 'text-sm', 'text-xs', 'pt-2', 'size-24'])
      expect(classListWith(LOADING, row, 'app/menu/loading.tsx')).toContain(row);
  });

  it('reserves a section heading and six dishes, which reaches past the fold on a 375×812 phone', () => {
    const { container } = render(withProvider(<MenuLoading />));
    const [, , section] = [...screen.getByRole('status').children];
    expect(section?.className).toContain('gap-3');
    // One heading slot, then the dishes.
    expect(section?.children).toHaveLength(1 + 6);
    expect(container.querySelectorAll('.size-24')).toHaveLength(6);
  });
});
